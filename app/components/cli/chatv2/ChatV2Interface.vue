<script setup lang="ts">
import { useChatV2Handler } from '~/composables/useChatV2Handler'
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'
import { convertToDisplayMessages } from '~/utils/chatMessageConverter'
import { convertClaudeCodeMessages } from '~/utils/claudeCodeMessageConverter'
import type { DisplayChatMessage, PermissionMode } from '~/types'
import { MODEL_OPTIONS_CHAT, DEFAULT_MODEL } from '~/utils/models'

const props = defineProps<{
  executionOptions: {
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
const history = useClaudeCodeHistory()
const {
  messages: claudeCodeMessages,
  isLoadingMessages: isLoadingClaudeCodeMessages,
  messagesHasMore: claudeCodeMessagesHasMore,
  fetchMessages: fetchClaudeCodeMessages,
  renameSession,
  deleteSession
} = history

// Session list
const sessions = ref<any[]>([])
const isLoadingSessions = ref(false)

// UI state
const inputText = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const sidebarCollapsed = ref(false)
const isCreatingSession = ref(false)
const isInputFocused = ref(false)

// Responsive sidebar width based on window size
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const isSmallScreen = computed(() => windowWidth.value < 1024)
const isMobileScreen = computed(() => windowWidth.value < 768)

function updateWidth() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', updateWidth)
  // Auto-collapse sidebar on small laptop screens
  if (windowWidth.value < 1100) {
    sidebarCollapsed.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth)
})

const sidebarWidth = computed(() => {
  if (sidebarCollapsed.value) return '56px'
  if (windowWidth.value < 1280) return '260px' // Smaller sidebar for laptops
  return '320px' // Standard width for desktops
})

// Track the working directory for the current session (defaults to prop)
const localWorkingDir = ref(props.executionOptions.workingDir || '')

// Watch prop changes and update local state if not in a session
watch(() => props.executionOptions.workingDir, (newDir) => {
  if (!currentSessionId.value && newDir) {
    localWorkingDir.value = newDir
  }
})

// View mode: 'live' (new chat) or 'history' (viewing Claude Code history)
const viewMode = ref<'live' | 'history'>('live')

// Track if we've explicitly started a "New Chat" session
const isLiveChat = ref(false)

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
  { value: 'default', label: 'Ask', description: 'Ask for permission on each action' },
  { value: 'skip', label: 'Skip', description: 'Allow all actions for this session' },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits' },
  { value: 'plan', label: 'Plan Mode', description: 'Plan only, no execution' },
  { value: 'bypassPermissions', label: 'Dangerous', description: 'Full bypass - dangerous mode' },
]

const selectedPermissionMode = ref<PermissionMode>('default')

// Model selector — options and default come from the shared model registry
const selectedModel = ref<string>(DEFAULT_MODEL)

// Thinking mode toggle
const thinkingEnabled = ref(false)

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

  // Live session - only show messages from active session, no fallback to 'pending'
  if (!currentSessionId.value) {
    return []
  }

  const messages = sessionStore.getMessages(currentSessionId.value)
  return convertToDisplayMessages(messages, streamingText.value)
})

// Fetch sessions on mount (no automatic WebSocket connection - connect lazily when sending)
onMounted(async () => {
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
  
  // Ensure we are in live view mode but haven't started a chat yet
  viewMode.value = 'live'
  isLiveChat.value = false
  
  // Clear any history selection in shared state
  history.selectedSession.value = null
}

// Utility: delay for minimum loading time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Handle Claude Code history session selection (no URL navigation)
async function handleClaudeCodeSessionSelected(payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }) {
  viewMode.value = 'history'
  isLiveChat.value = false
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
  isLiveChat.value = false
  urlProjectName.value = null
  urlSessionId.value = null
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = ''
  isContinuingHistory.value = false
}

