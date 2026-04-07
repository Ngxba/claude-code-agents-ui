/**
 * Streaming buffer composable for Chat v2.
 * Implements 100ms debounced streaming updates for better performance.
 * Handles both text streaming (stream_delta) and thinking accumulation (thinking).
 */

import type { NormalizedMessage } from '~/types'

const DEBOUNCE_MS = 100
const MAX_BUFFER_SIZE = 1000

export function useStreamingBuffer() {
  // Buffer for incoming stream deltas (text)
  const buffer = ref<string[]>([])

  // Accumulated text (what gets displayed)
  const accumulatedText = ref('')

  // Buffer for thinking content
  const thinkingBuffer = ref<string[]>([])

  // Accumulated thinking content
  const accumulatedThinking = ref('')

  // Buffer for tool input deltas
  const toolInputBuffer = ref<string[]>([])

  // Accumulated tool inputs map: toolId -> input string
  const toolInputsMap = ref<Map<string, string>>(new Map())

  // Active tool ID being streamed
  const activeToolId = ref<string | null>(null)

  // Flush timer
  let flushTimer: NodeJS.Timeout | null = null

  // Session being streamed
  const currentSessionId = ref<string | null>(null)

  // Streaming state
  const isStreaming = ref(false)

  /**
   * Start a new streaming session
   */
  function startStreaming(sessionId: string) {
    // Reset state
    buffer.value = []
    accumulatedText.value = ''
    thinkingBuffer.value = []
    accumulatedThinking.value = ''
    toolInputBuffer.value = []
    toolInputsMap.value = new Map()
    activeToolId.value = null
    currentSessionId.value = sessionId
    isStreaming.value = true

    // Clear any pending flush
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  /**
   * Set the active tool ID for incoming deltas
   */
  function setActiveToolId(toolId: string) {
    // If switching tools, flush current buffer first
    if (activeToolId.value && activeToolId.value !== toolId) {
      flush()
    }
    activeToolId.value = toolId
  }

  /**
   * Update the session ID without resetting buffer (for session migration)
   */
  function setSessionId(sessionId: string) {
    currentSessionId.value = sessionId
  }

  /**
   * Add a stream delta to the buffer.
   * Will be flushed after DEBOUNCE_MS.
   */
  function addDelta(delta: string) {
    if (!isStreaming.value) return

    // Add to buffer
    buffer.value.push(delta)

    // Prevent buffer overflow
    if (buffer.value.length > MAX_BUFFER_SIZE) {
      // Force flush
      flush()
      return
    }

    // Schedule flush with debounce
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flush()
      }, DEBOUNCE_MS)
    }
  }

  /**
   * Add thinking content to the thinking buffer.
   * Will be flushed after DEBOUNCE_MS.
   */
  function addThinking(thinking: string) {
    if (!isStreaming.value) return

    // Add to thinking buffer
    thinkingBuffer.value.push(thinking)

    // Prevent buffer overflow
    if (thinkingBuffer.value.length > MAX_BUFFER_SIZE) {
      // Force flush
      flush()
      return
    }

    // Schedule flush with debounce
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flush()
      }, DEBOUNCE_MS)
    }
  }

  /**
   * Add tool input delta to the tool input buffer.
   * Will be flushed after DEBOUNCE_MS.
   */
  function addToolInputDelta(input: string) {
    if (!isStreaming.value) return

    // Add to tool input buffer
    toolInputBuffer.value.push(input)

    // Prevent buffer overflow
    if (toolInputBuffer.value.length > MAX_BUFFER_SIZE) {
      // Force flush
      flush()
      return
    }

    // Schedule flush with debounce
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flush()
      }, DEBOUNCE_MS)
    }
  }

  /**
   * Flush the buffer - combine all deltas and update accumulated text
   */
  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    if (buffer.value.length === 0 && thinkingBuffer.value.length === 0 && toolInputBuffer.value.length === 0) return

    // Combine text buffer
    if (buffer.value.length > 0) {
      const combined = buffer.value.join('')
      buffer.value = []
      accumulatedText.value += combined
    }

    // Combine thinking buffer
    if (thinkingBuffer.value.length > 0) {
      const combined = thinkingBuffer.value.join('')
      thinkingBuffer.value = []
      accumulatedThinking.value += combined
    }

    // Combine tool input buffer
    if (toolInputBuffer.value.length > 0) {
      const combined = toolInputBuffer.value.join('')
      toolInputBuffer.value = []
      
      if (activeToolId.value) {
        const current = toolInputsMap.value.get(activeToolId.value) || ''
        toolInputsMap.value.set(activeToolId.value, current + combined)
        // Trigger reactivity for watchers
        toolInputsMap.value = new Map(toolInputsMap.value)
      }
    }
  }

  /**
   * End streaming session.
   * Flushes any remaining buffer and returns final text.
   */
  function endStreaming(): string {
    // Final flush
    flush()

    // Capture final text
    const finalText = accumulatedText.value
    const finalThinking = accumulatedThinking.value

    // Reset state
    isStreaming.value = false
    currentSessionId.value = null
    accumulatedText.value = ''
    accumulatedThinking.value = ''
    toolInputBuffer.value = []
    toolInputsMap.value = new Map()
    activeToolId.value = null

    return finalText
  }

  /**
   * Handle a stream_delta message
   */
  function handleStreamDelta(message: NormalizedMessage) {
    if (message.kind !== 'stream_delta') return

    // Start streaming if not already
    if (!isStreaming.value && message.sessionId) {
      startStreaming(message.sessionId)
    }

    // Check session match - but allow 'pending' to accept any session
    // This handles the case where session_created arrives after first delta
    const isPending = currentSessionId.value === 'pending'
    if (!isPending && currentSessionId.value && message.sessionId !== currentSessionId.value) {
      console.warn('[StreamingBuffer] Session mismatch, ignoring delta')
      return
    }

    // If we're pending and get a real session ID, update it
    if (isPending && message.sessionId && message.sessionId !== 'pending') {
      setSessionId(message.sessionId)
    }

    // Add delta content
    if (message.content) {
      addDelta(message.content)
    }
  }

  /**
   * Handle a stream_end message
   */
  function handleStreamEnd(message: NormalizedMessage): string {
    if (message.kind !== 'stream_end') return ''

    // Check session match
    if (currentSessionId.value && message.sessionId !== currentSessionId.value) {
      console.warn('[StreamingBuffer] Session mismatch on stream_end')
      return ''
    }

    return endStreaming()
  }

  /**
   * Force reset (e.g., on disconnect)
   */
  function reset() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    buffer.value = []
    accumulatedText.value = ''
    thinkingBuffer.value = []
    accumulatedThinking.value = ''
    toolInputBuffer.value = []
    toolInputsMap.value = new Map()
    activeToolId.value = null
    currentSessionId.value = null
    isStreaming.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    reset()
  })

  return {
    // State
    isStreaming: readonly(isStreaming),
    accumulatedText: readonly(accumulatedText),
    accumulatedThinking: readonly(accumulatedThinking),
    toolInputsMap: readonly(toolInputsMap),
    activeToolId: readonly(activeToolId),
    currentSessionId: readonly(currentSessionId),

    // Actions
    startStreaming,
    setActiveToolId,
    setSessionId,
    addDelta,
    addThinking,
    addToolInputDelta,
    flush,
    endStreaming,
    handleStreamDelta,
    handleStreamEnd,
    reset,
  }
}
