import { query } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import type { Peer } from 'crossws'
import type { NormalizedMessage, ProviderFetchOptions } from '~/types'
import type { ProviderAdapter, ProviderQueryOptions, ProviderInfo } from './types'
import { normalizeSDKMessage } from '../messageNormalizer'
import { resolveClaudePath } from '../claudeDir'
import { safeClaudePath } from '../path-security'
import { parseFrontmatter } from '../frontmatter'
import { detectSdkSession, loadSdkSessionMessages } from '../sdkSessionStorage'
import { MODEL_ALIAS_KEY } from '../models'

// Store active query instances for interruption
interface QueryInstance {
  interrupt(): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<any>
}

const activeQueries = new Map<string, QueryInstance>()

/**
 * Map permission mode to SDK format
 */
function mapPermissionMode(mode?: string): string {
  switch (mode) {
    case 'default':
      return 'default'
    case 'skip':
      return 'skip'
    case 'acceptEdits':
      return 'acceptEdits'
    case 'bypassPermissions':
      return 'bypassPermissions'
    case 'plan':
      return 'plan'
    default:
      return 'default' // Safe default — require explicit opt-in for bypassPermissions
  }
}

/**
 * Claude provider adapter implementation.
 * Follows the claudecodeui pattern:
 * - No custom storage writes — the SDK writes to ~/.claude/projects/ natively
 * - Always pass `resume: sessionId` for any real session ID
 * - Let the SDK decide whether to resume or start fresh (it knows its own sessions)
 */
