<script setup lang="ts">
const route = useRoute()
const { claudeDir, exists: claudeDirExists, load: loadConfig } = useClaudeDir()
const { fetchAll: fetchAgents, agents } = useAgents()
const { fetchAll: fetchCommands, commands } = useCommands()
const { fetchAll: fetchPlugins, plugins } = usePlugins()
const { fetchAll: fetchSkills, skills } = useSkills()
const { fetchAll: fetchWorkflows, workflows } = useWorkflows()
const { fetchServers, servers: mcpServers } = useMCP()

const initialized = ref(false)
const showSearch = ref(false)
const sidebarCollapsed = ref(false)
const { isPanelOpen: chatOpen } = useChat()
const { workingDir, displayPath, setWorkingDir, clearWorkingDir } = useWorkingDir()
const colorMode = useColorMode()

const showWorkingDirPopover = ref(false)
const workingDirInput = ref('')
const dirSuggestions = ref<{ name: string; path: string; hasChildren: boolean }[]>([])
const selectedSuggestionIdx = ref(-1)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function openWorkingDirPopover() {
  workingDirInput.value = workingDir.value
  dirSuggestions.value = []
  selectedSuggestionIdx.value = -1
  showWorkingDirPopover.value = true
  if (workingDirInput.value) fetchDirSuggestions(workingDirInput.value)
}

function saveWorkingDir() {
  setWorkingDir(workingDirInput.value)
  showWorkingDirPopover.value = false
  dirSuggestions.value = []
}

async function fetchDirSuggestions(path: string) {
  if (!path) { dirSuggestions.value = []; return }
  try {
    const data = await $fetch<{ directories: typeof dirSuggestions.value }>('/api/directories', { query: { path } })
    dirSuggestions.value = data.directories
    selectedSuggestionIdx.value = -1
  } catch {
    dirSuggestions.value = []
  }
}

function onDirInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDirSuggestions(workingDirInput.value), 150)
}

function selectSuggestion(suggestion: { name: string; path: string; hasChildren: boolean }) {
  workingDirInput.value = suggestion.path
  selectedSuggestionIdx.value = -1
  if (suggestion.hasChildren) {
    fetchDirSuggestions(suggestion.path)
  } else {
    dirSuggestions.value = []
  }
}

function onDirKeydown(e: KeyboardEvent) {
  if (!dirSuggestions.value.length) {
    if (e.key === 'Enter') { e.preventDefault(); saveWorkingDir() }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSuggestionIdx.value = Math.min(selectedSuggestionIdx.value + 1, dirSuggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSuggestionIdx.value = Math.max(selectedSuggestionIdx.value - 1, -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedSuggestionIdx.value >= 0) {
      selectSuggestion(dirSuggestions.value[selectedSuggestionIdx.value]!)
    } else {
      saveWorkingDir()
    }
  } else if (e.key === 'Escape') {
    dirSuggestions.value = []
    selectedSuggestionIdx.value = -1
  }
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Cmd+J to toggle chat
if (import.meta.client) {
  const chatHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault()
      chatOpen.value = !chatOpen.value
    }
  }
  onMounted(() => document.addEventListener('keydown', chatHandler))
  onUnmounted(() => document.removeEventListener('keydown', chatHandler))
}

onMounted(async () => {
  await loadConfig()
  await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills(), fetchWorkflows(), fetchServers()])
  initialized.value = true
})

const navLinks = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Agents', icon: 'i-lucide-cpu', to: '/agents' },
  { label: 'Workflows', icon: 'i-lucide-git-branch', to: '/workflows' },
  { label: 'Commands', icon: 'i-lucide-terminal', to: '/commands' },
  { label: 'Skills', icon: 'i-lucide-sparkles', to: '/skills' },
  { label: 'Plugins', icon: 'i-lucide-puzzle', to: '/plugins' },
  { label: 'MCP Servers', icon: 'i-lucide-server', to: '/mcp' },
]

