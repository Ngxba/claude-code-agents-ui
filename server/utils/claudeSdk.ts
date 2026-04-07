import { query } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { normalizeSDKMessage } from './messageNormalizer'
import { resolveClaudePath } from './claudeDir'
import { safeClaudePath } from './path-security'
import { parseFrontmatter } from './frontmatter'
import type { Peer } from 'crossws'
import type { NormalizedMessage } from '~/types'

interface QueryOptions {
  agentSlug?: string
  agentInstructions?: string
  sessionId?: string
  workingDir?: string
  model?: string
}

// Store active query instances for interruption
interface QueryInstance {
  interrupt(): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<any>
}

const activeQueries = new Map<string, QueryInstance>()

/**
 * Query Claude SDK and stream responses via WebSocket
 * Following the pattern from claudecodeui
 */
export async function queryClaudeChat(
  prompt: string,
  options: QueryOptions,
  ws: Peer
): Promise<void> {
  let capturedSessionId = options.sessionId || null
  let sessionCreatedSent = false
  let accumulatedText = '' // Track streaming text to save as final message
  let hasTextMessageFromResult = false // Track if we got a text message from SDK result

  try {
    // Prepare SDK options — default to 'default' permission mode for safety.
    // Users must explicitly request bypassPermissions from the client.
    const sdkOptions: any = {
      cwd: options.workingDir || process.cwd(),
      permissionMode: 'default',
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
    // No app-level storage check needed — the SDK is the source of truth.
    if (options.sessionId) {
      sdkOptions.resume = options.sessionId
    }

    // Add model if specified
    if (options.model) {
      sdkOptions.model = options.model
    }

    console.log('[Claude SDK] Starting query with options:', {
      hasSessionId: !!capturedSessionId,
      cwd: sdkOptions.cwd,
      model: sdkOptions.model,
    })

    // Create query instance
    const queryInstance = query({
      prompt,
      options: sdkOptions,
    })

    // Stream responses (following claudecodeui pattern)
    for await (const message of queryInstance) {
      // Capture session ID from SDK (for new sessions)
      if (message.session_id && !capturedSessionId) {
        capturedSessionId = message.session_id
        activeQueries.set(capturedSessionId, queryInstance)

        // Send session-created event only once for new sessions
        if (!options.sessionId && !sessionCreatedSent) {
          sessionCreatedSent = true
          sendMessage(ws, {
            kind: 'session_created',
            id: randomUUID(),
            sessionId: capturedSessionId,
            timestamp: new Date().toISOString(),
            content: capturedSessionId,
          })
        }
      }

      // Normalize SDK message (handles thinking, tool_use, text, etc.)
      const normalized = normalizeSDKMessage(message, capturedSessionId || options.sessionId || 'unknown')

      // Send all normalized messages
      for (const msg of normalized) {
        sendMessage(ws, msg)

        // Accumulate streaming text deltas
        if (msg.kind === 'stream_delta' && msg.content) {
          accumulatedText += msg.content
        }

        // Track if we got a text message from SDK result (to avoid duplicates)
        if (msg.kind === 'text' && msg.role === 'assistant') {
          hasTextMessageFromResult = true
        }
      }
    }

    // Send complete message
    const completeMsg: NormalizedMessage = {
      kind: 'complete',
      id: randomUUID(),
      sessionId: capturedSessionId || options.sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      content: '',
    }
    sendMessage(ws, completeMsg)

    console.log('[Claude SDK] Query completed:', capturedSessionId)
  } catch (error: any) {
    console.error('[Claude SDK] Error:', error)

    const errorMsg: NormalizedMessage = {
      kind: 'error',
      id: randomUUID(),
      sessionId: capturedSessionId || options.sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      content: error.message || 'An error occurred',
    }
    sendMessage(ws, errorMsg)
  } finally {
    // Cleanup
    if (capturedSessionId) {
      activeQueries.delete(capturedSessionId)
    }
  }
}

/**
 * Interrupt an active query
 */
export async function interruptQuery(sessionId: string): Promise<boolean> {
  const queryInstance = activeQueries.get(sessionId)
  if (queryInstance) {
    try {
      await queryInstance.interrupt()
      activeQueries.delete(sessionId)
      return true
    } catch (error) {
      console.error('[Claude SDK] Error interrupting query:', error)
      return false
    }
  }
  return false
}

/**
 * Send a normalized message via WebSocket
 */
function sendMessage(ws: Peer, message: NormalizedMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error('[Claude SDK] Error sending message:', error)
  }
}

/**
 * Load agent instructions from agent slug
 */
export async function loadAgentInstructions(agentSlug: string): Promise<string | null> {
  try {
    const agentPath = safeClaudePath('agents', `${agentSlug}.md`)
    const content = await fs.readFile(agentPath, 'utf-8')

    // Parse frontmatter to get body
    const { body } = parseFrontmatter(content)
    return body || null
  } catch (error) {
    console.error(`[Claude SDK] Failed to load agent ${agentSlug}:`, error)
    return null
  }
}
