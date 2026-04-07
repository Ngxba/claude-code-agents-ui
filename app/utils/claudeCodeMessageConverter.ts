/**
 * Convert Claude Code history messages to DisplayChatMessage format
 *
 * Claude Code JSONL format:
 * - Each entry has `type` (user/assistant/summary/file-history-snapshot)
 * - `message.content` is an ARRAY of content blocks:
 *   - { type: 'text', text: '...' }
 *   - { type: 'thinking', thinking: '...' }
 *   - { type: 'tool_use', name: '...', input: {...}, id: '...' }
 *   - { type: 'tool_result', tool_use_id: '...', content: '...' }
 */

import type { DisplayChatMessage } from '~/types'

interface ContentBlock {
  type: string
  text?: string
  thinking?: string
  name?: string
  input?: unknown
  id?: string
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
  [key: string]: unknown
}

interface ClaudeCodeMessage {
  uuid?: string
  parentUuid?: string | null
  sessionId: string
  timestamp: string
  type?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | ContentBlock[]
  }
  cwd?: string
  toolName?: string
  toolInput?: unknown
  toolUseResult?: unknown
  [key: string]: unknown
}

/**
 * Check if content appears to be a system message that should be filtered
 */
function isSystemMessage(content: string): boolean {
  if (!content) return false

  const systemPrefixes = [
    '<command-name>',
    '<command-message>',
    '<command-args>',
    '<local-command-stdout>',
    '<system-reminder>',
    'Caveat:',
    'This session is being continued from a previous',
    'Invalid API key',
    '[Request interrupted',
  ]

  return systemPrefixes.some(prefix => content.trim().startsWith(prefix)) ||
    content.includes('{"subtasks":')
}

/**
 * Extract text from tool result content
 */
function extractToolResultContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n')
  }
  return ''
}

/**
 * Convert Claude Code messages to DisplayChatMessage format
 */
export function convertClaudeCodeMessages(messages: ClaudeCodeMessage[]): DisplayChatMessage[] {
  const displayMessages: DisplayChatMessage[] = []

  // First pass: collect tool results by tool_use_id
  const toolResultsMap = new Map<string, { content: string; isError: boolean; toolUseResult?: any }>()

  for (const msg of messages) {
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const resultContent = extractToolResultContent(block.content)
          toolResultsMap.set(block.tool_use_id, {
            content: resultContent,
            isError: block.is_error || false,
            toolUseResult: msg.toolUseResult
          })
        }
      }
    }
  }

  // Second pass: convert messages
  for (const msg of messages) {
    // Skip non-message entries
    if (msg.type === 'summary' || msg.type === 'file-history-snapshot') {
      continue
    }

    const content = msg.message?.content

    // Handle user messages
    if (msg.type === 'user' || msg.message?.role === 'user') {
      let textContent = ''

      if (typeof content === 'string') {
        textContent = content
      } else if (Array.isArray(content)) {
        // Extract text from content blocks
        textContent = content
          .filter(block => block.type === 'text' && block.text)
          .map(block => block.text)
          .join('\n')
      }

      // Skip system messages
      if (isSystemMessage(textContent)) {
        continue
      }

      if (textContent.trim()) {
        displayMessages.push({
          id: msg.uuid || `user-${msg.timestamp}`,
          role: 'user',
          content: textContent,
          timestamp: msg.timestamp,
          kind: 'text'
        })
      }
    }

    // Handle assistant messages - parse content array
    else if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
      if (Array.isArray(content)) {
        for (const block of content) {
          // Thinking blocks
          if (block.type === 'thinking' && block.thinking) {
            displayMessages.push({
              id: `${msg.uuid}-thinking-${block.thinking.slice(0, 20)}`,
              role: 'assistant',
              content: block.thinking,
              timestamp: msg.timestamp,
              kind: 'thinking',
              thinking: block.thinking
            })
          }

          // Text blocks
          else if (block.type === 'text' && block.text) {
            // Skip internal content
            if (isSystemMessage(block.text)) {
              continue
            }

            displayMessages.push({
              id: `${msg.uuid}-text-${block.text.slice(0, 20)}`,
              role: 'assistant',
              content: block.text,
              timestamp: msg.timestamp,
              kind: 'text'
            })
          }

          // Tool use blocks
          else if (block.type === 'tool_use' && block.name) {
            const toolResult = block.id ? toolResultsMap.get(block.id) : undefined
            
            // Check if this is an AskUserQuestion
            const isAskUserQuestion = ['askuserquestion', 'ask_user', 'askuser', 'ask_user_question', 'prompt', 'input_request'].includes(block.name.toLowerCase())
            
            if (isAskUserQuestion) {
              // Extract answers if present
              let resolvedAnswer: string | undefined
              if (toolResult?.toolUseResult?.answers) {
                resolvedAnswer = Object.values(toolResult.toolUseResult.answers as Record<string, string>).join(', ')
              }

              displayMessages.push({
                id: block.id || `${msg.uuid}-tool-${block.name}`,
                role: 'assistant',
                timestamp: msg.timestamp,
                kind: 'permission_request',
                toolName: block.name,
                toolInput: block.input,
                content: (block.input as any)?.question,
                resolvedDecision: toolResult ? 'allow' : undefined,
                resolvedAnswer
              })
            } else {
              displayMessages.push({
                id: block.id || `${msg.uuid}-tool-${block.name}`,
                role: 'assistant',
                content: '',
                timestamp: msg.timestamp,
                kind: 'tool_use',
                toolName: block.name,
                toolInput: block.input,
                toolResult: toolResult ? {
                  content: toolResult.content,
                  isError: toolResult.isError
                } : undefined
              })
            }
          }
        }
      } else if (typeof content === 'string' && content.trim()) {
        // Simple string content
        if (!isSystemMessage(content)) {
          displayMessages.push({
            id: msg.uuid || `assistant-${msg.timestamp}`,
            role: 'assistant',
            content: content,
            timestamp: msg.timestamp,
            kind: 'text'
          })
        }
      }
    }

    // Handle standalone tool entries (older format)
    else if (msg.toolName) {
      displayMessages.push({
        id: msg.uuid || `tool-${msg.timestamp}`,
        role: 'assistant',
        content: '',
        timestamp: msg.timestamp,
        kind: 'tool_use',
        toolName: msg.toolName,
        toolInput: msg.toolInput,
        toolResult: msg.toolUseResult
      })
    }
  }

  // Sort by timestamp
  displayMessages.sort((a, b) =>
    new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  )

  return displayMessages
}

/**
 * Check if a message array contains any displayable content
 */
export function hasDisplayableContent(messages: ClaudeCodeMessage[]): boolean {
  return messages.some(msg => {
    if (msg.type === 'summary' || msg.type === 'file-history-snapshot') return false

    const content = msg.message?.content

    if (msg.type === 'user' || msg.message?.role === 'user') {
      if (typeof content === 'string') {
        return content.trim() && !isSystemMessage(content)
      }
      if (Array.isArray(content)) {
        const text = content.filter(b => b.type === 'text' && b.text).map(b => b.text).join('')
        return text.trim() && !isSystemMessage(text)
      }
    }

    if (msg.type === 'assistant' || msg.message?.role === 'assistant') {
      if (Array.isArray(content)) {
        return content.some(block =>
          (block.type === 'text' && block.text && !isSystemMessage(block.text)) ||
          block.type === 'thinking' ||
          block.type === 'tool_use'
        )
      }
      if (typeof content === 'string') {
        return content.trim() && !isSystemMessage(content)
      }
    }

    if (msg.toolName) return true

    return false
  })
}
