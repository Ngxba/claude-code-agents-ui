<script setup lang="ts">
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'
import { formatRelativeTime } from '~/utils/messageFormatting'

const emit = defineEmits<{
  (e: 'sessionSelected', payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }): void
  (e: 'projectSelected', payload: { projectName: string; projectDisplayName: string }): void
  (e: 'newChat', payload?: { workingDir?: string; projectDisplayName?: string }): void
  (e: 'selectionCleared'): void
  (e: 'toggleCollapse'): void
  (e: 'sessionRenamed', payload: { projectName: string; sessionId: string; newName: string }): void
  (e: 'sessionDeleted', payload: { projectName: string; sessionId: string }): void
  (e: 'projectRenamed', payload: { projectName: string; newName: string }): void
  (e: 'projectDeleted', payload: { projectName: string }): void
  (e: 'configPanelSelected', panel: string): void
  (e: 'settingsToggled', open: boolean): void
}>()

const props = defineProps<{
  collapsed: boolean
  currentSessionId?: string | null
  isLoadingMessages?: boolean
}>()

const {
  projects,
  sessions,
  selectedProject,
  selectedSession,
  isLoadingProjects,
  isLoadingSessions,
  sessionsHasMore,
  fetchProjects,
  selectProject,
  selectSession,
  loadMoreSessions,
  clearSelection,
  fetchSessions
} = useClaudeCodeHistory()

// Output style selector
const { styles: outputStyles, fetchStyles: fetchOutputStyles } = useOutputStyles()
const selectedOutputStyleId = useState('chat-active-output-style-id', () => 'default')
const selectedOutputStyleName = computed(() => {
  const style = outputStyles.value.find(s => s.id === selectedOutputStyleId.value)
  return style ? style.name : 'Default'
})

// View mode: 'projects' or 'sessions'
const viewMode = ref<'projects' | 'sessions'>('projects')
const sessionsSubView = ref<'sessions' | 'config'>('sessions')

const route = useRoute()

// Sync viewMode and sessionsSubView with route (important for page refresh)
watch(() => ({
  project: selectedProject.value,
  isSettings: route.path.endsWith('/settings')
}), ({ project, isSettings }) => {
  if (project) {
    viewMode.value = 'sessions'
    sessionsSubView.value = isSettings ? 'config' : 'sessions'
  } else {
    viewMode.value = 'projects'
    sessionsSubView.value = 'sessions'
  }
}, { immediate: true })

// Refresh state
const isRefreshing = ref(false)

async function handleManualRefresh() {
  isRefreshing.value = true
  try {
    if (viewMode.value === 'projects') {
      await fetchProjects()
    } else if (selectedProject.value) {
      await fetchSessions(selectedProject.value.name)
    }
  } finally {
    isRefreshing.value = false
  }
}

// Folder selection for new chat
const isChoosingFolder = ref(false)
const folderInput = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)

// Directory settings state
const dirSettings = ref<any>({})
const isLoadingDirSettings = ref(false)
async function fetchDirSettings() {
  if (!selectedProject.value) return
  isLoadingDirSettings.value = true
  try {
    dirSettings.value = await $fetch('/api/projects/settings', {
      query: { path: selectedProject.value.path }
    })
    // Sync local directory outputStyle with the global selector if set
    if (dirSettings.value.outputStyle) {
      const style = outputStyles.value.find(s => s.name.toLowerCase() === dirSettings.value.outputStyle.toLowerCase() || s.id === dirSettings.value.outputStyle.toLowerCase())
      if (style) {
        selectedOutputStyleId.value = style.id
      }
    }
  } catch (e) {
    console.error('Failed to fetch directory settings:', e)
  } finally {
    isLoadingDirSettings.value = false
  }
}

function toggleSessionsSubView() {
  sessionsSubView.value = sessionsSubView.value === 'sessions' ? 'config' : 'sessions'
  if (sessionsSubView.value === 'config') {
    fetchDirSettings()
    emit('settingsToggled', true)
  } else {
    emit('settingsToggled', false)
  }
}


// Watch for output style changes in config view to update dirSettings
watch(selectedOutputStyleId, (newId) => {
  if (sessionsSubView.value === 'config') {
    const style = outputStyles.value.find(s => s.id === newId)
    if (style) {
      dirSettings.value.outputStyle = style.name
    }
  }
})

