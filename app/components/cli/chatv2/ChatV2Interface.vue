<script setup lang="ts">
import { useChatV2Handler } from '~/composables/useChatV2Handler'
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'
import { convertToDisplayMessages } from '~/utils/chatMessageConverter'
import { convertClaudeCodeMessages } from '~/utils/claudeCodeMessageConverter'
import type { DisplayChatMessage, PermissionMode } from '~/types'

const props = defineProps<{
  executionOptions: {
    agentSlug?: string
    workingDir?: string
  }
}>()

// Toast for notifications
const toast = useToast()

// No URL routing - all navigation handled via internal state

// Chat v2 handler with integrated streaming, permissions, and session store
const {
  isConnected,
  error,
  currentSessionId,
  isStreaming,
  streamingText,
  permissions,
  hasPendingPermissions,
  connect,
  disconnect,
  sendChat,
  abort,
  respondToPermission,
  sessionStore,
} = useChatV2Handler()

// Claude Code history
const {
  messages: claudeCodeMessages,
  isLoadingMessages: isLoadingClaudeCodeMessages,
  messagesHasMore: claudeCodeMessagesHasMore,
  fetchMessages: fetchClaudeCodeMessages,
} = useClaudeCodeHistory()

// Session list
const sessions = ref<any[]>([])
const isLoadingSessions = ref(false)

// UI state
const inputText = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const sidebarCollapsed = ref(false)
const isCreatingSession = ref(false)
const isInputFocused = ref(false)

// View mode: 'live' (new chat) or 'history' (viewing Claude Code history)
const viewMode = ref<'live' | 'history'>('live')

// Track if we're continuing a history session (showing history + new messages)
const isContinuingHistory = ref(false)

// Local loading state with minimum duration for smooth UX
const isLoadingHistoryWithDelay = ref(false)

// URL state for history sessions
const urlProjectName = ref<string | null>(null)
const urlSessionId = ref<string | null>(null)

// Session info for header display
const currentSessionSummary = ref<string>('')
const currentProjectDisplayName = ref<string>('')

// Permission mode selector
const permissionModeOptions: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Ask for permission on each action' },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits' },
  { value: 'bypassPermissions', label: 'Bypass', description: 'Allow all actions' },
  { value: 'plan', label: 'Plan Mode', description: 'Plan only, no execution' },
]

const selectedPermissionMode = ref<PermissionMode>('default')

// Get display messages - either from live session or Claude Code history
const displayMessages = computed<DisplayChatMessage[]>(() => {
  // If continuing a history session, combine history + new live messages
  if (isContinuingHistory.value && currentSessionId.value) {
    const historyMessages = convertClaudeCodeMessages(claudeCodeMessages.value)
    const liveMessages = sessionStore.getMessages(currentSessionId.value)
    const newMessages = convertToDisplayMessages(liveMessages, streamingText.value)
    return [...historyMessages, ...newMessages]
  }

  // If viewing Claude Code history (not continuing)
  if (viewMode.value === 'history' && claudeCodeMessages.value.length > 0) {
    return convertClaudeCodeMessages(claudeCodeMessages.value)
  }

  // Live session
  if (!currentSessionId.value) return []

  const messages = sessionStore.getMessages(currentSessionId.value)
  return convertToDisplayMessages(messages, streamingText.value)
})

// Connect on mount
onMounted(async () => {
  connect()
  await fetchSessions()
})

// Watch for errors and show toast
watch(error, (newError) => {
  if (newError) {
    toast.add({
      title: 'Error',
      description: newError,
      color: 'error',
    })
  }
})

// Handle Claude Code project selection (no URL navigation)
function handleClaudeCodeProjectSelected(payload: { projectName: string; projectDisplayName: string }) {
  urlProjectName.value = payload.projectName
  urlSessionId.value = null
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload.projectDisplayName
}

