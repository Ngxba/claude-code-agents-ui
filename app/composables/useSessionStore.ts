/**
 * Session-keyed message store.
 *
 * Holds per-session state in a Map keyed by sessionId.
 * Session switch = change activeSessionId pointer. No clearing. Old data stays.
 * WebSocket handler = store.appendRealtime(msg.sessionId, msg). One line.
 * Backend JSONL is the source of truth.
 *
 * Based on claudecodeui's session store pattern.
 */

import type { NormalizedMessage, PendingPermission, PermissionMode } from '~/types'

export type SessionStatus = 'idle' | 'loading' | 'streaming' | 'error'

export interface SessionSlot {
  /** Messages loaded from server (JSONL) */
  serverMessages: NormalizedMessage[]
  /** Messages received via WebSocket (real-time) */
  realtimeMessages: NormalizedMessage[]
  /** Merged array (server + unique realtime) */
  merged: NormalizedMessage[]
  /** @internal Cache refs for merge detection */
  _lastServerRef: NormalizedMessage[]
  _lastRealtimeRef: NormalizedMessage[]
  /** Current status */
  status: SessionStatus
  /** Last fetch timestamp */
  fetchedAt: number
  /** Total message count (from server) */
  total: number
  /** Has more messages to paginate */
  hasMore: boolean
  /** Current pagination offset */
  offset: number
  /** Token usage info */
  tokenUsage: any
  /** Chat v2: Pending permissions for this session */
  pendingPermissions: Map<string, PendingPermission>
  /** Chat v2: Permission mode for this session */
  permissionMode: PermissionMode
}

const EMPTY: NormalizedMessage[] = []
const STALE_THRESHOLD_MS = 30_000
const MAX_REALTIME_MESSAGES = 500

/**
 * Create empty session slot
 */
function createEmptySlot(): SessionSlot {
  return {
    serverMessages: EMPTY,
    realtimeMessages: EMPTY,
    merged: EMPTY,
    _lastServerRef: EMPTY,
    _lastRealtimeRef: EMPTY,
    status: 'idle',
    fetchedAt: 0,
    total: 0,
    hasMore: false,
    offset: 0,
    tokenUsage: null,
    pendingPermissions: new Map(),
    permissionMode: 'default',
  }
}

/**
 * Compute merged messages: server + realtime, deduped by id.
 * Server messages take priority (persisted source of truth).
 * Realtime messages that aren't in server stay (in-flight streaming).
 */
function computeMerged(server: NormalizedMessage[], realtime: NormalizedMessage[]): NormalizedMessage[] {
  if (realtime.length === 0) return server
  if (server.length === 0) return realtime

  const serverIds = new Set(server.map(m => m.id))
  const extra = realtime.filter(m => !serverIds.has(m.id))

  if (extra.length === 0) return server
  
  // Combine and sort by timestamp to ensure correct order
  const merged = [...server, ...extra]
  return merged.sort((a, b) => 
    new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  )
}

/**
 * Recompute slot.merged only when input arrays changed (by reference).
 * Returns true if merged was recomputed.
 */
function recomputeMergedIfNeeded(slot: SessionSlot): boolean {
  if (slot.serverMessages === slot._lastServerRef && slot.realtimeMessages === slot._lastRealtimeRef) {
    return false
  }

  slot._lastServerRef = slot.serverMessages
  slot._lastRealtimeRef = slot.realtimeMessages
  slot.merged = computeMerged(slot.serverMessages, slot.realtimeMessages)
  return true
}

/**
 * Session store composable
 */