onMounted(async () => {
  await fetchProjects()
  await fetchOutputStyles()
})

// Handle project click
async function handleProjectClick(project: typeof projects.value[0]) {
  await selectProject(project)
  viewMode.value = 'sessions'
  emit('projectSelected', {
    projectName: project.name,
    projectDisplayName: project.displayName
  })
}

// Handle session click
function handleSessionClick(session: typeof sessions.value[0]) {
  // Prevent clicking while loading
  if (props.isLoadingMessages) return
  // Don't re-select the same session
  if (selectedSession.value?.id === session.id) return

  // Just update selection locally - don't call composable's selectSession which fetches messages
  selectedSession.value = session

  if (selectedProject.value) {
    emit('sessionSelected', {
      projectName: selectedProject.value.name,
      sessionId: session.id,
      sessionSummary: session.summary || 'Session',
      projectDisplayName: selectedProject.value.displayName
    })
  }
}

// Go back to projects list
function goBackToProjects() {
  viewMode.value = 'projects'
  sessionsSubView.value = 'sessions'
  clearSelection()
  emit('selectionCleared')
}

// Handle New Chat click
function handleNewChat() {
  if (viewMode.value === 'sessions' && selectedProject.value) {
    emit('newChat', { 
      workingDir: selectedProject.value.path,
      projectDisplayName: selectedProject.value.displayName
    })
  } else {
    // Expand sidebar if collapsed so the user can see the folder input
    if (props.collapsed) {
      emit('toggleCollapse')
    }
    isChoosingFolder.value = true
    nextTick(() => {
      folderInputRef.value?.focus()
    })
  }
}

// Confirm folder selection
function confirmFolder() {
  if (folderInput.value.trim()) {
    emit('newChat', { workingDir: folderInput.value.trim() })
    isChoosingFolder.value = false
    folderInput.value = ''
  } else {
    // Start generic chat if empty
    emit('newChat')
    isChoosingFolder.value = false
  }
}

// Cancel folder selection
function cancelFolderSelection() {
  isChoosingFolder.value = false
  folderInput.value = ''
}

// Format relative time
function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return ''

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

// Truncate text
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Inline rename state
const editingSessionId = ref<string | null>(null)
const editingInput = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

// Delete confirmation state
const showDeleteModal = ref(false)
const deleteType = ref<'session' | 'project'>('session')
const deleteSessionId = ref<string | null>(null)
const deleteProjectName = ref<string | null>(null)
const deleteItemName = ref('')

// Project editing state
const editingProjectName = ref<string | null>(null)
const projectEditInput = ref('')
const projectEditInputRef = ref<HTMLInputElement | null>(null)

// Start inline editing for project
function startEditingProject(project: typeof projects.value[0], event: Event) {
  event.stopPropagation()
  editingProjectName.value = project.name
  projectEditInput.value = project.displayName
  nextTick(() => {
    const el = projectEditInputRef.value as any
    if (el) {
      if (typeof el.focus === 'function') {
        el.focus()
        if (typeof el.select === 'function') el.select()
      } else if (el.$el && typeof el.$el.focus === 'function') {
        el.$el.focus()
      }
    }
  })
}

// Save project edit
function saveProjectEdit() {
  if (editingProjectName.value && projectEditInput.value.trim()) {
    emit('projectRenamed', {
      projectName: editingProjectName.value,
      newName: projectEditInput.value.trim()
    })
  }
  cancelProjectEdit()
}

// Cancel project edit
function cancelProjectEdit() {
  editingProjectName.value = null
  projectEditInput.value = ''
}

// Open delete modal for project
function openProjectDeleteModal(project: typeof projects.value[0], event: Event) {
  event.stopPropagation()
  deleteType.value = 'project'
  deleteProjectName.value = project.name
  deleteItemName.value = project.displayName
  showDeleteModal.value = true
}

// Start inline editing
function startEditing(session: typeof sessions.value[0], event: Event) {
  event.stopPropagation()
  editingSessionId.value = session.id
  editingInput.value = session.summary || ''
  // Focus the input after Vue updates the DOM
  nextTick(() => {
    // If editInputRef is bound to a component, we need to access its el
    const el = editInputRef.value as any
    if (el) {
      if (typeof el.focus === 'function') {
        el.focus()
        if (typeof el.select === 'function') el.select()
      } else if (el.$el && typeof el.$el.focus === 'function') {
        el.$el.focus()
      }
    }
  })
}

