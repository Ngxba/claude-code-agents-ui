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

// Route for URL-based session navigation
const route = useRoute()

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
  setCurrentSessionId,
  contextMonitor,
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

// Handle project renamed
async function handleProjectRenamed(payload: { projectName: string; newName: string }) {
  console.log('[ChatV2] Project renaming:', payload)
  try {
    await history.renameProject(payload.projectName, payload.newName)

    // Update local state if this is the current project
    if (urlProjectName.value === payload.projectName) {
      currentProjectDisplayName.value = payload.newName
    }

    toast.add({
      title: 'Project renamed',
      color: 'success',
      duration: 2000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to rename project:', e)
    toast.add({
      title: 'Failed to rename project',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Handle project deleted
async function handleProjectDeleted(payload: { projectName: string }) {
  console.log('[ChatV2] Project deleting:', payload)
  try {
    await history.deleteProject(payload.projectName)

    // If the deleted project is currently selected, clear selection
    if (urlProjectName.value === payload.projectName) {
      handleSelectionCleared()
    }

    toast.add({
      title: 'Project history deleted',
      color: 'success',
      duration: 2000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to delete project:', e)
    toast.add({
      title: 'Failed to delete project',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Session list
const sessions = ref<any[]>([])
const isLoadingSessions = ref(false)

// UI state
const inputText = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const showContextDetails = ref(false)
const isCreatingSession = ref(false)
const isInputFocused = ref(false)

// Context details sidebar drag-to-resize
const contextSidebarWidth = ref(400)
const isDraggingContextSidebar = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

function onContextSidebarDragStart(e: MouseEvent) {
  if (isMobileScreen.value) return
  isDraggingContextSidebar.value = true
  dragStartX.value = e.clientX
  dragStartWidth.value = contextSidebarWidth.value
  document.body.classList.add('dragging-context-sidebar')
  document.addEventListener('mousemove', onContextSidebarDragMove)
  document.addEventListener('mouseup', onContextSidebarDragEnd)
  e.preventDefault()
}

function onContextSidebarDragMove(e: MouseEvent) {
  if (!isDraggingContextSidebar.value) return
  const delta = dragStartX.value - e.clientX
  contextSidebarWidth.value = Math.min(800, Math.max(240, dragStartWidth.value + delta))
}

function onContextSidebarDragEnd() {
  isDraggingContextSidebar.value = false
  document.body.classList.remove('dragging-context-sidebar')
  document.removeEventListener('mousemove', onContextSidebarDragMove)
  document.removeEventListener('mouseup', onContextSidebarDragEnd)
}

// Responsive sidebar width based on window size
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const isSmallScreen = computed(() => windowWidth.value < 1024)
const isMobileScreen = computed(() => false)
const isHeaderTwoRow = computed(() => false)

function updateWidth() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', updateWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth)
  document.removeEventListener('mousemove', onContextSidebarDragMove)
  document.removeEventListener('mouseup', onContextSidebarDragEnd)
  document.removeEventListener('mousemove', onLeftSidebarDragMove)
  document.removeEventListener('mouseup', onLeftSidebarDragEnd)
})

watch(isMobileScreen, (isMobile) => {
  if (!isMobile) {
    mobileSidebarOpen.value = false
    sidebarCollapsed.value = false
  }
})

function getDefaultSidebarWidth() {
  if (typeof window === 'undefined') return 320
  if (window.innerWidth < 1024) return 220
  if (window.innerWidth < 1280) return 260
  return 320
}
const leftSidebarWidth = ref(getDefaultSidebarWidth())

const sidebarWidth = computed(() =>
  sidebarCollapsed.value ? '56px' : `${leftSidebarWidth.value}px`
)

// Left sidebar drag-to-resize
const isDraggingLeftSidebar = ref(false)
const leftDragStartX = ref(0)
const leftDragStartWidth = ref(0)

function onLeftSidebarDragStart(e: MouseEvent) {
  if (sidebarCollapsed.value) return
  isDraggingLeftSidebar.value = true
  leftDragStartX.value = e.clientX
  leftDragStartWidth.value = leftSidebarWidth.value
  document.body.classList.add('dragging-left-sidebar')
  document.addEventListener('mousemove', onLeftSidebarDragMove)
  document.addEventListener('mouseup', onLeftSidebarDragEnd)
  e.preventDefault()
}

function onLeftSidebarDragMove(e: MouseEvent) {
  if (!isDraggingLeftSidebar.value) return
  const delta = e.clientX - leftDragStartX.value
  leftSidebarWidth.value = Math.min(480, Math.max(160, leftDragStartWidth.value + delta))
}

function onLeftSidebarDragEnd() {
  isDraggingLeftSidebar.value = false
  document.body.classList.remove('dragging-left-sidebar')
  document.removeEventListener('mousemove', onLeftSidebarDragMove)
  document.removeEventListener('mouseup', onLeftSidebarDragEnd)
}

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
const isInitialScroll = ref(false)

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
  // Determine which session ID to use for live messages
  const liveSessionId = currentSessionId.value || urlSessionId.value

  // If viewing Claude Code history
  if (viewMode.value === 'history') {
    const historyMessages = convertClaudeCodeMessages(claudeCodeMessages.value)
    
    // Always check for live messages if we have a session ID
    if (liveSessionId) {
      const liveMessages = sessionStore.getMessages(liveSessionId)
      // If we have live messages or streaming text, combine them
      if (liveMessages.length > 0 || streamingText.value) {
        const newMessages = convertToDisplayMessages(liveMessages, streamingText.value)
        return [...historyMessages, ...newMessages]
      }
    }
    
    return historyMessages
  }

  // Live session only (new chat)
  if (!liveSessionId) {
    return []
  }

  const messages = sessionStore.getMessages(liveSessionId)
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

// Handle Claude Code project selection
function handleClaudeCodeProjectSelected(payload: { projectName: string; projectDisplayName: string }) {
  urlProjectName.value = payload.projectName
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload.projectDisplayName

  // Ensure we are in live view mode but haven't started a chat yet
  viewMode.value = 'live'
  isLiveChat.value = false

  // Clear any history selection in shared state
  history.selectedSession.value = null

  // Update URL to reflect selected project
  const targetPath = `/cli/project/${encodeURIComponent(payload.projectName)}`
  if (route.path !== targetPath) {
    navigateTo(targetPath, { replace: false })
  }
}

// Utility: delay for minimum loading time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Scroll to bottom helper — returns a Promise that resolves once scroll + layout settle
function scrollToBottom(behavior: ScrollBehavior = 'auto'): Promise<void> {
  return new Promise(resolve => {
    nextTick(() => {
      if (!messagesContainerRef.value) {
        isInitialScroll.value = false
        resolve()
        return
      }
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight

      // Wait for layout shifts from async rendering (markdown, code blocks, images)
      // 300ms gives enough time for most content to fully render and calculate heights
      setTimeout(() => {
        if (messagesContainerRef.value) {
          messagesContainerRef.value.scrollTo({
            top: messagesContainerRef.value.scrollHeight,
            behavior
          })
        }
        // Make container visible — no CSS transition so it appears instantly (no flash)
        isInitialScroll.value = false
        resolve()
      }, 300)
    })
  })
}

// Handle Claude Code history session selection
async function handleClaudeCodeSessionSelected(payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }) {
  viewMode.value = 'history'
  isLiveChat.value = false
  urlProjectName.value = payload.projectName
  urlSessionId.value = payload.sessionId
  setCurrentSessionId(payload.sessionId) // Sync active session
  currentSessionSummary.value = payload.sessionSummary
  currentProjectDisplayName.value = payload.projectDisplayName
  isContinuingHistory.value = false  // Reset when selecting a new history session
  isInitialScroll.value = true // Set initial scroll flag
  isLoadingHistoryWithDelay.value = true // Show spinner before any awaits to avoid blank gap

  // Update URL only if not already there (avoids redundant navigation when triggered by route watcher)
  const targetPath = `/cli/project/${encodeURIComponent(payload.projectName)}/session/${encodeURIComponent(payload.sessionId)}`
  if (route.path !== targetPath) {
    await navigateTo(targetPath, { replace: false })
  }

  // Load messages with minimum 1000ms delay for smooth UX
  const [historyResult] = await Promise.all([
    fetchClaudeCodeMessages(payload.projectName, payload.sessionId, 100, 0),
    delay(1000)
  ])

  if (historyResult?.tokenUsage) {
    contextMonitor.updateTokenUsage(historyResult.tokenUsage)
  } else {
    contextMonitor.resetMetrics()
  }

  // Scroll to bottom first — waits for layout to settle and makes messages visible
  // Only then hide the spinner so there's no blank flash between loader and content
  await scrollToBottom()
  isLoadingHistoryWithDelay.value = false
}

// Handle selection cleared (back to projects list)
function handleSelectionCleared() {
  viewMode.value = 'live'
  isLiveChat.value = false
  urlProjectName.value = null
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = ''
  isContinuingHistory.value = false
  contextMonitor.resetMetrics()
  if (route.path !== '/cli') {
    navigateTo('/cli', { replace: false })
  }
}

// Handle new chat - switch to live mode without affecting sidebar
// Note: We don't pre-create a session anymore. The SDK will create the session
// when the first message is sent, and we'll get the session ID via session_created event.
function handleNewChat(payload?: { workingDir?: string; projectDisplayName?: string }) {
  viewMode.value = 'live'
  isLiveChat.value = true
  urlProjectName.value = null
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload?.projectDisplayName || ''
  isContinuingHistory.value = false
  // Clear the current session so the user can start fresh
  sessionStore.setActiveSession(null)
  contextMonitor.resetMetrics()
  
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

  if (route.path !== '/cli') {
    navigateTo('/cli', { replace: false })
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

        // Update URL to reflect the newly created session
        // Use replace:true so back button skips the "new chat" empty state
        await navigateTo(
          `/cli/project/${encodeURIComponent(matchingProject.name)}/session/${encodeURIComponent(newId)}`,
          { replace: true }
        )
      } else {
        // If not matching any project yet, we could still refresh projects
        // in case a new project folder was created by the SDK
        await history.fetchProjects()
      }
    }
  }
})

// Deep link / browser nav: sync URL params → internal session state
// Runs on mount (immediate) and whenever route params or projects change (browser back/forward)
watch(
  () => ({
    projectName: route.params.projectName as string | undefined,
    sessionId: route.params.sessionId as string | undefined,
    projectsLoaded: history.projects.value.length > 0,
  }),
  async ({ projectName, sessionId, projectsLoaded }) => {
    // No params — nothing to restore
    if (!projectName) return

    // Wait for projects to be loaded before resolving metadata
    if (!projectsLoaded) return

    const project = history.projects.value.find(p => p.name === projectName)
    const projectDisplayName = project?.displayName || projectName

    if (sessionId) {
      // Full session URL: /cli/project/:projectName/session/:sessionId
      // Guard: already showing this session
      if (urlProjectName.value === projectName && urlSessionId.value === sessionId) return

      // Fetch sessions for this project if not already loaded
      if (history.selectedProject.value?.name !== projectName) {
        history.selectedProject.value = project || null
        await history.fetchSessions(projectName)
      }

      const session = history.sessions.value.find(s => s.id === sessionId)
      const sessionSummary = session?.summary || ''

      await handleClaudeCodeSessionSelected({
        projectName,
        sessionId,
        sessionSummary,
        projectDisplayName,
      })
    } else {
      // Project-only URL: /cli/project/:projectName
      // Guard: already showing this project with no session
      if (urlProjectName.value === projectName && !urlSessionId.value) return

      handleClaudeCodeProjectSelected({ projectName, projectDisplayName })
    }
  },
  { immediate: true }
)

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

  if (viewMode.value === 'live' || isContinuingHistory.value) {
    scrollToBottom()
  }
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

// Composables for slash command resolution
const { commands: allCommands, fetchAll: fetchCommands } = useCommands()
const { skills: allSkills, fetchAll: fetchSkills } = useSkills()

// Ensure commands/skills are loaded for slash command matching
onMounted(async () => {
  await Promise.all([
    allCommands.value.length === 0 ? fetchCommands() : Promise.resolve(),
    allSkills.value.length === 0 ? fetchSkills() : Promise.resolve(),
  ])
})

/**
 * Execute a slash command via HTTP API (not WebSocket).
 * Built-in commands are handled inline; custom commands are re-submitted as regular messages.
 */
async function executeSlashCommand(rawInput: string): Promise<boolean> {
  const trimmed = rawInput.trim()
  const firstSpace = trimmed.indexOf(' ')
  const commandName = firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed
  const argsStr = firstSpace > 0 ? trimmed.slice(firstSpace + 1).trim() : ''
  const args = argsStr ? argsStr.split(/\s+/) : []

  // Find matching command or skill
  const nameWithoutSlash = commandName.slice(1) // remove leading "/"
  const matchedCommand = allCommands.value.find(c => c.frontmatter.name === nameWithoutSlash)
  const matchedSkill = allSkills.value.find(s => s.frontmatter.name === nameWithoutSlash)

  // Determine path for custom commands/skills
  const commandPath = matchedCommand?.filePath || matchedSkill?.filePath || undefined

  // If no match found in custom commands/skills and not a known built-in, just send as regular message
  const knownBuiltins = ['help', 'clear', 'model', 'cost', 'memory', 'config', 'status']
  if (!commandPath && !knownBuiltins.includes(nameWithoutSlash)) {
    return false // Not a command — let it be sent as a regular message
  }

  // Add user message bubble so the command shows in chat
  addLocalUserMessage(rawInput)

  try {
    const response = await $fetch<any>('/api/commands/execute', {
      method: 'POST',
      body: {
        commandName,
        commandPath,
        args,
        context: {
          projectPath: localWorkingDir.value,
          model: selectedModel.value,
          sessionId: currentSessionId.value,
        },
      },
    })

    if (response.type === 'builtin') {
      handleBuiltInCommandResult(response)
    } else if (response.type === 'custom') {
      // Re-submit the processed command content as a regular message
      sendRegularMessage(response.content, [])
    }

    return true
  } catch (err: any) {
    console.error('[ChatV2] Error executing command:', err)
    // Add error as assistant message
    addLocalAssistantMessage(`Error executing command: ${err.data?.message || err.message || 'Unknown error'}`)
    return true // consumed the command (even though it errored)
  }
}

/**
 * Handle built-in command results by adding messages to the chat
 */
function handleBuiltInCommandResult(result: any) {
  const { action, data } = result
  switch (action) {
    case 'clear':
      if (currentSessionId.value) {
        sessionStore.clearRealtime(currentSessionId.value)
      }
      addLocalAssistantMessage(data.message)
      break
    case 'help':
      addLocalAssistantMessage(data.content)
      break
    case 'model':
      addLocalAssistantMessage(data.message)
      break
    case 'cost': {
      const msg = `**Token Usage**: ${data.tokenUsage.used.toLocaleString()} / ${data.tokenUsage.total.toLocaleString()} (${data.tokenUsage.percentage}%)\n\n**Model**: ${data.model}`
      addLocalAssistantMessage(msg)
      break
    }
    case 'status': {
      const msg = `**System Status**\n- Uptime: ${data.uptime}\n- Model: ${data.model}\n- Node.js: ${data.nodeVersion}\n- Platform: ${data.platform}`
      addLocalAssistantMessage(msg)
      break
    }
    case 'memory':
      addLocalAssistantMessage(data.message)
      break
    case 'config':
      addLocalAssistantMessage(data.message)
      break
    default:
      addLocalAssistantMessage(`Command executed: ${action}`)
  }
}

/**
 * Add a local user message to the current session
 */
function addLocalUserMessage(content: string) {
  const sid = currentSessionId.value || `local-${Date.now()}`
  if (!currentSessionId.value) {
    setCurrentSessionId(sid)
  }
  sessionStore.appendRealtime(sid, {
    kind: 'text',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId: sid,
    timestamp: new Date().toISOString(),
    role: 'user',
    content,
  })
}

/**
 * Add a local assistant message to the current session
 */
function addLocalAssistantMessage(content: string) {
  const sid = currentSessionId.value || `local-${Date.now()}`
  if (!currentSessionId.value) {
    setCurrentSessionId(sid)
  }
  sessionStore.appendRealtime(sid, {
    kind: 'text',
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId: sid,
    timestamp: new Date().toISOString(),
    role: 'assistant',
    content,
  })
}

/**
 * Send a regular (non-command) message through the WebSocket/SDK
 */
function sendRegularMessage(text: string, images: string[]) {
  if (viewMode.value === 'history' && !isContinuingHistory.value) {
    isContinuingHistory.value = true
    sendChat(text, {
      sessionId: urlSessionId.value || undefined,
      workingDir: localWorkingDir.value || undefined,
      permissionMode: selectedPermissionMode.value,
      model: selectedModel.value,
      thinkingEnabled: thinkingEnabled.value,
      images,
    })
    return
  }

  sendChat(text, {
    sessionId: currentSessionId.value || undefined,
    workingDir: localWorkingDir.value || undefined,
    permissionMode: selectedPermissionMode.value,
    model: selectedModel.value,
    thinkingEnabled: thinkingEnabled.value,
    images,
  })
}

// Send message (works in both live and history mode)
async function handleSendMessage(images: string[] = []) {
  if ((!inputText.value.trim() && images.length === 0) || isStreaming.value) return

  const trimmed = inputText.value.trim()

  // Intercept slash commands — handle via HTTP API, not WebSocket
  if (trimmed.startsWith('/')) {
    const consumed = await executeSlashCommand(trimmed)
    if (consumed) {
      inputText.value = ''
      return
    }
    // If not consumed (not a known command), fall through to regular message
  }

  sendRegularMessage(inputText.value, images)
  inputText.value = ''
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
      duration: 2000
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
      duration: 2000
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
      :class="[
        'flex flex-col border-r relative overflow-hidden shrink-0',
        !isDraggingLeftSidebar ? 'transition-[width] duration-300' : '',
      ]"
      :style="{
        width: sidebarWidth,
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-base)',
        userSelect: isDraggingLeftSidebar ? 'none' : undefined,
      }"
    >
      <!-- Drag handle on right edge -->
      <div
        v-if="!sidebarCollapsed"
        class="absolute right-0 inset-y-0 w-1 cursor-col-resize z-10"
        :class="isDraggingLeftSidebar ? 'bg-accent/40' : 'hover:bg-accent/30'"
        @mousedown="onLeftSidebarDragStart"
      />
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
        @project-renamed="handleProjectRenamed"
        @project-deleted="handleProjectDeleted"
      />
    </div>

    <!-- Right Panel - Chat Interface -->
    <div class="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <!-- Header - Fixed height for consistent alignment -->
      <div
        class="shrink-0 border-b relative z-20"
        style="border-color: var(--border-subtle); background: var(--surface-base);"
      >
        <div class="flex items-center justify-between px-4 h-14">
          <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- History Mode - Session Info -->
          <template v-if="viewMode === 'history'">
            <div class="grid min-w-0 py-0.5 flex-1">
              <!-- Session Name -->
              <div class="text-[13px] font-medium leading-tight text-ellipsis overflow-hidden whitespace-nowrap" style="color: var(--text-primary);">
                {{ currentSessionSummary || 'Session' }}
              </div>
              <!-- Folder Name -->
              <div
                v-if="currentProjectDisplayName"
                class="text-[9px] md:text-[10px] font-mono leading-tight mt-0.5 text-ellipsis overflow-hidden whitespace-nowrap"
                style="color: var(--text-tertiary);"
              >
                {{ currentProjectDisplayName }}
              </div>
            </div>
          </template>

          <!-- Live Mode Indicators -->
          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <!-- Connection Status -->
              <div
                v-if="isConnected"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(13, 188, 121, 0.1); color: #0dbc79;"
              >
                <div class="size-1.5 rounded-full animate-pulse" style="background: #0dbc79;" />
                <span>Connected</span>
              </div>
              <div
                v-else
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: var(--surface-raised); color: var(--text-disabled);"
              >
                <div class="size-1.5 rounded-full" style="background: var(--text-disabled);" />
                <span>Disconnected</span>
              </div>

              <!-- Streaming indicator -->
              <div
                v-if="isStreaming"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(229, 169, 62, 0.1); color: var(--accent);"
              >
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
                <span>Generating...</span>
              </div>

              <!-- Project/Folder indicator in live mode -->
              <div
                v-if="localWorkingDir"
                class="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium min-w-0"
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
          />

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
      </div>

      <!-- Permission Banner -->
      <ChatV2PermissionBanner
        v-if="hasPendingPermissions"
        :permissions="permissions.getAllPending()"
        @respond="handlePermissionResponse"
      />

      <!-- Messages Area -->
      <div class="flex-1 relative min-h-0 min-w-0 overflow-x-hidden">
        <!-- Loading spinners live outside the opacity-controlled container so they're always visible -->
        <div v-if="isCreatingSession" class="absolute inset-0 flex items-center justify-center z-10" :style="{ background: 'var(--surface-base)' }">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--accent);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Creating new chat...</p>
          </div>
        </div>
        <div v-else-if="viewMode === 'history' && isLoadingHistoryWithDelay && !isLoadingMore" class="absolute inset-0 flex items-center justify-center z-10" :style="{ background: 'var(--surface-base)' }">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--text-secondary);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Loading history...</p>
          </div>
        </div>

        <div
          ref="messagesContainerRef"
          class="h-full overflow-y-auto overflow-x-hidden"
          :style="{
            background: 'var(--surface-base)',
            opacity: isInitialScroll ? 0 : 1
          }"
          @scroll="handleMessagesScroll"
        >
          <!-- Content column - grows with available space -->
          <div class="max-w-[1200px] mx-auto px-4 py-4 space-y-4 min-h-full min-w-0">
            <!-- Welcome / Select State -->
            <div v-if="viewMode === 'live' && !isLiveChat && !currentSessionId" class="flex items-center justify-center h-full text-center">
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
            <div v-else-if="!isLoadingHistoryWithDelay && !isCreatingSession && displayMessages.length === 0 && !isStreaming && !isLoadingClaudeCodeMessages" class="flex items-center justify-center h-full">
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

              <!-- Spacer to ensure last messages can scroll above the blurry toggle -->
              <div class="h-12 shrink-0" />
            </template>
          </div>
        </div>

        <!-- Floating-style Controls (Thinking + Context) -->
        <div 
          v-if="(isLiveChat || currentSessionId || (viewMode === 'history' && urlSessionId)) && !isLoadingHistoryWithDelay && !isCreatingSession"
          class="absolute bottom-0 left-0 right-0 flex justify-center items-center gap-4 py-4 z-10"
          style="background: linear-gradient(to top, var(--surface-base) 20%, transparent 100%); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);"
        >
          <!-- Thinking Toggle -->
          <button
            class="flex items-center justify-center p-2 rounded-full transition-all shadow-lg border backdrop-blur-md"
            :style="{
              background: thinkingEnabled ? 'color-mix(in srgb, #8b5cf6 15%, var(--surface-overlay))' : 'var(--surface-overlay)',
              color: thinkingEnabled ? '#8b5cf6' : 'var(--text-tertiary)',
              borderColor: thinkingEnabled ? 'rgba(139, 92, 246, 0.4)' : 'var(--border-subtle)',
              boxShadow: thinkingEnabled ? '0 4px 12px rgba(139, 92, 246, 0.2)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
            }"
            @click="thinkingEnabled = !thinkingEnabled"
            :title="thinkingEnabled ? 'Thinking Enabled' : 'Thinking Disabled'"
          >
            <UIcon 
              name="i-lucide-brain" 
              class="size-4" 
              :class="{ 'animate-pulse': thinkingEnabled }"
            />
          </button>

          <!-- Context Usage Circle -->
          <UTooltip :text="`Context: ${contextMonitor.contextUsageText.value} - Click for details`" :popper="{ placement: 'top' }">
            <div 
              class="flex items-center justify-center size-8 sm:size-9 rounded-full shadow-lg border backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95"
              style="background: var(--surface-overlay); border-color: var(--border-subtle);"
              @click="showContextDetails = !showContextDetails"
            >
              <div class="relative size-6">
                <!-- SVG Progress Circle -->
                <svg class="size-full -rotate-90" viewBox="0 0 36 36">
                  <!-- Background Circle -->
                  <circle
                    cx="18" cy="18" r="16"
                    fill="none"
                    class="stroke-current"
                    style="color: var(--border-subtle); stroke-width: 3;"
                  />
                  <!-- Progress Circle -->
                  <circle
                    cx="18" cy="18" r="16"
                    fill="none"
                    class="stroke-current transition-all duration-500"
                    stroke-linecap="round"
                    :stroke-dasharray="`${contextMonitor.metrics.value.contextWindow.percentage}, 100`"
                    :style="{
                      strokeWidth: 3,
                      color: contextMonitor.contextUsageColor.value === 'red' ? '#ef4444' : 
                             contextMonitor.contextUsageColor.value === 'orange' ? '#f97316' : 
                             contextMonitor.contextUsageColor.value === 'yellow' ? '#eab308' : '#22c55e'
                    }"
                  />
                </svg>
                <!-- Percentage Text -->
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-[8px] font-bold" style="color: var(--text-secondary);">
                    {{ Math.round(contextMonitor.metrics.value.contextWindow.percentage) }}%
                  </span>
                </div>
              </div>
            </div>
          </UTooltip>
        </div>
      </div>

      <!-- Input -->
      <div 
        v-if="(isLiveChat || currentSessionId || (viewMode === 'history' && urlSessionId)) && !isLoadingHistoryWithDelay && !isCreatingSession"
        class="shrink-0 border-t" 
        style="border-color: var(--border-subtle); background: var(--surface-base);"
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

  <!-- Floating Right Sidebar - Context Details -->
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] pointer-events-none">
      <!-- Backdrop -->
      <Transition name="fade">
        <div 
          v-if="showContextDetails" 
          class="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-auto" 
          @click="showContextDetails = false" 
        />
      </Transition>

      <!-- Sidebar Panel -->
      <Transition name="slide">
        <div
          v-if="showContextDetails"
          class="absolute inset-y-0 right-0 flex flex-col shadow-2xl pointer-events-auto border-l"
          :style="{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
            width: `${contextSidebarWidth}px`,
            userSelect: isDraggingContextSidebar ? 'none' : undefined,
          }"
        >
          <!-- Drag handle -->
          <div
            class="absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group"
            :class="isDraggingContextSidebar ? 'bg-accent/40' : 'hover:bg-accent/30'"
            @mousedown="onContextSidebarDragStart"
          />
          <!-- Sidebar Header -->
          <div class="shrink-0 px-4 h-14 border-b flex items-center justify-between" style="border-color: var(--border-subtle);">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-database" class="size-4 text-accent" />
              <h3 class="text-[13px] font-semibold" style="color: var(--text-primary);">Context Details</h3>
            </div>
            <button
              class="p-1.5 rounded-lg hover-bg transition-all"
              style="background: var(--surface-raised);"
              @click="showContextDetails = false"
            >
              <UIcon name="i-lucide-x" class="size-4" style="color: var(--text-tertiary);" />
            </button>
          </div>

          <!-- Details Content -->
          <div class="flex-1 overflow-y-auto">
            <ChatV2ContextDetails :metrics="contextMonitor.metrics.value" />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
:global(body.dragging-context-sidebar) {
  cursor: col-resize !important;
  user-select: none !important;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0.8;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