// Handle new chat - switch to live mode without affecting sidebar
// Note: We don't pre-create a session anymore. The SDK will create the session
// when the first message is sent, and we'll get the session ID via session_created event.
function handleNewChat(payload?: { workingDir?: string; projectDisplayName?: string }) {
  viewMode.value = 'live'
  isLiveChat.value = true
  urlProjectName.value = null
  urlSessionId.value = null
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload?.projectDisplayName || ''
  isContinuingHistory.value = false
  // Clear the current session so the user can start fresh
  sessionStore.setActiveSession(null)
  
  // Clear history selection
  history.selectedSession.value = null
  // If no working directory, also clear project selection
  if (!payload?.workingDir) {
    history.selectedProject.value = null
  }

  // If a working directory was provided, update the local working dir
  if (payload?.workingDir) {
    localWorkingDir.value = payload.workingDir
  } else {
    // Reset to prop's default if not provided
    localWorkingDir.value = props.executionOptions.workingDir || ''
  }
}


// Watch for session created event from SDK
watch(currentSessionId, async (newId, oldId) => {
  if (newId && (!oldId || oldId.startsWith('new-session-'))) {
    console.log('[ChatV2] New session created, refreshing history:', newId)
    
    // Refresh the projects list first
    await history.fetchProjects()
    
    // If we have a working directory, try to find the matching project
    if (localWorkingDir.value) {
      const projects = history.projects.value
      // Normalize path for matching (remove trailing slash)
      const normalizedDir = localWorkingDir.value.replace(/\/$/, '')
      const matchingProject = projects.find(p => p.path.replace(/\/$/, '') === normalizedDir)
      
      if (matchingProject) {
        // Switch view to sessions for this project in the sidebar
        urlProjectName.value = matchingProject.name
        currentProjectDisplayName.value = matchingProject.displayName
        
        // Update shared state for sidebar to know which project is selected
        history.selectedProject.value = matchingProject
        
        // Refresh sessions list for this project to include the new one
        await history.fetchSessions(matchingProject.name)
        
        // Mark this session as selected in history UI
        urlSessionId.value = newId
        
        // Find the newly created session in the list to get its summary
        const newSession = history.sessions.value.find(s => s.id === newId)
        if (newSession) {
          currentSessionSummary.value = newSession.summary
          history.selectedSession.value = newSession
        }
      } else {
        // If not matching any project yet, we could still refresh projects
        // in case a new project folder was created by the SDK
        await history.fetchProjects()
      }
    }
  }
})

// Debounce timer for history refreshes during live chat
let refreshTimer: NodeJS.Timeout | null = null
const REFRESH_DEBOUNCE_MS = 2000

// Refresh history sessions list if in a project
async function refreshHistorySessions() {
  if (viewMode.value === 'live' && urlProjectName.value) {
    await history.fetchSessions(urlProjectName.value)
    
    // Also update current session info from history
    if (currentSessionId.value) {
      const newSession = history.sessions.value.find(s => s.id === currentSessionId.value)
      if (newSession) {
        currentSessionSummary.value = newSession.summary
        history.selectedSession.value = newSession
      }
    }
  }
}