// Utility: delay for minimum loading time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Handle Claude Code history session selection (no URL navigation)
async function handleClaudeCodeSessionSelected(payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }) {
  viewMode.value = 'history'
  urlProjectName.value = payload.projectName
  urlSessionId.value = payload.sessionId
  currentSessionSummary.value = payload.sessionSummary
  currentProjectDisplayName.value = payload.projectDisplayName
  isContinuingHistory.value = false  // Reset when selecting a new history session

  // Start loading with minimum duration
  isLoadingHistoryWithDelay.value = true

  // Load messages with minimum 500ms delay for smooth UX
  await Promise.all([
    fetchClaudeCodeMessages(payload.projectName, payload.sessionId, 100, 0),
    delay(500)
  ])

  // End loading state
  isLoadingHistoryWithDelay.value = false

  // Scroll to bottom (latest messages) after loading
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
}

// Handle selection cleared (back to projects list)
function handleSelectionCleared() {
  viewMode.value = 'live'
  urlProjectName.value = null
  urlSessionId.value = null
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = ''
  isContinuingHistory.value = false
}

// Handle new chat - switch to live mode without affecting sidebar
function handleNewChat() {
  viewMode.value = 'live'
  urlProjectName.value = null
  urlSessionId.value = null
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = ''
  isContinuingHistory.value = false
  createSession()
}