// Save inline edit
function saveEdit() {
  if (editingSessionId.value && selectedProject.value && editingInput.value.trim()) {
    emit('sessionRenamed', {
      projectName: selectedProject.value.name,
      sessionId: editingSessionId.value,
      newName: editingInput.value.trim()
    })
  }
  cancelEdit()
}

// Cancel inline edit
function cancelEdit() {
  editingSessionId.value = null
  editingInput.value = ''
}

// Open delete confirmation
function openDeleteModal(session: typeof sessions.value[0], event: Event) {
  event.stopPropagation()
  deleteType.value = 'session'
  deleteSessionId.value = session.id
  deleteItemName.value = session.summary || 'this session'
  showDeleteModal.value = true
}

// Confirm delete
function confirmDelete() {
  if (deleteType.value === 'session') {
    if (deleteSessionId.value && selectedProject.value) {
      emit('sessionDeleted', {
        projectName: selectedProject.value.name,
        sessionId: deleteSessionId.value
      })
    }
  } else {
    if (deleteProjectName.value) {
      emit('projectDeleted', {
        projectName: deleteProjectName.value
      })
    }
  }
  showDeleteModal.value = false
  deleteSessionId.value = null
  deleteProjectName.value = null
  deleteItemName.value = ''
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Sidebar Header - Fixed height to align with chat header -->
    <div class="shrink-0 px-3 min-h-[3.5rem] border-b flex flex-wrap items-center gap-2 py-2" style="border-color: var(--border-subtle);">
      <template v-if="!collapsed">
        <!-- Back button when viewing sessions -->
        <button
          v-if="viewMode === 'sessions'"
          class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
          style="background: var(--surface-raised);"
          @click="goBackToProjects"
          title="Back to projects"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" style="color: var(--text-secondary);" />
        </button>

        <div class="flex-1 min-w-0 flex flex-col justify-center">
          <h3
            class="text-[13px] font-semibold break-words leading-tight transition-colors"
            :class="viewMode === 'sessions' ? 'cursor-pointer hover:text-accent' : ''"
            style="color: var(--text-primary);"
            @click="viewMode === 'sessions' ? goBackToProjects() : null"
          >
            {{ viewMode === 'projects' ? 'Claude Code History' : selectedProject?.displayName || 'Sessions' }}
          </h3>
          <p v-if="viewMode === 'sessions' && selectedProject" class="text-[10px] truncate leading-tight mt-0.5" style="color: var(--text-tertiary);">
            {{ selectedProject.path }}
          </p>
        </div>

        <!-- Settings Toggle (only in sessions view, hidden for .claude default dir) -->
        <button
          v-if="viewMode === 'sessions' && selectedProject && !selectedProject.path?.endsWith('/.claude')"
          class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
          style="background: var(--surface-raised);"
          :title="sessionsSubView === 'sessions' ? 'Directory Settings' : 'Back to Sessions'"
          @click="toggleSessionsSubView"
        >
          <UIcon :name="sessionsSubView === 'sessions' ? 'i-lucide-settings' : 'i-lucide-message-square'" class="size-4" style="color: var(--text-secondary);" />
        </button>
      </template>

      <!-- Toggle button (always visible) -->
      <button
        class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
        :class="{ 'ml-auto': !collapsed }"
        style="background: var(--surface-raised);"
        @click="emit('toggleCollapse')"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <UIcon
          :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          class="size-4"
          style="color: var(--text-secondary);"
        />
      </button>
    </div>

    <!-- Sidebar Content -->
    <template v-if="!collapsed">
      <!-- New Chat Button & Folder Input (hidden in config mode) -->
      <div v-if="sessionsSubView !== 'config'" class="shrink-0 p-2 border-b" style="border-color: var(--border-subtle);">
        <div v-if="!isChoosingFolder" class="flex items-center gap-1.5">
          <button
            class="flex-1 px-3 py-2 rounded-lg text-[12px] font-medium hover-bg transition-all flex items-center justify-center gap-2"
            style="background: var(--accent); color: white;"
            @click="handleNewChat"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            New Chat
          </button>
          <button
            class="p-2 rounded-lg transition-all hover-bg flex items-center justify-center"
            style="background: var(--surface-raised); color: var(--text-secondary);"
            :title="viewMode === 'projects' ? 'Refresh projects' : 'Refresh sessions'"
            :disabled="isRefreshing"
            @click="handleManualRefresh"
          >
            <UIcon 
              name="i-lucide-refresh-cw" 
              class="size-4" 
              :class="{ 'animate-spin': isRefreshing }"
            />
          </button>
        </div>

        <!-- Folder input for starting new chat in specific dir -->
        <div v-else class="space-y-2">
          <div class="flex items-center gap-2">
            <input
              ref="folderInputRef"
              v-model="folderInput"
              class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
              style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
              placeholder="Enter folder path..."
              @keyup.enter="confirmFolder"
              @keyup.escape="cancelFolderSelection"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              class="flex-1 py-1 rounded text-[11px] font-medium transition-all"
              style="background: var(--accent); color: white;"
              @click="confirmFolder"
            >
              Start
            </button>
            <button
              class="flex-1 py-1 rounded text-[11px] font-medium transition-all"
              style="background: var(--surface-raised); color: var(--text-secondary);"
              @click="cancelFolderSelection"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Projects List -->
      <div v-if="viewMode === 'projects'" class="flex-1 overflow-y-auto p-2 space-y-1">
        <!-- Loading state -->
        <div v-if="isLoadingProjects" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
        </div>

        <!-- Projects -->
        <div
          v-for="(project, index) in projects"
          :key="project.name"
          class="stagger-item px-3 py-2.5 rounded-lg cursor-pointer transition-all hover-bg group min-w-0"
          style="background: var(--surface-raised);"
          :style="{ animationDelay: `${index * 40}ms` }"
          @click="handleProjectClick(project)"
        >
          <div class="flex items-center gap-2 mb-0.5 min-w-0">
            <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" style="color: var(--accent);" />
            
            <!-- Inline project edit mode -->
            <template v-if="editingProjectName === project.name">
              <div class="flex items-center gap-1 flex-1 min-w-0" @click.stop>
                <input
                  ref="projectEditInputRef"
                  v-model="projectEditInput"
                  class="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[12px] font-medium outline-none"
                  style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
                  @keyup.enter="saveProjectEdit"
                  @keyup.escape="cancelProjectEdit"
                />
                <button
                  class="p-1 rounded hover:bg-green-500/20 transition-colors shrink-0"
                  title="Save"
                  @click.stop="saveProjectEdit"
                >
                  <UIcon name="i-lucide-check" class="size-3.5" style="color: #22c55e;" />
                </button>
                <button
                  class="p-1 rounded hover:bg-red-500/10 transition-colors shrink-0"
                  title="Cancel"
                  @click.stop="cancelProjectEdit"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" style="color: var(--text-tertiary);" />
                </button>
              </div>
            </template>

            <!-- Normal project title -->
            <template v-else>
              <span class="text-[12px] font-medium break-words flex-1 min-w-0" style="color: var(--text-primary);">
                {{ project.displayName }}
              </span>
              
              <!-- Project Action icons -->
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  title="Rename folder"
                  @click.stop="startEditingProject(project, $event)"
                >
                  <UIcon name="i-lucide-pencil" class="size-3" style="color: var(--text-tertiary);" />
                </button>
                <button
                  class="p-1 rounded hover:bg-red-500/10 transition-colors"
                  title="Delete folder history"
                  @click.stop="openProjectDeleteModal(project, $event)"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3" style="color: var(--error, #ef4444);" />
                </button>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-3.5 shrink-0"
                  style="color: var(--text-tertiary);"
                />
              </div>
            </template>
          </div>
          <!-- Directory path -->
          <div
            v-if="project.path"
            class="text-[10px] font-mono truncate mb-1 pl-5.5"
            style="color: var(--text-tertiary);"
            :title="project.path"
          >
            {{ project.path }}
          </div>
          <div class="flex items-center gap-2 text-[10px] pl-5.5" style="color: var(--text-tertiary);">
            <span>{{ project.sessionCount }} sessions</span>
            <span v-if="project.lastActivity">{{ formatRelativeTime(project.lastActivity) }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="projects.length === 0 && !isLoadingProjects" class="text-center py-8">
          <UIcon name="i-lucide-folder-x" class="size-10 mx-auto mb-3" style="color: var(--text-disabled);" />
          <p class="text-[12px]" style="color: var(--text-secondary);">No Claude Code projects found</p>
          <p class="text-[10px] mt-1" style="color: var(--text-tertiary);">
            Projects appear after using Claude Code CLI
          </p>
        </div>
      </div>

      <!-- Sessions List / Config View -->
      <div
        v-else-if="viewMode === 'sessions'"
        class="flex-1 overflow-y-auto min-h-0"
      >
        <!-- Sessions View -->
        <div v-if="sessionsSubView === 'sessions'" class="p-2 space-y-1" :class="{ 'pointer-events-none opacity-60': isLoadingMessages }">
          <!-- Loading state for sessions -->
          <div v-if="isLoadingSessions && sessions.length === 0" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
          </div>

          <!-- Sessions -->
          <div
            v-for="(session, index) in sessions"
            :key="session.id"
            class="stagger-item px-3 py-2.5 rounded-lg transition-all group/session min-w-0"
            :class="isLoadingMessages ? 'cursor-not-allowed' : 'cursor-pointer hover-bg'"
            :style="{
              background: selectedSession?.id === session.id || currentSessionId === session.id
                ? 'var(--accent-light)'
                : 'var(--surface-raised)',
              borderLeft: selectedSession?.id === session.id || currentSessionId === session.id
                ? '3px solid var(--accent)'
                : '3px solid transparent',
              animationDelay: `${index * 40}ms`
            }"
            @click="handleSessionClick(session)"
          >
              <div class="flex items-start gap-1 min-w-0">
                <div class="flex-1 min-w-0">
                  <!-- Inline edit mode -->
                  <template v-if="editingSessionId === session.id">
                    <div class="flex items-center gap-1 mb-1">
                      <input
                        ref="editInputRef"
                        v-model="editingInput"
                        class="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[12px] font-medium outline-none"
                        style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
                        @keyup.enter="saveEdit"
                        @keyup.escape="cancelEdit"
                        @click.stop
                      />
                      <button
                        class="p-1 rounded hover:bg-green-500/20 transition-colors shrink-0"
                        title="Save"
                        @click.stop="saveEdit"
                      >
                        <UIcon name="i-lucide-check" class="size-3.5" style="color: #22c55e;" />
                      </button>
                      <button
                        class="p-1 rounded hover:bg-red-500/10 transition-colors shrink-0"
                        title="Cancel"
                        @click.stop="cancelEdit"
                      >
                        <UIcon name="i-lucide-x" class="size-3.5" style="color: var(--text-tertiary);" />
                      </button>
                    </div>
                  </template>
                  <!-- Normal title display -->
                  <div
                    v-else
                    class="text-[12px] font-medium truncate mb-1 flex items-center gap-2"
                    style="color: var(--text-primary);"
                  >
                    <div 
                      v-if="session.isActive" 
                      class="size-1.5 rounded-full shrink-0 animate-pulse" 
                      style="background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);"
                      title="Session is active"
                    />
                    <span class="truncate">{{ session.summary || 'Session' }}</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 text-[10px]" style="color: var(--text-tertiary);">
                    <span>{{ session.messageCount }} messages</span>
                    <span>{{ formatRelativeTime(session.lastActivity) }}</span>
                  </div>
                </div>
                <!-- Action icons (visible on hover, hidden when editing) -->
                <div
                  v-if="editingSessionId !== session.id"
                  class="flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity shrink-0"
                >
                  <button
                    class="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    title="Rename"
                    @click="startEditing(session, $event)"
                  >
                    <UIcon name="i-lucide-pencil" class="size-3" style="color: var(--text-tertiary);" />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-red-500/10 transition-colors"
                    title="Delete"
                    @click="openDeleteModal(session, $event)"
                  >
                    <UIcon name="i-lucide-trash-2" class="size-3" style="color: var(--error, #ef4444);" />
                  </button>
                </div>
              </div>
              <div v-if="session.isGrouped" class="mt-1">
                <span class="text-[9px] px-1.5 py-0.5 rounded" style="background: var(--accent-light); color: var(--accent);">
                  {{ session.groupSize }} related sessions
                </span>
              </div>
            </div>

          <!-- Load more button -->
          <button
            v-if="sessionsHasMore && !isLoadingSessions"
            class="w-full px-3 py-2 rounded-lg text-[11px] font-medium hover-bg transition-all mt-2"
            style="background: var(--surface-raised); color: var(--text-secondary);"
            @click="loadMoreSessions"
          >
            Load more sessions
          </button>

          <!-- Empty state -->
          <div v-if="sessions.length === 0" class="text-center py-8">
            <p class="text-[12px]" style="color: var(--text-secondary);">No sessions in this project</p>
          </div>
        </div>

        <!-- Config View - Navigation buttons -->
        <div v-else class="p-3 space-y-1">
          <div class="stagger-item flex items-center gap-2 px-2 mb-3" :style="{ animationDelay: '0ms' }">
            <UIcon name="i-lucide-settings-2" class="size-4" style="color: var(--accent);" />
            <h4 class="text-[12px] font-bold uppercase tracking-wider" style="color: var(--text-primary);">Project Settings</h4>
          </div>

          <button
            class="stagger-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover-bg group"
            :style="{ animationDelay: '40ms' }"
            @click="emit('configPanelSelected', 'claude-md')"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--surface-raised);">
              <UIcon name="i-lucide-file-text" class="size-4" style="color: var(--accent);" />
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-medium" style="color: var(--text-primary);">CLAUDE.md</div>
              <div class="text-[10px]" style="color: var(--text-tertiary);">Project instructions for Claude</div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style="color: var(--text-tertiary);" />
          </button>

          <button
            class="stagger-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover-bg group"
            :style="{ animationDelay: '80ms' }"
            @click="emit('configPanelSelected', 'output-style')"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--surface-raised);">
              <UIcon name="i-lucide-palette" class="size-4" style="color: var(--accent);" />
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-medium" style="color: var(--text-primary);">Output Style</div>
              <div class="text-[10px]" style="color: var(--text-tertiary);">{{ selectedOutputStyleName }}</div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style="color: var(--text-tertiary);" />
          </button>

        </div>
      </div>
    </template>

    <!-- Collapsed state -->
    <template v-else>
      <div class="flex-1 flex flex-col items-center gap-2 pt-3">
        <button
          class="p-2 rounded-lg transition-all"
          style="background: var(--accent);"
          title="New Chat"
          @click="handleNewChat"
        >
          <UIcon name="i-lucide-plus" class="size-4" style="color: white;" />
        </button>
        <button
          class="p-2 rounded-lg transition-all hover-bg"
          style="background: var(--surface-raised);"
          title="Claude Code History"
        >
          <UIcon name="i-lucide-history" class="size-4" style="color: var(--text-secondary);" />
        </button>
      </div>
    </template>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteModal"
          class="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100]"
          @click.self="showDeleteModal = false"
        >
          <div class="w-[400px] p-6 rounded-2xl shadow-2xl border border-[var(--border-subtle)] modal-content" style="background: var(--surface-overlay); opacity: 1; position: relative; z-index: 101;">
            <div class="flex items-center gap-3 mb-4">
              <div class="p-2 rounded-full bg-red-500/10">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-red-500" />
              </div>
              <h3 class="text-[16px] font-bold" style="color: var(--text-primary);">
                Delete {{ deleteType === 'session' ? 'Session' : 'Project' }}
              </h3>
            </div>
            
            <p class="text-[13px] leading-relaxed mb-6" style="color: var(--text-secondary);">
              Are you sure you want to delete <span class="font-medium text-[var(--text-primary)]">"{{ truncate(deleteItemName, 60) }}"</span>? 
              <template v-if="deleteType === 'project'">
                This will permanently delete all chat history for this folder from the UI.
              </template>
              <template v-else>
                This action cannot be undone and all messages will be permanently lost.
              </template>
            </p>
            
            <div class="flex items-center justify-end gap-3">
              <button
                class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:bg-[var(--surface-hover)]"
                style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
                @click="showDeleteModal = false"
              >
                Cancel
              </button>
              <button
                class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 active:scale-95"
                style="background: var(--error); color: white; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);"
                @click="confirmDelete"
              >
                Delete {{ deleteType === 'session' ? 'Session' : 'History' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Modal Animation */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content {
  animation: modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active .modal-content {
  animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) reverse;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Ensure animation replays when list items are added */
.stagger-item {
  opacity: 0;
  animation: fadeInUp 0.35s ease forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