// Auto-scroll on new messages (when in live mode or continuing history)
watch([displayMessages, streamingText], () => {
  // Trigger history refresh (debounced)
  if (viewMode.value === 'live' && urlProjectName.value) {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshHistorySessions()
    }, REFRESH_DEBOUNCE_MS)
  }

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
        workingDir: localWorkingDir.value,
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
async function handleSendMessage(images: string[] = []) {
  if ((!inputText.value.trim() && images.length === 0) || isStreaming.value) return

  // If in history mode, start continuing the session
  if (viewMode.value === 'history' && !isContinuingHistory.value) {
    // For history continuation, we use the existing SDK session ID
    isContinuingHistory.value = true

    // Send the message with the history session ID to resume that SDK session
    const success = sendChat(inputText.value, {
      sessionId: urlSessionId.value || undefined, // SDK session ID from history
      workingDir: localWorkingDir.value || undefined,
      permissionMode: selectedPermissionMode.value,
      model: selectedModel.value,
      thinkingEnabled: thinkingEnabled.value,
      images,
    })

    if (success) {
      inputText.value = ''
    }
    return
  }

  // Live mode - send message
  // sendChat() now generates temp session IDs (new-session-{timestamp}) for new sessions
  // The backend will respond with session_created event containing the real session ID
  const success = sendChat(inputText.value, {
    sessionId: currentSessionId.value || undefined, // Will generate temp ID if undefined
    workingDir: localWorkingDir.value || undefined,
    permissionMode: selectedPermissionMode.value,
    model: selectedModel.value,
    thinkingEnabled: thinkingEnabled.value,
    images,
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
  console.log('[ChatV2] Session renaming:', payload)
  try {
    await renameSession(payload.projectName, payload.sessionId, payload.newName)

    // Update local state if this is the current session
    if (urlSessionId.value === payload.sessionId) {
      currentSessionSummary.value = payload.newName
    }

    toast.add({
      title: 'Session renamed',
      color: 'success',
      timeout: 2000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to rename session:', e)
    toast.add({
      title: 'Failed to rename session',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Handle session deleted
async function handleSessionDeleted(payload: { projectName: string; sessionId: string }) {
  console.log('[ChatV2] Session deleting:', payload)
  try {
    await deleteSession(payload.projectName, payload.sessionId)

    // If the deleted session is currently selected, clear selection
    if (urlSessionId.value === payload.sessionId) {
      handleSelectionCleared()
    }

    toast.add({
      title: 'Session deleted',
      color: 'success',
      timeout: 2000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to delete session:', e)
    toast.add({
      title: 'Failed to delete session',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

const { openFile } = useFileEditor()

// Handle file open (from tool use clicks)
function handleOpenFile(filePath: string) {
  console.log('[ChatV2] Open file:', filePath)
  if (filePath) {
    openFile(filePath)
  }
}
</script>

<template>
  <div class="flex-1 flex min-h-0">
    <!-- Left Sidebar - Claude Code History -->
    <div
      class="shrink-0 flex flex-col border-r transition-all duration-300"
      :style="{
        width: sidebarWidth,
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
    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <!-- Header - Fixed height for consistent alignment -->
      <div class="shrink-0 flex items-center justify-between px-3 md:px-4 h-14 border-b" style="border-color: var(--border-subtle);">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- History Mode - Session Info -->
          <template v-if="viewMode === 'history'">
            <div class="flex flex-col justify-center min-w-0 py-1.5">
              <!-- Session Name -->
              <span class="text-[12px] md:text-[13px] font-medium truncate max-w-[300px] md:max-w-[500px] leading-tight" style="color: var(--text-primary);">
                {{ currentSessionSummary || 'Session' }}
              </span>
              <!-- Folder Name -->
              <span
                v-if="currentProjectDisplayName"
                class="text-[9px] md:text-[10px] font-mono truncate leading-tight mt-0.5"
                style="color: var(--text-tertiary);"
              >
                {{ currentProjectDisplayName }}
              </span>
            </div>
          </template>

          <!-- Live Mode Indicators -->
          <template v-else>
            <div class="flex items-center gap-1.5 md:gap-2">
              <!-- Connection Status -->
              <div
                v-if="isConnected"
                class="flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-1 rounded text-[10px] md:text-[11px] font-medium"
                style="background: rgba(13, 188, 121, 0.1); color: #0dbc79;"
                :title="isSmallScreen ? 'Connected' : ''"
              >
                <div class="size-1.5 rounded-full animate-pulse" style="background: #0dbc79;" />
                <span v-if="!isSmallScreen">Connected</span>
              </div>
              <div
                v-else
                class="flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-1 rounded text-[10px] md:text-[11px] font-medium"
                style="background: var(--surface-raised); color: var(--text-disabled);"
                :title="isSmallScreen ? 'Disconnected' : ''"
              >
                <div class="size-1.5 rounded-full" style="background: var(--text-disabled);" />
                <span v-if="!isSmallScreen">Disconnected</span>
              </div>

              <!-- Streaming indicator -->
              <div
                v-if="isStreaming"
                class="flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-1 rounded text-[10px] md:text-[11px] font-medium"
                style="background: rgba(229, 169, 62, 0.1); color: var(--accent);"
              >
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
                <span v-if="!isSmallScreen">Generating...</span>
              </div>

              <!-- Project/Folder indicator in live mode -->
              <div
                v-if="localWorkingDir"
                class="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-1 rounded text-[10px] md:text-[11px] font-medium max-w-[120px] md:max-w-[200px]"
                style="background: var(--surface-raised); color: var(--text-secondary);"
                :title="localWorkingDir"
              >
                <UIcon :name="currentProjectDisplayName ? 'i-lucide-folder-root' : 'i-lucide-folder'" class="size-3 shrink-0" />
                <span class="truncate">{{ currentProjectDisplayName || localWorkingDir.split('/').filter(Boolean).pop() || localWorkingDir }}</span>
              </div>
            </div>
          </template>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Model Selector -->
          <ChatV2ModelSelector
            v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && isLiveChat)"
            v-model="selectedModel"
            :options="MODEL_OPTIONS_CHAT"
            class="scale-90 md:scale-100 origin-right"
          />

          <!-- Thinking Mode Toggle (only when viewing a specific chat session) -->
          <button
            v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && currentSessionId)"
            class="flex items-center gap-1 px-1.5 md:px-2.5 py-1.5 rounded-lg text-[10px] md:text-[11px] font-medium transition-all shrink-0"
            :style="{
              background: thinkingEnabled ? 'rgba(139, 92, 246, 0.1)' : 'var(--surface-raised)',
              color: thinkingEnabled ? '#8b5cf6' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }"
            @click="thinkingEnabled = !thinkingEnabled"
            :title="thinkingEnabled ? 'Thinking mode: ON' : 'Thinking mode: OFF'"
          >
            <UIcon name="i-lucide-brain" class="size-3 md:size-3.5" />
            <span v-if="thinkingEnabled || !isSmallScreen">{{ thinkingEnabled ? 'On' : 'Off' }}</span>
          </button>

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
        class="flex-1 overflow-y-auto px-2 py-3 md:p-4 space-y-4"
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

        <!-- Welcome / Select State -->
        <div v-else-if="viewMode === 'live' && !isLiveChat && !currentSessionId" class="flex items-center justify-center h-full text-center">
          <div class="max-w-md px-6">
            <div class="size-20 mx-auto mb-6 rounded-3xl flex items-center justify-center" style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.1) 0%, rgba(229, 169, 62, 0.05) 100%); border: 1px solid rgba(229, 169, 62, 0.1);">
              <UIcon :name="urlProjectName ? 'i-lucide-folder-root' : 'i-lucide-terminal'" class="size-10" style="color: var(--accent);" />
            </div>
            <h2 class="text-[20px] font-semibold mb-3" style="color: var(--text-primary); font-family: var(--font-sans);">
              {{ urlProjectName ? currentProjectDisplayName : 'Claude Code CLI' }}
            </h2>
            <p class="text-[14px] leading-relaxed mb-8" style="color: var(--text-secondary);">
              {{ urlProjectName ? 'Select a session from this folder or start a new conversation below.' : 'Select an existing session from the history or start a new conversation to begin.' }}
            </p>
            <div class="flex flex-col gap-3">
              <button
                class="w-full py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                style="background: var(--accent); color: white;"
                @click="handleNewChat({ workingDir: localWorkingDir })"
              >
                <UIcon name="i-lucide-plus" class="size-4" />
                Start a New Chat {{ urlProjectName ? 'in Folder' : '' }}
              </button>
              <p v-if="!urlProjectName" class="text-[11px]" style="color: var(--text-tertiary);">
                Browse your project history in the left sidebar
              </p>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="displayMessages.length === 0 && !isStreaming && !isLoadingClaudeCodeMessages && !isLoadingHistoryWithDelay" class="flex items-center justify-center h-full">
          <div class="text-center max-w-md">
            <div class="size-16 mx-auto mb-4 rounded-full flex items-center justify-center" style="background: var(--surface-raised);">
              <UIcon :name="viewMode === 'history' ? 'i-lucide-history' : 'i-lucide-message-circle'" class="size-8" style="color: var(--text-secondary);" />
            </div>
            <h2 class="text-[16px] font-semibold mb-2" style="color: var(--text-primary);">
              {{ viewMode === 'history' ? 'No Messages Found' : 'Start a Conversation' }}
            </h2>
            <p class="text-[13px]" style="color: var(--text-secondary);">
              {{ viewMode === 'history' ? 'This session has no displayable messages.' : 'Ask Claude anything. Your message will create a new session automatically.' }}
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
      <div 
        v-if="isLiveChat || currentSessionId || (viewMode === 'history' && urlSessionId)"
        class="shrink-0 border-t relative" 
        style="border-color: var(--border-subtle);"
      >


        <!-- Chat Input - Works in both modes -->
        <!-- No longer requires pre-created session - SDK will create session on first message -->
        <ChatV2Input
          v-model="inputText"
          :disabled="isStreaming || isCreatingSession"
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
