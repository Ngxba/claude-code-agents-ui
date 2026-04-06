import type {
  NormalizedMessage,
  DisplayChatMessage,
  PendingPermission,
  TaskProgress,
  InteractivePrompt,
} from '~/types'

/**
 * Convert NormalizedMessage array to DisplayChatMessage array.
 * This handles:
 * - Filtering ephemeral messages (stream_delta, stream_end)
 * - Attaching tool results to their corresponding tool_use messages
 * - Converting permission requests to interactive UI format
 * - Converting task notifications to progress UI format
 */
export function convertToDisplayMessages(
  messages: NormalizedMessage[],
  streamingText?: string,
  options: {
    fallbackProvider?: string
    fallbackModel?: string
  } = {}
): DisplayChatMessage[] {
  const displayMessages: DisplayChatMessage[] = []
  const toolResultsMap = new Map<string, any>()

  // First pass: collect tool results by toolId
  for (const msg of messages) {
    if (msg.kind === 'tool_result' && msg.toolId) {
      toolResultsMap.set(msg.toolId, {
        result: msg.toolResult,
        isError: msg.isError,
        content: msg.content,
      })
    }
  }

  // Second pass: convert messages to display format
  for (const msg of messages) {
    // Skip ephemeral messages
    if (msg.kind === 'stream_delta' || msg.kind === 'stream_end') {
      continue
    }

    // Skip session_created (handled separately)
    if (msg.kind === 'session_created') {
      continue
    }

    // Skip tool_result (will be attached to tool_use)
    if (msg.kind === 'tool_result') {
      continue
    }

    // Skip status messages (optional, could be shown)
    if (msg.kind === 'status') {
      continue
    }

    // Convert to display message
    const displayMsg = convertSingleMessage(msg, toolResultsMap, options)
    if (displayMsg) {
      displayMessages.push(displayMsg)
    }
  }

  // Add streaming message if present
  if (streamingText) {
    displayMessages.push({
      id: '__streaming__',
      kind: 'text',
      role: 'assistant',
      content: streamingText,
      timestamp: new Date().toISOString(),
      isStreaming: true,
      provider: options.fallbackProvider,
      model: options.fallbackModel,
    })
  }

  return displayMessages
}

/**
 * Convert a single NormalizedMessage to DisplayChatMessage
 */
function convertSingleMessage(
  msg: NormalizedMessage,
  toolResultsMap: Map<string, any>,
  options: {
    fallbackProvider?: string
    fallbackModel?: string
  } = {}
): DisplayChatMessage | null {
  const base: Partial<DisplayChatMessage> = {
    id: msg.id,
    kind: msg.kind,
    timestamp: msg.timestamp,
    images: msg.images,
    provider: msg.provider || options.fallbackProvider,
    model: (msg.metadata?.model as string | undefined) || options.fallbackModel,
  }

  switch (msg.kind) {
    case 'text':
      return {
        ...base,
        kind: 'text',
        role: msg.role,
        content: msg.content,
      } as DisplayChatMessage

    case 'thinking':
      return {
        ...base,
        kind: 'thinking',
        thinking: msg.content,
      } as DisplayChatMessage

    case 'tool_use':
      const toolResult = toolResultsMap.get(msg.id)
      return {
        ...base,
        kind: 'tool_use',
        toolName: msg.toolName,
        toolInput: msg.toolInput,
        toolResult: toolResult?.result || toolResult?.content,
        isError: toolResult?.isError,
      } as DisplayChatMessage

    case 'permission_request':
      const permission: PendingPermission = {
        id: msg.requestId || msg.id,
        toolName: msg.toolName || 'Unknown Tool',
        toolInput: msg.toolInput,
        sessionId: msg.sessionId,
        receivedAt: msg.timestamp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
        message: msg.content,
      }
      return {
        ...base,
        kind: 'permission_request',
        permissionRequest: permission,
        content: msg.content,
      } as DisplayChatMessage

    case 'task_notification':
      const task: TaskProgress = {
        id: msg.id,
        label: msg.content || 'Running task...',
        status: (msg.metadata?.status as TaskProgress['status']) || 'running',
        progress: msg.metadata?.progress as number | undefined,
        message: msg.metadata?.message as string | undefined,
      }
      return {
        ...base,
        kind: 'task_notification',
        taskProgress: task,
        content: msg.content,
      } as DisplayChatMessage

    case 'interactive_prompt':
      const prompt: InteractivePrompt = {
        id: msg.requestId || msg.id,
        question: msg.content || '',
        options: msg.metadata?.options as string[] | undefined,
        placeholder: msg.metadata?.placeholder as string | undefined,
        multiline: msg.metadata?.multiline as boolean | undefined,
      }
      return {
        ...base,
        kind: 'interactive_prompt',
        interactivePrompt: prompt,
        content: msg.content,
      } as DisplayChatMessage

    case 'complete':
      // Don't display complete messages as chat bubbles
      // Could optionally show as a status
      return null

    case 'error':
      return {
        ...base,
        kind: 'error',
        content: msg.content,
        isError: true,
      } as DisplayChatMessage

    default:
      // Unknown kind, show as text
      return {
        ...base,
        kind: msg.kind,
        content: msg.content,
      } as DisplayChatMessage
  }
}

/**
 * Group consecutive messages by the same role for UI rendering
 */
export function groupMessagesByRole(messages: DisplayChatMessage[]): DisplayChatMessage[][] {
  const groups: DisplayChatMessage[][] = []
  let currentGroup: DisplayChatMessage[] = []
  let currentRole: string | undefined

  for (const msg of messages) {
    const msgRole = msg.role || (msg.kind === 'error' ? 'assistant' : undefined)

    if (msgRole !== currentRole || !msgRole) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup)
      }
      currentGroup = [msg]
      currentRole = msgRole
    } else {
      currentGroup.push(msg)
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

/**
 * Check if a message should be displayed to user
 */
export function isDisplayableMessage(msg: NormalizedMessage): boolean {
  const ephemeralKinds = ['stream_delta', 'stream_end', 'session_created', 'status']
  return !ephemeralKinds.includes(msg.kind)
}

/**
 * Get the primary content to display for a message
 */
export function getMessagePreview(msg: NormalizedMessage | DisplayChatMessage, maxLength = 100): string {
  let content = msg.content || ''

  // For tool_use, show tool name
  if (msg.kind === 'tool_use') {
    content = `[${msg.toolName}] ${content}`
  }

  // For thinking, indicate it's thinking
  if (msg.kind === 'thinking') {
    content = `[Thinking] ${content}`
  }

  // Truncate if too long
  if (content.length > maxLength) {
    content = content.slice(0, maxLength) + '...'
  }

  return content
}
