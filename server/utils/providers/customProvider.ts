// server/utils/providers/customProvider.ts
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import type { Peer } from 'crossws'
import type { ProviderAdapter, ProviderInfo, ProviderQueryOptions } from './types'
import type { NormalizedMessage, ProviderFetchOptions, ProviderFetchResult } from '~/types'
import { MODEL_ALIAS } from '../models'
import type { ProviderEntry } from './providerConfig'

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

  async query(prompt: string, options: ProviderQueryOptions, ws: Peer): Promise<void> {
    const sessionId = options.sessionId ?? randomUUID()
    const controller = new AbortController()
    this.activeControllers.set(sessionId, controller)

    const client = new Anthropic({
      baseURL: this.entry.baseUrl,
      apiKey: this.entry.authToken,
    })

    const model = this.resolveModel(options.model ?? 'sonnet')

    const send = (msg: NormalizedMessage) => ws.send(JSON.stringify(msg))

    try {
      const stream = await client.messages.create(
        {
          model,
          max_tokens: 8096,
          ...(options.agentInstructions ? { system: options.agentInstructions } : {}),
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        },
        { signal: controller.signal }
      )

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send({
            kind: 'stream_delta',
            id: randomUUID(),
            sessionId,
            timestamp: new Date().toISOString(),
            content: event.delta.text,
            provider: this.name,
          })
        }
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

  async fetchHistory(_sessionId: string, _options: ProviderFetchOptions): Promise<ProviderFetchResult> {
    return { messages: [], total: 0, hasMore: false }
  }
}

export function customProviderInfo(entry: ProviderEntry): ProviderInfo {
  return {
    name: entry.name,
    displayName: entry.displayName || 'Custom Provider',
    description: `Custom Anthropic-compatible provider at ${entry.baseUrl ?? ''}`,
    models: ['opus', 'sonnet', 'haiku'],
    supportsPermissions: false,
    supportsImages: false,
    supportsInterrupt: true,
  }
}