// Auto-scroll on new messages (when in live mode or continuing history)
watch([displayMessages, streamingText], () => {
  nextTick(() => {
    if (messagesContainerRef.value && (viewMode.value === 'live' || isContinuingHistory.value)) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
})

// Track if we're loading more to prevent duplicate calls
const isLoadingMore = ref(false)

// Load more messages for history mode
async function loadMoreHistoryMessages(options?: { preserveScroll?: boolean }) {
  if (!claudeCodeMessagesHasMore.value) return
  if (isLoadingClaudeCodeMessages.value || isLoadingMore.value) return
  if (!urlProjectName.value || !urlSessionId.value) return

  isLoadingMore.value = true

  // Save current scroll state to restore position after loading
  const container = messagesContainerRef.value
  const scrollTop = container?.scrollTop ?? 0
  const previousScrollHeight = container?.scrollHeight ?? 0

  // Calculate offset for older messages
  const currentMessageCount = claudeCodeMessages.value.length

  try {
    await fetchClaudeCodeMessages(
      urlProjectName.value,
      urlSessionId.value,
      50,  // limit
      currentMessageCount  // offset - skip messages we already have
    )

    if (options?.preserveScroll && container) {
      nextTick(() => {
        // Restore scroll position so user stays at same place
        const newScrollHeight = container.scrollHeight
        const scrollDiff = newScrollHeight - previousScrollHeight
        container.scrollTop = scrollTop + scrollDiff
      })
    }
  } finally {
    isLoadingMore.value = false
  }
}

// Handle scroll to load more messages (for history mode)
function handleMessagesScroll(event: Event) {
  if (viewMode.value !== 'history') return

  const container = event.target as HTMLElement
  const scrollTop = container.scrollTop

  // Load more when scrolled near the top (within 100px)
  if (scrollTop < 100) {
    loadMoreHistoryMessages({ preserveScroll: true })
  }
}

// Fetch sessions list
async function fetchSessions() {
  isLoadingSessions.value = true
  try {
    const data = await $fetch<any[]>('/api/chat-ws/sessions')
    sessions.value = data
  } catch (e) {
    console.error('[ChatV2] Failed to fetch sessions:', e)
  } finally {
    isLoadingSessions.value = false
  }
}

// Load a session
async function loadSession(sessionId: string) {
  sessionStore.setActiveSession(sessionId)

  // Fetch messages from server if stale
  if (sessionStore.isStale(sessionId) || !sessionStore.has(sessionId)) {
    await sessionStore.fetchFromServer(sessionId, {
      limit: 50,
      offset: 0,
    })
  }
}

// Create new session
async function createSession() {
  isCreatingSession.value = true
  try {
    const data = await $fetch<any>('/api/chat-ws/sessions', {
      method: 'POST',
      body: {
        agentSlug: props.executionOptions.agentSlug,
        workingDir: props.executionOptions.workingDir,
      },
    })

    sessionStore.setActiveSession(data.id)
    // Don't navigate away - just set the session
    // await router.push(`/cli/${data.id}`)
    // Fetch sessions in background without blocking
    fetchSessions()
  } catch (e: any) {
    console.error('[ChatV2] Failed to create session:', e)
    toast.add({
      title: 'Failed to create session',
      description: e.data?.message || e.message || 'Unknown error',
      color: 'error',
    })
  } finally {
    isCreatingSession.value = false
  }
}

// Select session (for live chat sessions, not history)
async function selectSession(sessionId: string | null) {
  if (sessionId) {
    await loadSession(sessionId)
  } else {
    await createSession()
  }
}

// Send message (works in both live and history mode)
async function handleSendMessage() {
  if (!inputText.value.trim() || isStreaming.value) return

  // If in history mode, start continuing the session
  if (viewMode.value === 'history' && !isContinuingHistory.value) {
    // Create a new session to continue the conversation
    isCreatingSession.value = true
    try {
      const data = await $fetch<any>('/api/chat-ws/sessions', {
        method: 'POST',
        body: {
          agentSlug: props.executionOptions.agentSlug,
          workingDir: props.executionOptions.workingDir,
          // Pass the history session ID for context (if backend supports resuming)
          resumeSessionId: urlSessionId.value,
        },
      })

      sessionStore.setActiveSession(data.id)
      isContinuingHistory.value = true

      // Now send the message with the new session
      const success = sendChat(inputText.value, {
        sessionId: data.id,
        agentSlug: props.executionOptions.agentSlug,
        workingDir: props.executionOptions.workingDir,
        permissionMode: selectedPermissionMode.value,
      })

      if (success) {
        inputText.value = ''
      }
    } catch (e: any) {
      console.error('[ChatV2] Failed to create session for history continuation:', e)
      toast.add({
        title: 'Failed to continue conversation',
        description: e.data?.message || e.message || 'Unknown error',
        color: 'error',
      })
    } finally {
      isCreatingSession.value = false
    }
    return
  }

  // Already continuing history or in live mode
  if (!currentSessionId.value) return

  const success = sendChat(inputText.value, {
    sessionId: currentSessionId.value,
    agentSlug: props.executionOptions.agentSlug,
    workingDir: props.executionOptions.workingDir,
    permissionMode: selectedPermissionMode.value,
  })

  if (success) {
    inputText.value = ''
  }
}

// Handle permission response
async function handlePermissionResponse(permissionId: string, decision: 'allow' | 'deny', remember = false) {
  respondToPermission(permissionId, decision, remember)
}

// Handle session renamed
async function handleSessionRenamed(payload: { projectName: string; sessionId: string; newName: string }) {
  console.log('[ChatV2] Session renamed:', payload)
  // TODO: Implement API call to rename session
  // For now, just log the event
}

// Handle session deleted
async function handleSessionDeleted(payload: { projectName: string; sessionId: string }) {
  console.log('[ChatV2] Session deleted:', payload)
  // TODO: Implement API call to delete session
  // If the deleted session is currently selected, clear selection
  if (urlSessionId.value === payload.sessionId) {
    handleSelectionCleared()
  }
}

// Handle file open (from tool use clicks)
function handleOpenFile(filePath: string) {
  console.log('[ChatV2] Open file:', filePath)
  // TODO: Could open in VS Code or another editor
  // For now, we can use the window.open with vscode:// protocol
  // or emit an event for parent handling
  if (filePath) {
    // Try to open in VS Code using the vscode:// protocol
    const vscodeUrl = `vscode://file${filePath}`
    window.open(vscodeUrl, '_blank')
  }
}
</script>

<template>
  <div class="flex-1 flex min-h-0">
    <!-- Left Sidebar - Claude Code History -->
    <div
      class="shrink-0 flex flex-col border-r transition-all duration-300"
      :style="{
        width: sidebarCollapsed ? '56px' : '320px',
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface)',
      }"
    >
      <!-- Projects Sidebar -->
      <ChatV2ProjectsSidebar
        :collapsed="sidebarCollapsed"
        :current-session-id="urlSessionId"
        :is-loading-messages="isLoadingClaudeCodeMessages"
        @project-selected="handleClaudeCodeProjectSelected"
        @session-selected="handleClaudeCodeSessionSelected"
        @new-chat="handleNewChat"
        @selection-cleared="handleSelectionCleared"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @session-renamed="handleSessionRenamed"
        @session-deleted="handleSessionDeleted"
      />
    </div>

    <!-- Right Panel - Chat Interface -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Header - Fixed height for consistent alignment -->
      <div class="shrink-0 flex items-center justify-between px-4 h-14 border-b" style="border-color: var(--border-subtle);">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- History Mode - Session Info -->
          <template v-if="viewMode === 'history'">
            <div class="flex flex-col justify-center min-w-0 py-1.5">
              <!-- Session Name -->
              <span class="text-[12px] font-medium truncate max-w-[500px] leading-tight" style="color: var(--text-primary);">
                {{ currentSessionSummary || 'Session' }}
              </span>
              <!-- Folder Name -->
              <span
                v-if="currentProjectDisplayName"
                class="text-[10px] font-mono truncate leading-tight mt-0.5"
                style="color: var(--text-tertiary);"
              >
                {{ currentProjectDisplayName }}
              </span>
            </div>
          </template>

          <!-- Live Mode Indicators -->
          <template v-else>
            <div class="flex items-center gap-2">
              <!-- Connection Status -->
              <div
                v-if="isConnected"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(13, 188, 121, 0.1); color: #0dbc79;"
              >
                <div class="size-1.5 rounded-full animate-pulse" style="background: #0dbc79;" />
                Connected
              </div>
              <div
                v-else
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: var(--surface-raised); color: var(--text-disabled);"
              >
                <div class="size-1.5 rounded-full" style="background: var(--text-disabled);" />
                Disconnected
              </div>

              <!-- Streaming indicator -->
              <div
                v-if="isStreaming"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(229, 169, 62, 0.1); color: var(--accent);"
              >
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
                Generating...
              </div>
            </div>
          </template>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Permission Mode Selector (only when viewing a specific chat session) -->
          <ChatV2PermissionModeSelector
            v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && currentSessionId)"
            v-model="selectedPermissionMode"
            :options="permissionModeOptions"
          />

          <!-- Session ID (only in live mode) -->
          <span v-if="viewMode === 'live' && currentSessionId" class="text-[10px] font-mono" style="color: var(--text-tertiary);">
            {{ currentSessionId.slice(0, 8) }}
          </span>
        </div>
      </div>

      <!-- Permission Banner -->
      <ChatV2PermissionBanner
        v-if="hasPendingPermissions"
        :permissions="permissions.getAllPending()"
        @respond="handlePermissionResponse"
      />

      <!-- Messages -->
      <div
        ref="messagesContainerRef"
        class="flex-1 overflow-y-auto p-4 space-y-4"
        style="background: var(--surface-base);"
        @scroll="handleMessagesScroll"
      >
        <!-- Loading state for creating new session -->
        <div v-if="isCreatingSession" class="flex items-center justify-center h-full">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--accent);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Creating new chat...</p>
          </div>
        </div>

        <!-- Loading state for history (only show for initial load, not when loading more) -->
        <div v-else-if="viewMode === 'history' && isLoadingHistoryWithDelay && !isLoadingMore" class="flex items-center justify-center h-full">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--text-secondary);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Loading history...</p>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="displayMessages.length === 0 && !isStreaming && !isLoadingClaudeCodeMessages && !isLoadingHistoryWithDelay" class="flex items-center justify-center h-full">
          <div class="text-center max-w-md">
            <div class="size-16 mx-auto mb-4 rounded-full flex items-center justify-center" style="background: var(--surface-raised);">
              <UIcon :name="viewMode === 'history' ? 'i-lucide-history' : 'i-lucide-message-circle'" class="size-8" style="color: var(--text-secondary);" />
            </div>
            <h2 class="text-[16px] font-semibold mb-2" style="color: var(--text-primary);">
              {{ viewMode === 'history' ? 'No Messages Found' : (currentSessionId ? 'Start a Conversation' : 'Select a Session') }}
            </h2>
            <p class="text-[13px]" style="color: var(--text-secondary);">
              {{ viewMode === 'history' ? 'This session has no displayable messages.' : (currentSessionId ? 'Ask Claude anything. Chat v2 with enhanced permissions and streaming.' : 'Select a session from Claude Code history or click "New Chat" to start.') }}
            </p>
          </div>
        </div>

        <!-- Message list -->
        <template v-else>
          <!-- Loading more indicator at top -->
          <div
            v-if="viewMode === 'history' && isLoadingMore"
            class="flex items-center justify-center py-4"
          >
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin mr-2" style="color: var(--text-secondary);" />
            <span class="text-[12px]" style="color: var(--text-secondary);">Loading older messages...</span>
          </div>

          <!-- Scroll to top hint when more messages available -->
          <div
            v-else-if="viewMode === 'history' && claudeCodeMessagesHasMore && !isLoadingMore"
            class="flex items-center justify-center py-2"
          >
            <span class="text-[11px]" style="color: var(--text-tertiary);">
              ↑ Scroll up for older messages
            </span>
          </div>

          <ChatV2Messages
            :messages="displayMessages"
            :is-streaming="isStreaming"
            @permission-respond="handlePermissionResponse"
            @open-file="handleOpenFile"
          />
        </template>
      </div>

      <!-- Input -->
      <div class="shrink-0 border-t relative" style="border-color: var(--border-subtle);">
        <!-- History mode context indicator (floating, hidden when input is focused) -->
        <Transition name="slide-fade">
          <div
            v-if="viewMode === 'history' && !isContinuingHistory && !isInputFocused"
            class="absolute bottom-full left-0 right-0 px-3 py-1.5 flex items-center justify-between z-10"
            style="background: var(--surface-raised); border-top: 1px solid var(--border-subtle);"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-history" class="size-3" style="color: var(--accent);" />
              <span class="text-[10px]" style="color: var(--text-secondary);">
                Continue this conversation or start fresh
              </span>
            </div>
            <button
              class="px-2 py-0.5 rounded text-[10px] font-medium hover-bg transition-all"
              style="background: var(--surface); color: var(--text-tertiary);"
              @click="handleNewChat"
            >
              <UIcon name="i-lucide-plus" class="size-3 inline-block mr-0.5" />
              New Chat
            </button>
          </div>
        </Transition>

        <!-- Continuing history indicator (floating) -->
        <div
          v-if="isContinuingHistory"
          class="absolute bottom-full left-0 right-0 px-3 py-1 flex items-center gap-2 z-10"
          style="background: rgba(229, 169, 62, 0.08); border-top: 1px solid var(--border-subtle);"
        >
          <UIcon name="i-lucide-git-branch" class="size-3" style="color: var(--accent);" />
          <span class="text-[10px]" style="color: var(--accent);">
            Continuing from history
          </span>
        </div>

        <!-- Chat Input - Works in both modes -->
        <ChatV2Input
          v-model="inputText"
          :disabled="(!currentSessionId && viewMode === 'live') || !isConnected || isStreaming || isCreatingSession"
          :is-streaming="isStreaming"
          :placeholder="viewMode === 'history' && !isContinuingHistory ? 'Continue this conversation...' : 'Message Claude...'"
          @send="handleSendMessage"
          @abort="abort()"
          @focus="isInputFocused = true"
          @blur="isInputFocused = false"
        />
      </div>

    </div>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