export const claudeProvider: ProviderAdapter = {
  name: 'claude',

  async query(prompt: string, options: ProviderQueryOptions, ws: Peer): Promise<void> {
    let capturedSessionId: string | null = null
    let sessionCreatedSent = false
    let accumulatedText = ''
    let hasTextMessageFromResult = false

    try {
      // Prepare SDK options
      const sdkOptions: any = {
        cwd: options.workingDir || process.cwd(),
        permissionMode: mapPermissionMode(options.permissionMode),
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        maxTurns: 10,
        includePartialMessages: true,
      }

      // Add system prompt configuration
      if (options.agentInstructions) {
        sdkOptions.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: options.agentInstructions,
        }
      } else {
        sdkOptions.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
        }
      }

      // claudecodeui pattern: always pass resume if there's a real session ID.
      // The SDK will resume the thread if the session exists, or start fresh if not.
      // No app-level storage check needed — the SDK is the source of truth.
      const isRealSessionId = options.sessionId && !options.sessionId.startsWith('new-session-')
      if (isRealSessionId) {
        sdkOptions.resume = options.sessionId
        capturedSessionId = options.sessionId ?? null
        console.log('[ClaudeProvider] Resuming SDK session:', options.sessionId)
      } else {
        console.log('[ClaudeProvider] Starting new SDK session')
      }

      // Add model if specified
      if (options.model) {
        sdkOptions.model = options.model
      }

      // Add effort level (controls thinking depth)
      if (options.effort) {
        sdkOptions.effort = options.effort
      }

      console.log('[ClaudeProvider] Starting query with options:', {
        hasSessionId: !!options.sessionId,
        isResume: isRealSessionId,
        cwd: sdkOptions.cwd,
        model: sdkOptions.model,
        permissionMode: sdkOptions.permissionMode,
      })

      // Create query instance
      const queryInstance = query({
        prompt,
        options: sdkOptions,
      })

      // Stream responses
      for await (const message of queryInstance) {
        // Capture session ID from SDK (first message for new sessions)
        if (message.session_id && !capturedSessionId) {
          capturedSessionId = message.session_id
          activeQueries.set(capturedSessionId, queryInstance)

          // New session: emit session_created so frontend updates its session ID
          if (!sessionCreatedSent) {
            sessionCreatedSent = true
            sendMessage(ws, {
              kind: 'session_created',
              id: randomUUID(),
              sessionId: capturedSessionId,
              timestamp: new Date().toISOString(),
              content: capturedSessionId,
              newSessionId: capturedSessionId,
              provider: 'claude',
            })
          }
        } else if (isRealSessionId && capturedSessionId && !activeQueries.has(capturedSessionId)) {
          // Register resumed session's query instance for interrupt support
          activeQueries.set(capturedSessionId, queryInstance)
        }

        // Normalize SDK message
        const normalized = normalizeSDKMessage(message, capturedSessionId || 'unknown')

        // Stream all normalized messages to the client
        for (const msg of normalized) {
          const msgWithProvider: NormalizedMessage = {
            ...msg,
            provider: 'claude',
          }
          sendMessage(ws, msgWithProvider)

          // Accumulate streaming text deltas
          if (msg.kind === 'stream_delta' && msg.content) {
            accumulatedText += msg.content
          }

          if (msg.kind === 'text' && msg.role === 'assistant') {
            hasTextMessageFromResult = true
          }
        }
      }

      // Send complete message
      const completeMsg: NormalizedMessage = {
        kind: 'complete',
        id: randomUUID(),
        sessionId: capturedSessionId || 'unknown',
        timestamp: new Date().toISOString(),
        content: '',
        provider: 'claude',
      }
      sendMessage(ws, completeMsg)

      console.log('[ClaudeProvider] Query completed:', capturedSessionId)
    } catch (error: any) {
      console.error('[ClaudeProvider] Error:', error)

      const errorMsg: NormalizedMessage = {
        kind: 'error',
        id: randomUUID(),
        sessionId: capturedSessionId || 'unknown',
        timestamp: new Date().toISOString(),
        content: error.message || 'An error occurred',
        provider: 'claude',
      }
      sendMessage(ws, errorMsg)
    } finally {
      if (capturedSessionId) {
        activeQueries.delete(capturedSessionId)
      }
    }
  },

  async interrupt(sessionId: string): Promise<boolean> {
    const queryInstance = activeQueries.get(sessionId)
    if (queryInstance) {
      try {
        await queryInstance.interrupt()
        activeQueries.delete(sessionId)
        return true
      } catch (error) {
        console.error('[ClaudeProvider] Error interrupting query:', error)
        return false
      }
    }
    return false
  },

  normalizeMessage(raw: any, sessionId: string): NormalizedMessage[] {
    return normalizeSDKMessage(raw, sessionId)
  },

  async fetchHistory(sessionId: string, options: ProviderFetchOptions) {
    // Read directly from SDK's native project storage
    const projectName = await detectSdkSession(sessionId)
    if (projectName) {
      const result = await loadSdkSessionMessages(projectName, sessionId, {
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      })
      return {
        messages: result.messages as NormalizedMessage[],
        total: result.total,
        hasMore: result.hasMore,
      }
    }

    return {
      messages: [],
      total: 0,
      hasMore: false,
    }
  },

  async loadAgentInstructions(agentSlug: string): Promise<string | null> {
    try {
      const agentPath = safeClaudePath('agents', `${agentSlug}.md`)
      const content = await fs.readFile(agentPath, 'utf-8')
      const { body } = parseFrontmatter(content)
      return body || null
    } catch (error) {
      console.error(`[ClaudeProvider] Failed to load agent ${agentSlug}:`, error)
      return null
    }
  },
}

/**
 * Send a normalized message via WebSocket
 */
function sendMessage(ws: Peer, message: NormalizedMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error('[ClaudeProvider] Error sending message:', error)
  }
}

/**
 * Provider info for registration
 */
export const claudeProviderInfo: ProviderInfo = {
  name: 'claude',
  displayName: 'Claude',
  description: 'Anthropic Claude via Claude Agent SDK',
  models: Object.values(MODEL_ALIAS_KEY),
  supportsPermissions: true,
  supportsImages: true,
  supportsInterrupt: true,
}
