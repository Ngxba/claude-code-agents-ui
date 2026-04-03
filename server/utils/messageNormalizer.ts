import { randomUUID } from 'node:crypto'
import type { NormalizedMessage } from '~/types'

/**
 * Normalize Claude SDK messages into our unified format
 * Following the pattern from claudecodeui's adapter
 */
export function normalizeSDKMessage(
  sdkMessage: any,
  sessionId: string
): NormalizedMessage[] {
  const timestamp = new Date().toISOString()
  const messages: NormalizedMessage[] = []

  // Handle stream events (real-time streaming)
  if (sdkMessage.type === 'stream_event' && sdkMessage.event) {
    const evt = sdkMessage.event

    // Text delta
    if (evt.type === 'content_block_delta') {
      if (evt.delta?.type === 'text_delta' && evt.delta.text) {
        messages.push({
          kind: 'stream_delta',
          id: randomUUID(),
          sessionId,
          timestamp,
          role: 'assistant',
          content: evt.delta.text,
        })
      } else if (evt.delta?.type === 'thinking_delta' && evt.delta.thinking) {
        messages.push({
          kind: 'thinking',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: evt.delta.thinking,
        })
      } else if (evt.delta?.type === 'input_json_delta' && evt.delta.partial_json) {
        // Tool input being accumulated - send as separate message for buffering
        messages.push({
          kind: 'tool_input_delta',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: evt.delta.partial_json,
        } as any) // Cast because tool_input_delta is not in standard types
      }
    }

    // Content block start (for thinking and tool_use)
    if (evt.type === 'content_block_start') {
      if (evt.content_block?.type === 'thinking') {
        messages.push({
          kind: 'thinking',
          id: randomUUID(),
          sessionId,
          timestamp,
          content: '',
        })
      } else if (evt.content_block?.type === 'tool_use') {
        // Start of tool use block - capture tool name and ID
        messages.push({
          kind: 'tool_use',
          id: randomUUID(),
          sessionId,
          timestamp,
          toolName: evt.content_block.name || 'tool',
          toolId: evt.content_block.id,
          toolInput: {},
          metadata: {
            toolUseId: evt.content_block.id,
          },
        })
      }
    }

    // Stream end
    if (evt.type === 'content_block_stop') {
      messages.push({
        kind: 'stream_end',
        id: randomUUID(),
        sessionId,
        timestamp,
      })
    }
  }

  // Handle system messages (local command output from slash commands)
  if (sdkMessage.type === 'system') {
    if (sdkMessage.subtype === 'local_command_output') {
      messages.push({
        kind: 'text',
        id: sdkMessage.uuid || randomUUID(),
        sessionId,
        timestamp,
        role: 'assistant',
        content: sdkMessage.content || '',
      })
    }
    // Other system subtypes (init, etc.) are silently ignored
  }

  // Handle tool progress (Anthropic SDK tool execution)
  if (sdkMessage.type === 'tool_progress') {
    messages.push({
      kind: 'tool_use',
      id: randomUUID(),
      sessionId,
      timestamp,
      toolName: sdkMessage.tool_name,
      toolInput: undefined,
      metadata: {
        elapsed: sdkMessage.elapsed_time_seconds,
        status: 'running',
      },
    })
  }

  // Handle tool result (Anthropic SDK tool results)
  if (sdkMessage.type === 'tool_result') {
    messages.push({
      kind: 'tool_result',
      id: randomUUID(),
      sessionId,
      timestamp,
      toolId: sdkMessage.tool_use_id,
      content: sdkMessage.content || '',
      isError: sdkMessage.is_error || false,
    })
  }

  // Handle result (final result with full content)
  // Only check for explicit result type - don't use 'result' in sdkMessage as it's too broad
  if (sdkMessage.type === 'result') {
    const resultText = sdkMessage.result || ''
    // Don't create text message here - the streaming flow handles text display
    // This result is used by claudeProvider for save logic only
    // Mark that we received a result for tracking purposes
    if (resultText && !isInternalContent(resultText)) {
      // Result text is available but we don't create a duplicate text message
      // The accumulated stream_delta content will be finalized to text by the frontend
    }

    // Add stop reason as complete message
    if (sdkMessage.stop_reason) {
      messages.push({
        kind: 'complete',
        id: randomUUID(),
        sessionId,
        timestamp,
        content: '',
        metadata: {
          stopReason: sdkMessage.stop_reason,
          modelUsage: sdkMessage.modelUsage,
        },
      })
    }
  }

  return messages
}

/**
 * Check if content should be filtered out (internal system messages)
 */
export function isInternalContent(content: string): boolean {
  if (!content) return false

  const internalPatterns = [
    /<system-reminder>/i,
    /<\/system-reminder>/i,
    /<claude_background_info>/i,
    /<\/claude_background_info>/i,
  ]

  return internalPatterns.some((pattern) => pattern.test(content))
}

/**
 * Filter internal content from a message
 */
export function filterInternalContent(message: NormalizedMessage): NormalizedMessage {
  if (message.content && isInternalContent(message.content)) {
    // Remove or redact internal content
    return {
      ...message,
      content: message.content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ''),
    }
  }
  return message
}

/**
 * Merge tool results with their corresponding tool uses
 * This makes it easier to display them together in the UI
 */
export function attachToolResults(messages: NormalizedMessage[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = []
  const toolUseMap = new Map<string, NormalizedMessage>()

  for (const message of messages) {
    if (message.kind === 'tool_use') {
      const toolUseId = message.metadata?.toolUseId || message.id
      toolUseMap.set(toolUseId, message)
      result.push(message)
    } else if (message.kind === 'tool_result') {
      const toolUseId = message.metadata?.toolUseId
      const toolUse = toolUseId ? toolUseMap.get(toolUseId) : null

      if (toolUse) {
        // Attach result to the tool use message
        result[result.indexOf(toolUse)] = {
          ...toolUse,
          toolResult: message.toolResult,
          isError: message.isError,
          metadata: {
            ...toolUse.metadata,
            resultId: message.id,
            resultTimestamp: message.timestamp,
          },
        }
      } else {
        // Orphaned tool result, add it anyway
        result.push(message)
      }
    } else {
      result.push(message)
    }
  }

  return result
}