export function useSessionStore() {
  // Store Map: sessionId -> SessionSlot
  const storeRef = ref(new Map<string, SessionSlot>())
  const activeSessionIdRef = ref<string | null>(null)

  // Bump to force re-render (only when active session changes)
  const tick = useState('session-store-tick', () => 0)

  const notify = (sessionId: string) => {
    if (sessionId === activeSessionIdRef.value) {
      tick.value = tick.value + 1
    }
  }

  /**
   * Set active session
   */
  const setActiveSession = (sessionId: string | null) => {
    activeSessionIdRef.value = sessionId
  }

  /**
   * Get or create session slot
   */
  const getSlot = (sessionId: string): SessionSlot => {
    if (!storeRef.value.has(sessionId)) {
      storeRef.value.set(sessionId, createEmptySlot())
    }
    return storeRef.value.get(sessionId)!
  }

  /**
   * Check if session exists
   */
  const has = (sessionId: string) => storeRef.value.has(sessionId)

  /**
   * Fetch messages from server and populate serverMessages
   */
  const fetchFromServer = async (
    sessionId: string,
    opts: {
      agentSlug?: string
      workingDir?: string
      limit?: number | null
      offset?: number
    } = {}
  ) => {
    console.log('[SessionStore] fetchFromServer called:', sessionId, opts)
    const slot = getSlot(sessionId)
    slot.status = 'loading'
    notify(sessionId)

    try {
      const query: any = {}
      if (opts.limit !== null && opts.limit !== undefined) {
        query.limit = String(opts.limit)
        query.offset = String(opts.offset ?? 0)
      }

      const url = `/api/chat-ws/sessions/${encodeURIComponent(sessionId)}`
      console.log('[SessionStore] Fetching from:', url, 'query:', query)

      const response = await $fetch<any>(url, { query })
      console.log('[SessionStore] Response:', response)

      const messages: NormalizedMessage[] = response.messages || []
      const pagination = response.pagination || {}

      console.log('[SessionStore] Received', messages.length, 'messages')
      console.log('[SessionStore] Pagination:', pagination)

      slot.serverMessages = messages
      slot.total = pagination.total ?? messages.length
      slot.hasMore = Boolean(pagination.hasMore)
      slot.offset = (opts.offset ?? 0) + messages.length
      slot.fetchedAt = Date.now()
      slot.status = 'idle'

      const recomputed = recomputeMergedIfNeeded(slot)
      console.log('[SessionStore] Merged recomputed:', recomputed, 'merged length:', slot.merged.length)

      if (response.tokenUsage) {
        slot.tokenUsage = response.tokenUsage
      }

      notify(sessionId)
      return slot
    } catch (error) {
      console.error(`[SessionStore] fetch failed for ${sessionId}:`, error)
      slot.status = 'error'
      notify(sessionId)
      return slot
    }
  }

  /**
   * Load older (paginated) messages and prepend to serverMessages
   */
  const fetchMore = async (
    sessionId: string,
    opts: {
      limit?: number
    } = {}
  ) => {
    const slot = getSlot(sessionId)
    if (!slot.hasMore) return slot

    const limit = opts.limit ?? 20
    const offset = slot.offset

    try {
      const url = `/api/chat-ws/sessions/${encodeURIComponent(sessionId)}`
      const response = await $fetch<any>(url, {
        query: {
          limit: String(limit),
          offset: String(offset),
        },
      })

      const olderMessages: NormalizedMessage[] = response.messages || []
      const pagination = response.pagination || {}

      // Prepend older messages (they're earlier in the conversation)
      slot.serverMessages = [...olderMessages, ...slot.serverMessages]
      slot.hasMore = Boolean(pagination.hasMore)
      slot.offset = offset + olderMessages.length
      recomputeMergedIfNeeded(slot)
      notify(sessionId)

      return slot
    } catch (error) {
      console.error(`[SessionStore] fetchMore failed for ${sessionId}:`, error)
      return slot
    }
  }

  /**
   * Append a realtime (WebSocket) message to the session.
   * Works regardless of which session is actively viewed.
   * If message with same ID exists, it UPDATES it instead of appending.
   */
  const appendRealtime = (sessionId: string, msg: NormalizedMessage) => {
    const slot = getSlot(sessionId)
    
    const existingIdx = slot.realtimeMessages.findIndex(m => m.id === msg.id)
    let updated: NormalizedMessage[]

    if (existingIdx >= 0) {
      updated = [...slot.realtimeMessages]
      const existing = updated[existingIdx]
      
      // Merge properties
      const merged = { ...existing, ...msg }
      
      // Special handling for toolInput: preserve existing input if the new one is empty
      // This prevents full tool_use messages (which often have empty toolInput initially)
      // from overwriting the deltas we've been accumulating.
      if (
        existing.toolInput && 
        Object.keys(existing.toolInput).length > 0 && 
        (!msg.toolInput || Object.keys(msg.toolInput).length === 0)
      ) {
        merged.toolInput = existing.toolInput
      }
      
      updated[existingIdx] = merged
    } else {
      updated = [...slot.realtimeMessages, msg]
    }

    // Limit realtime buffer size
    if (updated.length > MAX_REALTIME_MESSAGES) {
      updated = updated.slice(-MAX_REALTIME_MESSAGES)
    }

    slot.realtimeMessages = updated
    recomputeMergedIfNeeded(slot)
    notify(sessionId)
  }

  /**
   * Append multiple realtime messages at once (batch)
   */
  const appendRealtimeBatch = (sessionId: string, msgs: NormalizedMessage[]) => {
    if (msgs.length === 0) return

    const slot = getSlot(sessionId)
    let updated = [...slot.realtimeMessages, ...msgs]

    if (updated.length > MAX_REALTIME_MESSAGES) {
      updated = updated.slice(-MAX_REALTIME_MESSAGES)
    }

    slot.realtimeMessages = updated
    recomputeMergedIfNeeded(slot)
    notify(sessionId)
  }

  /**
   * Re-fetch serverMessages from server (e.g., on reconnect)
   */
  const refreshFromServer = async (sessionId: string) => {
    const slot = getSlot(sessionId)

    try {
      const url = `/api/chat-ws/sessions/${encodeURIComponent(sessionId)}`
      const response = await $fetch<any>(url)

      slot.serverMessages = response.messages || []
      slot.total = response.pagination?.total ?? slot.serverMessages.length
      slot.hasMore = Boolean(response.pagination?.hasMore)
      slot.fetchedAt = Date.now()

      // Drop realtime messages that server has caught up with
      slot.realtimeMessages = []
      recomputeMergedIfNeeded(slot)
      notify(sessionId)
    } catch (error) {
      console.error(`[SessionStore] refresh failed for ${sessionId}:`, error)
    }
  }

  /**
   * Update session status
   */
  const setStatus = (sessionId: string, status: SessionStatus) => {
    const slot = getSlot(sessionId)
    slot.status = status
    notify(sessionId)
  }

  /**
   * Check if session data is stale (>30s old)
   */
  const isStale = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return true
    return Date.now() - slot.fetchedAt > STALE_THRESHOLD_MS
  }

  /**
   * Update or create a streaming message (accumulated text so far).
   * Uses a well-known ID so subsequent calls replace the same message.
   */
  const updateStreaming = (sessionId: string, accumulatedText: string) => {
    const slot = getSlot(sessionId)
    const streamId = `__streaming_${sessionId}`

    const msg: NormalizedMessage = {
      id: streamId,
      sessionId,
      timestamp: new Date().toISOString(),
      kind: 'stream_delta',
      content: accumulatedText,
    }

    const idx = slot.realtimeMessages.findIndex(m => m.id === streamId)
    if (idx >= 0) {
      slot.realtimeMessages = [...slot.realtimeMessages]
      slot.realtimeMessages[idx] = msg
    } else {
      slot.realtimeMessages = [...slot.realtimeMessages, msg]
    }

    recomputeMergedIfNeeded(slot)
    notify(sessionId)
  }

  /**
   * Update or create a thinking message (accumulated thinking so far).
   * Uses a well-known ID so subsequent calls replace the same message.
   */
  const updateThinking = (sessionId: string, thinkingContent: string) => {
    const slot = getSlot(sessionId)
    const thinkingId = `__thinking_${sessionId}`

    const msg: NormalizedMessage = {
      id: thinkingId,
      sessionId,
      timestamp: new Date().toISOString(),
      kind: 'thinking',
      content: thinkingContent,
    }

    const idx = slot.realtimeMessages.findIndex(m => m.id === thinkingId)
    if (idx >= 0) {
      slot.realtimeMessages = [...slot.realtimeMessages]
      slot.realtimeMessages[idx] = msg
    } else {
      slot.realtimeMessages = [...slot.realtimeMessages, msg]
    }

    recomputeMergedIfNeeded(slot)
    notify(sessionId)
  }

  /**
   * Update or create a tool use message (accumulated tool input so far).
   * Uses a well-known ID so subsequent calls replace the same message.
   */
  const updateToolUse = (sessionId: string, toolInput: string) => {
    const slot = getSlot(sessionId)
    // Find the most recent tool_use message to update
    let toolUseIdx = -1
    for (let i = slot.realtimeMessages.length - 1; i >= 0; i--) {
      const msg = slot.realtimeMessages[i]
      if (msg && msg.kind === 'tool_use' && msg.id?.startsWith('__tool_')) {
        toolUseIdx = i
        break
      }
    }

    if (toolUseIdx >= 0) {
      const existingToolUse = slot.realtimeMessages[toolUseIdx]
      if (existingToolUse) {
        // Try to parse JSON, but handle partial/incomplete JSON gracefully
        let parsedInput: any = existingToolUse.toolInput || {}
        if (toolInput) {
          try {
            parsedInput = JSON.parse(toolInput)
          } catch {
            // Partial JSON - store raw string for display with a marker
            // The UI can detect _partialJson and display it appropriately
            parsedInput = { _partialJson: toolInput }
          }
        }

        const updatedToolUse = {
          ...existingToolUse,
          toolInput: parsedInput,
        } as NormalizedMessage
        slot.realtimeMessages = [...slot.realtimeMessages]
        slot.realtimeMessages[toolUseIdx] = updatedToolUse
        recomputeMergedIfNeeded(slot)
        notify(sessionId)
      }
    }
  }

  /**
   * Update a specific tool use message by its ID.
   */
  const updateToolUseById = (sessionId: string, toolId: string, toolInput: string) => {
    const slot = getSlot(sessionId)
    const idx = slot.realtimeMessages.findIndex(m => m.id === toolId)

    if (idx >= 0) {
      const existingToolUse = slot.realtimeMessages[idx]
      if (existingToolUse) {
        let parsedInput: any = existingToolUse.toolInput || {}
        if (toolInput) {
          try {
            parsedInput = JSON.parse(toolInput)
          } catch {
            parsedInput = { _partialJson: toolInput }
          }
        }

        const updatedToolUse = {
          ...existingToolUse,
          toolInput: parsedInput,
        } as NormalizedMessage
        slot.realtimeMessages = [...slot.realtimeMessages]
        slot.realtimeMessages[idx] = updatedToolUse
        recomputeMergedIfNeeded(slot)
        notify(sessionId)
      }
    }
  }

  /**
   * Finalize streaming: convert streaming message to regular text message.
   * The well-known streaming ID is replaced with a unique text message ID.
   */
  const finalizeStreaming = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return

    const streamId = `__streaming_${sessionId}`
    const idx = slot.realtimeMessages.findIndex(m => m.id === streamId)

    if (idx >= 0) {
      const stream = slot.realtimeMessages[idx]
      if (!stream) return

      slot.realtimeMessages = [...slot.realtimeMessages]
      slot.realtimeMessages[idx] = {
        id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'text',
        sessionId: stream.sessionId,
        timestamp: stream.timestamp,
        role: 'assistant',
        content: stream.content,
      } as NormalizedMessage
      recomputeMergedIfNeeded(slot)
      notify(sessionId)
    }
  }

  /**
   * Finalize thinking: convert temporary thinking message to permanent one.
   * The well-known thinking ID is replaced with a unique thinking message ID.
   */
  const finalizeThinking = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return

    const thinkingId = `__thinking_${sessionId}`
    const idx = slot.realtimeMessages.findIndex(m => m.id === thinkingId)

    if (idx >= 0) {
      const thinking = slot.realtimeMessages[idx]
      if (!thinking || !thinking.content) return

      slot.realtimeMessages = [...slot.realtimeMessages]
      slot.realtimeMessages[idx] = {
        id: `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'thinking',
        sessionId: thinking.sessionId,
        timestamp: thinking.timestamp,
        content: thinking.content,
      } as NormalizedMessage
      recomputeMergedIfNeeded(slot)
      notify(sessionId)
    }
  }

  /**
   * Clear realtime messages for a session (after server catches up)
   */
  const clearRealtime = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (slot) {
      slot.realtimeMessages = []
      recomputeMergedIfNeeded(slot)
      notify(sessionId)
    }
  }

  /**
   * Migrate messages from one session to another (e.g., 'pending' -> new SDK session)
   * Updates the sessionId field on each message.
   */
  const migrateSession = (fromSessionId: string, toSessionId: string) => {
    const fromSlot = storeRef.value.get(fromSessionId)
    if (!fromSlot) return

    const toSlot = getSlot(toSessionId)

    // Migrate realtime messages, updating their sessionId
    const migratedMessages = fromSlot.realtimeMessages.map(msg => ({
      ...msg,
      sessionId: toSessionId,
    }))

    toSlot.realtimeMessages = [...toSlot.realtimeMessages, ...migratedMessages]
    recomputeMergedIfNeeded(toSlot)

    // Clear the old session
    fromSlot.realtimeMessages = []
    fromSlot.serverMessages = []
    fromSlot.merged = []
    recomputeMergedIfNeeded(fromSlot)

    // Delete the old slot
    storeRef.value.delete(fromSessionId)

    notify(toSessionId)
  }

  /**
   * Get merged messages for rendering
   */
  const getMessages = (sessionId: string): NormalizedMessage[] => {
    return storeRef.value.get(sessionId)?.merged ?? []
  }

  /**
   * Get session slot (for status, pagination info, etc.)
   */
  const getSessionSlot = (sessionId: string): SessionSlot | undefined => {
    return storeRef.value.get(sessionId)
  }

  // ── Chat v2: Permission Management ──────────────────

  /**
   * Add a pending permission to a session
   */
  const addPermission = (sessionId: string, permission: PendingPermission) => {
    const slot = getSlot(sessionId)
    slot.pendingPermissions.set(permission.id, permission)
    notify(sessionId)
  }

  /**
   * Remove a pending permission from a session
   */
  const removePermission = (sessionId: string, permissionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (slot) {
      slot.pendingPermissions.delete(permissionId)
      notify(sessionId)
    }
  }

  /**
   * Get all pending permissions for a session
   */
  const getPendingPermissions = (sessionId: string): PendingPermission[] => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return []
    return Array.from(slot.pendingPermissions.values())
  }

  /**
   * Check if a session has any pending permissions
   */
  const hasPendingPermissions = (sessionId: string): boolean => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return false
    return slot.pendingPermissions.size > 0
  }

  /**
   * Set the permission mode for a session
   */
  const setPermissionMode = (sessionId: string, mode: PermissionMode) => {
    const slot = getSlot(sessionId)
    slot.permissionMode = mode
    notify(sessionId)
  }

  /**
   * Get the permission mode for a session
   */
  const getPermissionMode = (sessionId: string): PermissionMode => {
    const slot = storeRef.value.get(sessionId)
    return slot?.permissionMode ?? 'default'
  }

  /**
   * Clear all permissions for a session
   */
  const clearPermissions = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (slot) {
      slot.pendingPermissions.clear()
      notify(sessionId)
    }
  }

  /**
   * Update a permission_request message with the resolved decision.
   * Searches both realtimeMessages and serverMessages by requestId or id.
   */
  const updateMessageDecision = (
    sessionId: string,
    permissionId: string,
    decision: 'allow' | 'deny',
    answer?: string
  ) => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return

    const patchMessage = (messages: NormalizedMessage[]): NormalizedMessage[] | null => {
      const idx = messages.findIndex(m => m.requestId === permissionId || m.id === permissionId)
      if (idx === -1) return null
      const updated = [...messages]
      updated[idx] = { ...updated[idx], resolvedDecision: decision, resolvedAnswer: answer }
      return updated
    }

    const patchedRealtime = patchMessage(slot.realtimeMessages)
    if (patchedRealtime) {
      slot.realtimeMessages = patchedRealtime
    }

    const patchedServer = patchMessage(slot.serverMessages)
    if (patchedServer) {
      slot.serverMessages = patchedServer
    }

    if (patchedRealtime || patchedServer) {
      recomputeMergedIfNeeded(slot)
      notify(sessionId)
    }
  }

  /**
   * Remove expired permissions for a session
   */
  const cleanupExpiredPermissions = (sessionId: string) => {
    const slot = storeRef.value.get(sessionId)
    if (!slot) return

    const now = Date.now()
    let hasChanges = false

    for (const [id, permission] of slot.pendingPermissions) {
      if (new Date(permission.expiresAt).getTime() < now) {
        slot.pendingPermissions.delete(id)
        hasChanges = true
      }
    }

    if (hasChanges) {
      notify(sessionId)
    }
  }

  return {
    getSlot,
    has,
    fetchFromServer,
    fetchMore,
    appendRealtime,
    appendRealtimeBatch,
    refreshFromServer,
    setActiveSession,
    setStatus,
    isStale,
    updateStreaming,
    updateThinking,
    updateToolUse,
    finalizeStreaming,
    finalizeThinking,
    clearRealtime,
    migrateSession,
    getMessages,
    getSessionSlot,
    updateToolUseById,
    // Chat v2: Permission management
    addPermission,
    removePermission,
    updateMessageDecision,
    getPendingPermissions,
    hasPendingPermissions,
    setPermissionMode,
    getPermissionMode,
    clearPermissions,
    cleanupExpiredPermissions,
  }
}

export type SessionStore = ReturnType<typeof useSessionStore>