const navSecondary = [
  { label: 'Explore', icon: 'i-lucide-compass', to: '/explore' },
  { label: 'Graph', icon: 'i-lucide-workflow', to: '/graph' },
  { label: 'CLI', icon: 'i-lucide-terminal-square', to: '/cli' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}

function badgeFor(to: string) {
  if (to === '/agents') return agents.value.length || null
  if (to === '/commands') return commands.value.length || null
  if (to === '/skills') return skills.value.length || null
  if (to === '/plugins') return plugins.value.length || null
  if (to === '/workflows') return workflows.value.length || null
  if (to === '/mcp') return mcpServers.value.length || null
  return null
}
</script>

<template>
  <UApp>
    <div class="flex h-screen overflow-hidden" style="background: var(--surface-base);">
      <!-- Sidebar -->
      <aside
        class="sidebar shrink-0 flex flex-col relative h-full overflow-hidden transition-all duration-300"
        :style="{
          width: sidebarCollapsed ? '56px' : '200px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-subtle)',
        }"
      >
        <!-- Ambient glow at top — stronger -->
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-32 pointer-events-none"
          style="background: radial-gradient(ellipse, rgba(229, 169, 62, 0.1) 0%, transparent 70%);"
        />

        <!-- Brand -->
        <div class="h-[56px] flex items-center gap-2.5 relative" :class="sidebarCollapsed ? 'justify-center px-2' : 'px-4'">
          <template v-if="!sidebarCollapsed">
            <div
              class="size-7 rounded-lg flex items-center justify-center relative shrink-0"
              style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.18) 0%, rgba(229, 169, 62, 0.06) 100%); border: 1px solid rgba(229, 169, 62, 0.15);"
            >
              <UIcon name="i-lucide-bot" class="size-3.5" style="color: var(--accent);" />
            </div>
            <div class="flex-1 flex flex-col min-w-0">
              <span class="text-[12px] font-semibold tracking-tight" style="color: var(--text-primary); font-family: var(--font-display);">
                Agent Manager
              </span>
              <span class="text-[9px] font-mono tracking-wider uppercase" style="color: var(--text-disabled);">
                Claude Code
              </span>
            </div>
          </template>
          <!-- Collapse toggle -->
          <button
            class="hidden md:flex size-7 items-center justify-center rounded-lg transition-all duration-150 focus-ring press-scale shrink-0"
            style="color: var(--text-tertiary);"
            :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @mouseenter="($event.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <UIcon :name="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-4" />
          </button>
        </div>

        <!-- Primary Nav -->
        <nav class="flex-1 pt-1 space-y-0.5 overflow-y-auto" :class="sidebarCollapsed ? 'px-1.5' : 'px-2.5'">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <!-- Active indicator bar -->
            <div
              v-if="isActive(link.to)"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full"
              style="background: var(--accent); box-shadow: 0 0 10px var(--accent-glow);"
            />
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <template v-if="!sidebarCollapsed">
              <span class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
              <span
                v-if="badgeFor(link.to)"
                class="font-mono text-[10px] tabular-nums transition-colors duration-150"
                :style="{ color: isActive(link.to) ? 'var(--accent)' : 'var(--text-disabled)' }"
              >
                {{ badgeFor(link.to) }}
              </span>
            </template>
          </NuxtLink>

          <!-- Separator -->
          <div class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <NuxtLink
            v-for="link in navSecondary"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]'"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <div
              v-if="isActive(link.to)"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 rounded-r-full"
              style="background: var(--accent); box-shadow: 0 0 10px var(--accent-glow);"
            />
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <span v-if="!sidebarCollapsed" style="font-family: var(--font-sans);">{{ link.label }}</span>
          </NuxtLink>
        </nav>

        <!-- Search shortcut -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            style="color: var(--text-disabled); background: var(--input-bg); border: 1px solid var(--border-subtle);"
            :title="sidebarCollapsed ? 'Search (⌘K)' : undefined"
            @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-disabled)'"
            @click="showSearch = true"
          >
            <UIcon name="i-lucide-search" class="size-3.5" />
            <template v-if="!sidebarCollapsed">
              <span class="text-[12px] flex-1 text-left" style="font-family: var(--font-sans);">Search</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘K</kbd>
            </template>
          </button>
        </div>

        <!-- Chat with Claude -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            :style="{
              color: chatOpen ? 'var(--accent)' : 'var(--text-tertiary)',
              background: chatOpen ? 'var(--accent-muted)' : 'transparent',
            }"
            :title="sidebarCollapsed ? 'Claude (⌘J)' : undefined"
            @click="chatOpen = !chatOpen"
          >
            <div class="size-4 relative flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-zap" class="size-4" />
              <div
                v-if="chatOpen"
                class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
                style="background: var(--accent); box-shadow: 0 0 8px var(--accent-glow);"
              />
            </div>
            <template v-if="!sidebarCollapsed">
              <span class="text-[12px] flex-1 text-left" style="font-family: var(--font-sans);">Claude</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘J</kbd>
            </template>
          </button>
        </div>

        <!-- Theme toggle -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            style="color: var(--text-tertiary);"
            :title="sidebarCollapsed ? (colorMode.value === 'dark' ? 'Light mode' : 'Dark mode') : undefined"
            @click="toggleTheme"
          >
            <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" />
            <span v-if="!sidebarCollapsed" class="text-[12px]" style="font-family: var(--font-sans);">
              {{ colorMode.value === 'dark' ? 'Light mode' : 'Dark mode' }}
            </span>
          </button>
        </div>

        <!-- Footer: working directory -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'" style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
          <UPopover v-model:open="showWorkingDirPopover" :ui="{ width: 'w-[280px]' }">
            <button
              class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
              :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2 text-left'"
              style="color: var(--text-disabled); border: 1px solid var(--border-subtle);"
              :title="sidebarCollapsed ? (workingDir || 'Set project directory') : undefined"
              @click="openWorkingDirPopover"
            >
              <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" :style="{ color: workingDir ? 'var(--accent)' : undefined }" />
              <template v-if="!sidebarCollapsed">
                <div class="flex-1 min-w-0">
                  <div v-if="workingDir" class="font-mono text-[10px] truncate" style="color: var(--text-secondary);">
                    {{ displayPath }}
                  </div>
                  <div v-else class="text-[11px]" style="font-family: var(--font-sans);">
                    Set project directory
                  </div>
                </div>
                <UIcon name="i-lucide-pencil" class="size-3 shrink-0" style="color: var(--text-disabled);" />
              </template>
            </button>
            <template #content>
              <div class="p-3 space-y-3">
                <div class="text-[13px] font-semibold" style="color: var(--text-primary); font-family: var(--font-sans);">Working Directory</div>
                <p class="text-[11px] leading-relaxed" style="color: var(--text-secondary);">
                  Set the project directory for all chat conversations. Claude will operate in this directory.
                </p>
                <div class="relative">
                  <input
                    v-model="workingDirInput"
                    class="field-input text-[12px] font-mono"
                    placeholder="/path/to/your/project"
                    autocomplete="off"
                    @input="onDirInput"
                    @keydown="onDirKeydown"
                  />
                  <!-- Directory suggestions -->
                  <div
                    v-if="dirSuggestions.length"
                    class="mt-1 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto"
                    style="border: 1px solid var(--border-subtle); background: var(--surface-raised);"
                  >
                    <button
                      v-for="(suggestion, idx) in dirSuggestions"
                      :key="suggestion.path"
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors duration-75"
                      :style="{
                        background: idx === selectedSuggestionIdx ? 'var(--accent-muted)' : 'transparent',
                        color: idx === selectedSuggestionIdx ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }"
                      @click="selectSuggestion(suggestion)"
                      @mouseenter="selectedSuggestionIdx = idx"
                    >
                      <UIcon
                        :name="suggestion.hasChildren ? 'i-lucide-folder' : 'i-lucide-folder-dot'"
                        class="size-3.5 shrink-0"
                        :style="{ color: idx === selectedSuggestionIdx ? 'var(--accent)' : 'var(--text-disabled)' }"
                      />
                      <span class="text-[11px] font-mono truncate">{{ suggestion.name }}</span>
                      <UIcon
                        v-if="suggestion.hasChildren"
                        name="i-lucide-chevron-right"
                        class="size-3 shrink-0 ml-auto"
                        style="color: var(--text-disabled);"
                      />
                    </button>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <button
                    v-if="workingDir"
                    class="text-[11px] font-medium px-2 py-1 rounded hover-bg"
                    style="color: var(--error);"
                    @click="clearWorkingDir(); showWorkingDirPopover = false"
                  >
                    Clear
                  </button>
                  <div v-else />
                  <UButton label="Save" size="xs" @click="saveWorkingDir" />
                </div>
              </div>
            </template>
          </UPopover>
          <div v-if="!sidebarCollapsed" class="font-mono text-[9px] truncate tracking-wide mt-1.5 px-1" style="color: var(--text-disabled);">
            {{ claudeDir || 'No config directory' }}
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 min-w-0 h-full overflow-y-auto" style="background: var(--surface-base);">
        <!-- Setup wizard when directory doesn't exist -->
        <SetupWizard
          v-if="initialized && !claudeDirExists"
          @complete="async () => { await loadConfig(); await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills()]) }"
        />

        <NuxtPage v-else-if="initialized" />
        <div v-else class="flex items-center justify-center h-full">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-disabled);" />
        </div>
      </main>
    </div>
    <GlobalSearch />
    <ChatPanel v-model:open="chatOpen" />
    <FileEditorSidebar />
  </UApp>
</template>

<style scoped>
/* Nav item hover with smooth background reveal */
.nav-item {
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  background: var(--surface-hover);
}

/* Fade transition for mobile backdrop */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
