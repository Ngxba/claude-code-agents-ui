/**
 * Chat v2 real-time handler composable.
 * Integrates WebSocket communication, streaming buffer, and permissions.
 */

import type {
  ChatV2WebSocketMessage,
  ChatV2WebSocketEvent,
  NormalizedMessage,
  PermissionMode,
  EffortLevel,
} from '~/types'
import { useStreamingBuffer } from './useStreamingBuffer'
import { usePermissions } from './usePermissions'
import { useSessionStore } from './useSessionStore'
import { useContextMonitor } from './useContextMonitor'

export function useChatV2Handler() {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const error = ref<string | null>(null)
  const currentSessionId = ref<string | null>(null)

  // Integrate streaming buffer
  const streamingBuffer = useStreamingBuffer()

  // Integrate permissions
  const permissions = usePermissions()

  // Integrate context monitor
  const contextMonitor = useContextMonitor()
  contextMonitor.startMonitoring()

  // Session store for message persistence
  const sessionStore = useSessionStore()

  // Reconnection logic
  let reconnectTimer: NodeJS.Timeout | null = null
  const RECONNECT_DELAY = 3000

  /**
   * Connect to Chat v2 WebSocket
   */
  function connect() {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      console.log('[ChatV2] Already connected')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/v2/chat/ws`

    console.log('[ChatV2] Connecting to:', wsUrl)

    ws.value = new WebSocket(wsUrl)

    ws.value.onopen = () => {
      console.log('[ChatV2] Connected')
      isConnected.value = true
      error.value = null
    }

    ws.value.onmessage = (event) => {
      try {
        const data: ChatV2WebSocketEvent = JSON.parse(event.data)
        handleEvent(data)
      } catch (e) {
        console.error('[ChatV2] Error parsing message:', e)
      }
    }

    ws.value.onerror = (event) => {
      console.error('[ChatV2] Error:', event)
      error.value = 'WebSocket connection error'
    }

    ws.value.onclose = () => {
      console.log('[ChatV2] Disconnected')
      isConnected.value = false
      streamingBuffer.reset()

      // Auto-reconnect after delay
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, RECONNECT_DELAY)
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }

    isConnected.value = false
    streamingBuffer.reset()
  }

  /**
   * Send a WebSocket message
   */
  function sendMessage(message: ChatV2WebSocketMessage): boolean {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      error.value = 'WebSocket not connected'
      return false
    }

    try {
      ws.value.send(JSON.stringify(message))
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to send message'
      return false
    }
  }

  /**
   * Handle incoming WebSocket events
   */
  function handleEvent(event: ChatV2WebSocketEvent) {
    // Handle connection events
    if ('type' in event) {
      switch (event.type) {
        case 'connected':
          console.log('[ChatV2] WebSocket connected')
          return
        case 'disconnected':
          isConnected.value = false
          return
        case 'permission_expired':
          permissions.removePending(event.permissionId)
          return
      }
    }

    // Handle normalized messages
    if ('kind' in event) {
      handleNormalizedMessage(event as NormalizedMessage)
    }
  }

  /**
   * Handle normalized messages
   */
  function handleNormalizedMessage(message: NormalizedMessage) {
    const sessionId = message.sessionId

    switch (message.kind) {
      case 'session_created':
        const newSessionId = message.newSessionId || message.content || null

        // Migrate messages from temporary session to real session
        // Temp sessions are created on the client and named 'new-session-{timestamp}'
        if (newSessionId && currentSessionId.value && currentSessionId.value.startsWith('new-session-')) {
          sessionStore.migrateSession(currentSessionId.value, newSessionId)
        }

        // Update streaming buffer's session ID (for session migration)
        if (newSessionId && streamingBuffer.isStreaming.value) {
          streamingBuffer.setSessionId(newSessionId)
        }

        currentSessionId.value = newSessionId
        sessionStore.setActiveSession(currentSessionId.value)
        break

      case 'stream_delta':
        streamingBuffer.handleStreamDelta(message)
        // Don't update store here - let the buffered accumulated text update via watch
        break

      case 'stream_end':
        // Don't reset streaming here - this is called for each content block
        // (thinking, text, tool_use can each trigger stream_end)
        // Just flush the buffer to ensure current content is saved
        streamingBuffer.flush()
        break

      case 'text':
        // Add to session store for display
        if (sessionId) {
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'tool_result':
        // Ensure result uses a unique ID so it doesn't overwrite tool_use, 
        // but link it via toolId so convertToDisplayMessages can pair them.
        if (sessionId) {
          const rawToolId = message.metadata?.toolUseId || message.toolId || 'unknown'
          const toolUseId = rawToolId.startsWith('__tool_') ? rawToolId : `__tool_${rawToolId}`
          sessionStore.appendRealtime(sessionId, {
            ...message,
            id: `result_${message.id || Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            toolId: toolUseId,
          })
        }
        break

      case 'tool_use':
        // Use well-known ID for tool_use so multiple updates go to same message
        if (sessionId) {
          const toolId = message.metadata?.toolUseId || message.toolId || 'unknown'
          const toolUseId = toolId.startsWith('__tool_') ? toolId : `__tool_${toolId}`
          
          // Set active tool ID in streaming buffer so subsequent deltas go here
          streamingBuffer.setActiveToolId(toolUseId)
          
          sessionStore.appendRealtime(sessionId, {
            ...message,
            id: toolUseId,
          })
        }
        break

      case 'tool_input_delta' as any:
        // Buffer tool input like we do for thinking
        streamingBuffer.addToolInputDelta(message.content || '')
        break

      case 'thinking':
        // Buffer thinking content like we do for stream_delta
        streamingBuffer.addThinking(message.content || '')
        break

      case 'permission_request':
        // Use consistent tool ID if this is related to a tool call (like AskUserQuestion)
        const rawToolId = message.requestId || message.id
        const toolUseId = rawToolId.startsWith('__tool_') ? rawToolId : `__tool_${rawToolId}`
        const unifiedMessage = { ...message, id: toolUseId }

        // Add to permissions
        const permission = permissions.createFromMessage(unifiedMessage)
        permissions.addPending(permission)
        // Also add to session store
        if (sessionId) {
          sessionStore.addPermission(sessionId, permission)
          sessionStore.appendRealtime(sessionId, unifiedMessage)
        }
        break

      case 'permission_cancelled':
        // Remove from permissions
        if (message.requestId) {
          permissions.removePending(message.requestId)
          if (sessionId) {
            sessionStore.removePermission(sessionId, message.requestId)
          }
        }
        break

      case 'interactive_prompt':
      case 'task_notification':
        // Add to session store for display
        if (sessionId) {
          sessionStore.appendRealtime(sessionId, message)
        }
        break

      case 'complete':
        // Query complete - NOW we can finalize all streaming content
        const completeSessionId = sessionId || currentSessionId.value
        if (completeSessionId) {
          // Finalize streaming text to permanent text message
          sessionStore.finalizeStreaming(completeSessionId)
          // Finalize thinking content
          sessionStore.finalizeThinking(completeSessionId)
          // Reset the streaming buffer
          streamingBuffer.endStreaming()
          // Update status
          sessionStore.setStatus(completeSessionId, 'idle')
          sessionStore.appendRealtime(completeSessionId, message)

          // Update context monitor with aggregated usage from result
          if (message.metadata?.aggregatedUsage) {
            const usage = message.metadata.aggregatedUsage
            contextMonitor.updateTokenUsage({
              input: usage.input || 0,
              output: usage.output || 0,
              cacheRead: usage.cacheRead || 0,
              cacheCreation: usage.cacheCreation || 0,
            })

            // Update context window total if provided
            if (usage.contextWindow) {
              contextMonitor.metrics.value.contextWindow.total = usage.contextWindow
              // Recalculate percentage
              const used = contextMonitor.metrics.value.contextWindow.used
              contextMonitor.metrics.value.contextWindow.percentage =
                Math.round((used / usage.contextWindow) * 10000) / 100
            }

            // Update cost if provided
            if (usage.totalCost !== undefined) {
              contextMonitor.metrics.value.cost.total = usage.totalCost
            }
          }
        }
        break

      case 'error':
        error.value = message.content || 'An error occurred'
        const errorSessionId = sessionId || currentSessionId.value
        if (errorSessionId) {
          // Finalize any partial content before showing error
          sessionStore.finalizeStreaming(errorSessionId)
          sessionStore.finalizeThinking(errorSessionId)
          // Reset the streaming buffer
          streamingBuffer.endStreaming()
          // Update status and add error message
          sessionStore.setStatus(errorSessionId, 'error')
          sessionStore.appendRealtime(errorSessionId, message)
        }
        break

      case 'status':
        // Status updates (like "Thinking...")
        // Optionally display but don't persist
        break

      default:
        console.log('[ChatV2] Unknown message kind:', (message as any).kind)
    }
  }

  /**
   * Send a chat message
   */
  function sendChat(
    text: string,
    options: {
      sessionId?: string
      agentSlug?: string
      workingDir?: string
      provider?: string
      permissionMode?: PermissionMode
      model?: string
      effort?: EffortLevel
      outputStyleId?: string
      images?: string[]
    } = {}
  ): boolean {
    // Lazy connect: establish WebSocket connection if not connected
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      connect()
      // Queue the message to be sent once connected
      const checkAndSend = () => {
        if (ws.value && ws.value.readyState === WebSocket.OPEN) {
          doSendChat(text, options)
        } else if (ws.value && ws.value.readyState === WebSocket.CONNECTING) {
          setTimeout(checkAndSend, 50)
        } else {
          error.value = 'Failed to connect to WebSocket'
        }
      }
      setTimeout(checkAndSend, 50)
      return true // Optimistically return true since we're connecting
    }

    return doSendChat(text, options)
  }

  /**
   * Internal: Actually send the chat message
   */
  function doSendChat(
    text: string,
    options: {
      sessionId?: string
      agentSlug?: string
      workingDir?: string
      provider?: string
      permissionMode?: PermissionMode
      model?: string
      effort?: EffortLevel
      outputStyleId?: string
      images?: string[]
    } = {}
  ): boolean {
    // For new sessions, generate a temporary client-side session ID
    // Format: new-session-{timestamp}. Will be replaced by server session ID on session_created event
    const targetSessionId = options.sessionId || currentSessionId.value || `new-session-${Date.now()}`

    const message: ChatV2WebSocketMessage = {
      type: 'start',
      message: text,
      sessionId: targetSessionId,
      agentSlug: options.agentSlug,
      workingDir: options.workingDir,
      provider: options.provider,
      permissionMode: options.permissionMode || permissions.permissionMode.value,
      model: options.model,
      effort: options.effort,
      outputStyleId: options.outputStyleId,
      images: options.images,
    }

    const sent = sendMessage(message)

    // Set up session state for streaming response
    if (sent) {
      // Always update current session ID to the actual target ID
      currentSessionId.value = targetSessionId
      
      // Set active session so store updates trigger reactivity
      sessionStore.setActiveSession(targetSessionId)
      
      // Start streaming buffer - the first stream_delta will create the message
      streamingBuffer.startStreaming(targetSessionId)
      sessionStore.setStatus(targetSessionId, 'streaming')
    }

    return sent
  }

  /**
   * Abort current query
   */
  function abort(sessionId?: string): boolean {
    const sid = sessionId || currentSessionId.value
    if (!sid) return false

    const message: ChatV2WebSocketMessage = {
      type: 'abort',
      sessionId: sid,
    }

    return sendMessage(message)
  }

  /**
   * Respond to a permission request
   */
  function respondToPermission(
    permissionId: string,
    decision: 'allow' | 'deny',
    remember = false,
    updatedInput?: any
  ): boolean {
    const message: ChatV2WebSocketMessage = {
      type: 'permission_response',
      permissionId,
      decision,
      remember,
      ...(updatedInput !== undefined && { updatedInput }),
    }

    const sent = sendMessage(message)

    // Persist decision on the message in the store
    if (sent && currentSessionId.value) {
      // Remove from pending permissions
      permissions.removePending(permissionId)

      let answer: string | undefined
      if (updatedInput?.answers) {
        answer = Object.values(updatedInput.answers as Record<string, string>).join(', ')
      }
      sessionStore.updateMessageDecision(currentSessionId.value, permissionId, decision, answer)
    }

    return sent
  }

  /**
   * Respond to an interactive prompt
   */
  function respondToPrompt(promptId: string, value: string): boolean {
    const message: ChatV2WebSocketMessage = {
      type: 'interactive_response',
      promptId,
      value,
    }

    return sendMessage(message)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  // Watch streaming buffer and update store (debounced via buffer's 100ms flush)
  watch(streamingBuffer.accumulatedText, (newText) => {
    if (streamingBuffer.isStreaming.value && streamingBuffer.currentSessionId.value && newText) {
      sessionStore.updateStreaming(streamingBuffer.currentSessionId.value, newText)
    }
  })

  // Watch thinking buffer and update store (debounced via buffer's 100ms flush)
  watch(streamingBuffer.accumulatedThinking, (newThinking) => {
    if (streamingBuffer.isStreaming.value && streamingBuffer.currentSessionId.value && newThinking) {
      sessionStore.updateThinking(streamingBuffer.currentSessionId.value, newThinking)
    }
  })

  // Watch tool input map and update store
  watch(streamingBuffer.toolInputsMap, (newMap) => {
    if (streamingBuffer.isStreaming.value && currentSessionId.value) {
      for (const [toolId, toolInput] of newMap.entries()) {
        sessionStore.updateToolUseById(currentSessionId.value, toolId, toolInput)
      }
    }
  }, { deep: true })

  return {
    // State
    isConnected: readonly(isConnected),
    error: readonly(error),
    currentSessionId: readonly(currentSessionId),

    // Streaming state
    isStreaming: streamingBuffer.isStreaming,
    streamingText: streamingBuffer.accumulatedText,
    activeToolId: streamingBuffer.activeToolId,
    toolInputsMap: streamingBuffer.toolInputsMap,

    // Permissions
    permissions,
    hasPendingPermissions: permissions.hasPending,

    // Context Monitoring
    contextMonitor,

    // Actions
    connect,
    disconnect,
    sendChat,
    abort,
    respondToPermission,
    respondToPrompt,

    // Session store access
    sessionStore,
    setCurrentSessionId: (id: string | null) => {
      currentSessionId.value = id
      if (id) {
        sessionStore.setActiveSession(id)
      }
    },
  }
}
