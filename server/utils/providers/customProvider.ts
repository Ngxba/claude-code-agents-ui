// server/utils/providers/customProvider.ts
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Peer } from 'crossws'
import type { ProviderAdapter, ProviderInfo, ProviderQueryOptions } from './types'
import type { NormalizedMessage, ProviderFetchOptions, ProviderFetchResult } from '~/types'
import { getClaudeDir } from '../claudeDir'
import { detectSdkSession, loadSdkSessionMessages } from '../sdkSessionStorage'
import { DEFAULT_MODEL_ALIAS, MODEL_ALIAS, MODEL_ALIAS_KEY } from '../models'
import type { ProviderEntry } from './providerConfig'

interface PersistedChatMessage {
  sessionId: string
  timestamp: string
  cwd?: string
  provider: string
  role: 'user' | 'assistant'
  content: string
  message: {
    role: 'user' | 'assistant'
    content: string
  }
  metadata?: Record<string, unknown>
}

export class CustomAnthropicProvider implements ProviderAdapter {
  name: string
  private entry: ProviderEntry
  private activeControllers = new Map<string, AbortController>()

  constructor(entry: ProviderEntry) {
    this.entry = entry
    this.name = entry.name
  }

  private resolveModel(tier: string): string {
    const mappings = this.entry.modelMappings ?? {}
    return mappings[tier as keyof typeof mappings] ?? MODEL_ALIAS[tier] ?? tier
  }

  private getProjectName(workingDir?: string): string {
    if (!workingDir) return 'unknown-project'
    return workingDir.replace(/\//g, '-') || basename(workingDir)
  }

  private async persistMessage(message: PersistedChatMessage, workingDir?: string): Promise<void> {
    const projectName = this.getProjectName(workingDir)
    const projectDir = join(getClaudeDir(), 'projects', projectName)
    const filePath = join(projectDir, `custom-${message.sessionId}.jsonl`)

    await mkdir(projectDir, { recursive: true })
    await appendFile(filePath, `${JSON.stringify(message)}\n`, 'utf8')
  }

  async query(prompt: string, options: ProviderQueryOptions, ws: Peer): Promise<void> {
    const sessionId = options.sessionId ?? randomUUID()
    const controller = new AbortController()
    this.activeControllers.set(sessionId, controller)

    const model = this.resolveModel(options.model ?? DEFAULT_MODEL_ALIAS)
    const baseUrl = this.entry.baseUrl?.replace(/\/$/, '') ?? ''
    let accumulatedText = ''

    const send = (msg: NormalizedMessage) => ws.send(JSON.stringify(msg))

    try {
      if (!options.sessionId) {
        send({
          kind: 'session_created',
          id: randomUUID(),
          sessionId,
          timestamp: new Date().toISOString(),
          content: sessionId,
          newSessionId: sessionId,
          provider: this.name,
        })
      }

      await this.persistMessage({
        sessionId,
        timestamp: new Date().toISOString(),
        cwd: options.workingDir,
        provider: this.name,
        role: 'user',
        content: prompt,
        message: {
          role: 'user',
          content: prompt,
        },
        metadata: {
          agentSlug: options.agentSlug,
          workingDir: options.workingDir,
          permissionMode: options.permissionMode,
          images: options.images,
          model,
        },
      }, options.workingDir)

      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.entry.authToken}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8096,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
          ...(options.agentInstructions ? { system: options.agentInstructions } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`${response.status} ${body || response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              accumulatedText += parsed.delta.text
              send({
                kind: 'stream_delta',
                id: randomUUID(),
                sessionId,
                timestamp: new Date().toISOString(),
                content: parsed.delta.text,
                provider: this.name,
              })
            }
          }
          catch {
            // skip malformed SSE lines
          }
        }
      }

      if (accumulatedText) {
        await this.persistMessage({
          sessionId,
          timestamp: new Date().toISOString(),
          cwd: options.workingDir,
          provider: this.name,
          role: 'assistant',
          content: accumulatedText,
          message: {
            role: 'assistant',
            content: accumulatedText,
          },
          metadata: {
            agentSlug: options.agentSlug,
            workingDir: options.workingDir,
            model,
          },
        }, options.workingDir)
      }

      send({ kind: 'stream_end', id: randomUUID(), sessionId, timestamp: new Date().toISOString(), content: '', provider: this.name })
      send({ kind: 'complete', id: randomUUID(), sessionId, timestamp: new Date().toISOString(), content: '', provider: this.name })
    }
    catch (err: any) {
      if (err.name !== 'AbortError') {
        send({ kind: 'error', id: randomUUID(), sessionId, timestamp: new Date().toISOString(), content: err.message ?? 'Unknown error', provider: this.name })
      }
    }
    finally {
      this.activeControllers.delete(sessionId)
    }
  }

  async interrupt(sessionId: string): Promise<boolean> {
    const controller = this.activeControllers.get(sessionId)
    if (!controller) return false
    controller.abort()
    this.activeControllers.delete(sessionId)
    return true
  }

  normalizeMessage(_raw: any, _sessionId: string): NormalizedMessage[] {
    return []
  }

  async fetchHistory(sessionId: string, options: ProviderFetchOptions): Promise<ProviderFetchResult> {
    const projectName = await detectSdkSession(sessionId)
    if (!projectName) {
      return { messages: [], total: 0, hasMore: false }
    }

    const result = await loadSdkSessionMessages(projectName, sessionId, {
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
    })

    return { messages: result.messages, total: result.total, hasMore: result.hasMore }
  }
}

export function customProviderInfo(entry: ProviderEntry): ProviderInfo {
  return {
    name: entry.name,
    displayName: entry.displayName || 'Custom Provider',
    description: `Custom Anthropic-compatible provider at ${entry.baseUrl ?? ''}`,
    models: Object.values(MODEL_ALIAS_KEY),
    supportsPermissions: false,
    supportsImages: false,
    supportsInterrupt: true,
  }
}
