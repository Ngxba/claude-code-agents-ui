<script setup lang="ts">
import type { Settings } from '~/types'

const { settings, loading, load, save } = useSettings()

// Custom Providers
const {
  load: loadProviders,
  saveProvider,
  removeProvider,
  customProviders,
  loading: providerLoading,
} = useProviderConfig()

onMounted(() => {
  loadProviders()
})

interface ProviderFormState {
  displayName: string
  baseUrl: string
  authToken: string
  authTokenUnchanged: boolean
  modelMappings: { opus: string; sonnet: string; haiku: string }
  error: string
  showToken: boolean
}

const providerForms = reactive<Record<string, ProviderFormState>>({})
const openAccordions = ref<Set<string>>(new Set())
const confirmDelete = ref<string | null>(null)

function makeEmptyForm(): ProviderFormState {
  return { displayName: '', baseUrl: '', authToken: '', authTokenUnchanged: false, modelMappings: { opus: '', sonnet: '', haiku: '' }, error: '', showToken: false }
}

watch(customProviders, (providers) => {
  for (const p of providers) {
    if (!providerForms[p.name]) {
      providerForms[p.name] = {
        displayName: p.displayName,
        baseUrl: p.baseUrl ?? '',
        authToken: '',
        authTokenUnchanged: true,
        modelMappings: { opus: p.modelMappings?.opus ?? '', sonnet: p.modelMappings?.sonnet ?? '', haiku: p.modelMappings?.haiku ?? '' },
        error: '',
        showToken: false,
      }
    }
  }
  for (const key of Object.keys(providerForms)) {
    if (key !== '__new__' && !providers.find(p => p.name === key)) {
      delete providerForms[key]
      openAccordions.value = new Set([...openAccordions.value].filter(s => s !== key))
    }
  }
}, { immediate: true })

function addNewProvider() {
  if (!providerForms.__new__) {
    providerForms.__new__ = makeEmptyForm()
  }
  openAccordions.value = new Set([...openAccordions.value, '__new__'])
}

function toggleAccordion(slug: string) {
  const s = new Set(openAccordions.value)
  if (s.has(slug)) { s.delete(slug) } else { s.add(slug) }
  openAccordions.value = s
}

function closeAccordion(slug: string) {
  openAccordions.value = new Set([...openAccordions.value].filter(s => s !== slug))
}

function cancelNewProvider() {
  delete providerForms.__new__
  closeAccordion('__new__')
}

async function handleSaveProvider(slug: string) {
  const form = providerForms[slug]
  if (!form) return
  form.error = ''

  const isNew = slug === '__new__'
  const effectiveSlug = isNew ? form.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : slug

  if (isNew) {
    if (!effectiveSlug || !/^[a-z0-9-]+$/.test(effectiveSlug)) {
      form.error = 'Provider Name is required and must contain lowercase letters, numbers, and hyphens only'
      return
    }
    if (customProviders.value.find(p => p.name === effectiveSlug)) {
      form.error = `Slug "${effectiveSlug}" already exists`
      return
    }
  }
  if (!form.baseUrl) { form.error = 'Base URL is required'; return }
  if (!form.authToken && !form.authTokenUnchanged) { form.error = 'Auth Token is required'; return }
  try { new URL(form.baseUrl) } catch { form.error = 'Base URL must be a valid URL'; return }

  await saveProvider({
    name: effectiveSlug,
    displayName: form.displayName || effectiveSlug,
    baseUrl: form.baseUrl,
    authToken: form.authTokenUnchanged ? '__unchanged__' : form.authToken,
    modelMappings: {
      ...(form.modelMappings.opus ? { opus: form.modelMappings.opus } : {}),
      ...(form.modelMappings.sonnet ? { sonnet: form.modelMappings.sonnet } : {}),
      ...(form.modelMappings.haiku ? { haiku: form.modelMappings.haiku } : {}),
    },
  })

  if (isNew) {
    cancelNewProvider()
  } else {
    closeAccordion(slug)
  }
}

async function handleRemoveProvider(slug: string) {
  if (confirmDelete.value !== slug) {
    confirmDelete.value = slug
    return
  }
  confirmDelete.value = null
  await removeProvider(slug)
}
const {
  skillImports,
  agentImports,
  loading: importsLoading,
  fetchImports: fetchGithubImports,
  checkUpdates,
  updateImport,
  removeImport,
} = useGithubImports()

const githubImports = computed(() => {
  return [
    ...(skillImports?.value || []).map(i => ({ ...i, type: 'skills' as const })),
    ...(agentImports?.value || []).map(i => ({ ...i, type: 'agents' as const }))
  ]
})

const toast = useToast()

const rawJson = ref('')
const saving = ref(false)
const viewMode = ref<'structured' | 'raw'>('structured')
const showRemoveConfirm = ref(false)
const repoToRemove = ref<{ owner: string; repo: string; type: 'skills' | 'agents'; count: number } | null>(null)

onMounted(async () => {
  await load()
  syncRawJson()
})

onMounted(async () => {
  await Promise.all([
    fetchGithubImports('skills'),
    fetchGithubImports('agents')
  ])
})

async function onUpdateImport(owner: string, repo: string, type: 'skills' | 'agents') {
  try {
    await updateImport(owner, repo, type)
    toast.add({ title: 'Import updated', color: 'success' })
  } catch {
    toast.add({ title: 'Update failed', color: 'error' })
  }
}

async function onRemoveImport(owner: string, repo: string, type: 'skills' | 'agents') {
  const list = type === 'skills' ? skillImports : agentImports
  const entry = list.value.find(i => i.owner === owner && i.repo === repo)
  
  repoToRemove.value = {
    owner,
    repo,
    type,
    count: entry?.selectedItems?.length || 0
  }
  showRemoveConfirm.value = true
}

async function confirmRemove() {
  if (!repoToRemove.value) return
  const { owner, repo, type } = repoToRemove.value
  
  try {
    await removeImport(owner, repo, type)
    toast.add({ title: 'Import removed', color: 'success' })
  } catch {
    toast.add({ title: 'Remove failed', color: 'error' })
  } finally {
    showRemoveConfirm.value = false
    repoToRemove.value = null
  }
}

async function onCheckUpdates() {
  try {
    await Promise.all([
      checkUpdates('skills'),
      checkUpdates('agents')
    ])
    toast.add({ title: 'Update check complete', color: 'success' })
  } catch {
    toast.add({ title: 'Update check failed', color: 'error' })
  }
}

watch(settings, () => syncRawJson())

function syncRawJson() {
  if (settings.value) rawJson.value = JSON.stringify(settings.value, null, 2)
}

// ---- Structured field helpers ----

async function updateSetting(patch: Partial<Settings>) {
  if (!settings.value) return
  saving.value = true
  try {
    await save({ ...settings.value, ...patch })
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save', description: e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleAlwaysThinking(enabled: boolean) {
  await updateSetting({ alwaysThinkingEnabled: enabled })
}

async function togglePlugin(name: string, enabled: boolean) {
  if (!settings.value) return
  await updateSetting({
    enabledPlugins: {
      ...settings.value.enabledPlugins,
      [name]: enabled,
    },
  })
}

async function removePlugin(name: string) {
  if (!settings.value?.enabledPlugins) return
  const { [name]: _, ...rest } = settings.value.enabledPlugins as Record<string, boolean>
  await updateSetting({ enabledPlugins: rest })
}

// ---- Status line ----

const statusLineType = ref('')
const statusLineCommand = ref('')

const statusLineOptions = [
  { value: '', label: 'None', description: 'Disable the status line' },
  { value: 'command', label: 'Command', description: 'Run a bash command to get status' },
]

watch(settings, (val) => {
  if (val?.statusLine) {
    statusLineType.value = val.statusLine.type || ''
    statusLineCommand.value = val.statusLine.command || ''
  }
}, { immediate: true })

async function saveStatusLine() {
  if (!statusLineType.value && !statusLineCommand.value) {
    const { statusLine: _, ...rest } = settings.value || {}
    await updateSetting(rest as Settings)
  } else {
    await updateSetting({
      statusLine: {
        type: statusLineType.value,
        command: statusLineCommand.value,
      },
    })
  }
}

// ---- Hooks ----

const hooks = computed(() => {
  if (!settings.value?.hooks) return []
  return Object.entries(settings.value.hooks as Record<string, unknown[]>).map(([event, list]) => ({
    event,
    commands: Array.isArray(list) ? list : [],
  }))
})

const showAddHookModal = ref(false)
const newHookEvent = ref<string | undefined>('')
const newHookCommand = ref('')
const newHookMatcher = ref('')

const hookEventOptions = [
  { value: 'PreToolUse', label: 'Before Claude uses a tool', description: 'Triggered just before a tool is executed' },
  { value: 'PostToolUse', label: 'After Claude uses a tool', description: 'Triggered after a tool execution completes' },
  { value: 'Notification', label: 'When a notification is sent', description: 'Triggered when the system sends a notification' },
  { value: 'Stop', label: 'When Claude finishes', description: 'Triggered when the session finishes' },
  { value: 'SubagentStop', label: 'When a sub-agent finishes', description: 'Triggered when a background sub-agent finishes' },
]

const hookEventLabels: Record<string, string> = {
  PreToolUse: 'Before Claude uses a tool',
  PostToolUse: 'After Claude uses a tool',
  Notification: 'When a notification is sent',
  Stop: 'When Claude finishes',
  SubagentStop: 'When a sub-agent finishes',
}

async function addHook() {
  if (!newHookEvent.value || !newHookCommand.value) return
  const currentHooks = (settings.value?.hooks || {}) as Record<string, unknown[]>
  const eventHooks = [...(currentHooks[newHookEvent.value] || [])]

  const hookEntry: Record<string, string> = { command: newHookCommand.value }
  if (newHookMatcher.value) hookEntry.matcher = newHookMatcher.value

  eventHooks.push(hookEntry)

  await updateSetting({
    hooks: { ...currentHooks, [newHookEvent.value]: eventHooks },
  })

  newHookEvent.value = ''
  newHookCommand.value = ''
  newHookMatcher.value = ''
  showAddHookModal.value = false
}

async function removeHook(event: string, index: number) {
  const currentHooks = (settings.value?.hooks || {}) as Record<string, unknown[]>
  const eventHooks = [...(currentHooks[event] || [])]
  eventHooks.splice(index, 1)

  const updatedHooks = { ...currentHooks }
  if (eventHooks.length === 0) {
    delete updatedHooks[event]
  } else {
    updatedHooks[event] = eventHooks
  }

  await updateSetting({ hooks: Object.keys(updatedHooks).length > 0 ? updatedHooks : undefined })
}

// ---- Raw JSON ----

async function saveRaw() {
  saving.value = true
  try {
    const parsed = JSON.parse(rawJson.value)
    await save(parsed)
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Invalid JSON', description: e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Cmd+S
if (import.meta.client) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (viewMode.value === 'raw') saveRaw()
    }
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

const plugins = computed(() => {
  if (!settings.value?.enabledPlugins) return []
  return Object.entries(settings.value.enabledPlugins).map(([name, enabled]) => ({
    name,
    enabled: Boolean(enabled),
  }))
})

const charCount = computed(() => rawJson.value.length)
const lineCount = computed(() => rawJson.value.split('\n').length)
</script>

<template>
  <div>
    <PageHeader title="Settings">
      <template #right>
        <button
          class="text-[12px] px-2 py-1 rounded focus-ring text-label"
          style="background: var(--surface-raised); border: 1px solid var(--border-default);"
          @click="viewMode = viewMode === 'structured' ? 'raw' : 'structured'"
        >
          {{ viewMode === 'structured' ? 'Raw JSON' : 'Structured' }}
        </button>
        <UButton v-if="viewMode === 'raw'" label="Save" icon="i-lucide-save" size="sm" :loading="saving" @click="saveRaw" />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-meta" />
    </div>

    <!-- Structured view -->
    <div v-else-if="viewMode === 'structured'" class="px-6 py-4 space-y-6">

      <!-- General -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-title">General</h3>

        <div class="space-y-4">
          <!-- Always Thinking toggle -->
          <div class="flex items-center justify-between">
            <div>
              <div class="text-[13px] font-medium">Always Thinking</div>
              <div class="text-[12px] mt-0.5 text-label">
                When enabled, Claude takes more time to reason through complex problems before responding. Better answers, but slower and uses more resources.
              </div>
            </div>
            <label class="field-toggle">
              <input
                type="checkbox"
                :checked="settings?.alwaysThinkingEnabled"
                @change="toggleAlwaysThinking(($event.target as HTMLInputElement).checked)"
              />
              <span class="field-toggle__track">
                <span class="field-toggle__thumb" />
              </span>
            </label>
          </div>
        </div>
      </div>

      <!-- Status Line -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-title">Status Line</h3>
        <p class="text-[12px] text-meta">
          Shows custom information in Claude Code's interface. Use a bash command to display dynamic content.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="field-group">
            <label class="field-label">Type</label>
            <USelectDropdown v-model="statusLineType" :options="statusLineOptions" />
          </div>
          <div class="field-group">
            <label class="field-label">Command</label>
            <input v-model="statusLineCommand" class="field-input" placeholder="echo 'status...'" />
          </div>
        </div>

        <div class="flex justify-end">
          <UButton label="Save Status Line" size="sm" variant="soft" :loading="saving" @click="saveStatusLine" />
        </div>
      </div>

      <!-- Plugins -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-label flex items-center gap-2">
          Extensions
          <HelpTip title="Managing extensions" body="Enable or disable extensions here. Install new ones via the Claude Code CLI." />
        </h3>
        <div v-if="plugins.length === 0" class="text-[13px] text-label">
          No plugins configured.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="plugin in plugins"
            :key="plugin.name"
            class="flex items-center justify-between py-2 px-3 rounded-lg"
            style="background: var(--input-bg);"
          >
            <span class="font-mono text-[12px] text-body">{{ plugin.name }}</span>
            <div class="flex items-center gap-3">
              <label class="field-toggle">
                <input
                  type="checkbox"
                  :checked="plugin.enabled"
                  @change="togglePlugin(plugin.name, ($event.target as HTMLInputElement).checked)"
                />
                <span class="field-toggle__track">
                  <span class="field-toggle__thumb" />
                </span>
              </label>
              <button
                class="p-1.5 -m-0.5 rounded focus-ring text-meta"
                aria-label="Remove plugin from settings"
                @click="removePlugin(plugin.name)"
              >
                <UIcon name="i-lucide-x" class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- GitHub Imports -->
      <div class="rounded-xl p-5 space-y-4 bg-card">
        <div class="flex items-center justify-between">
          <h3 class="text-section-title">GitHub Imports</h3>
          <UButton
            v-if="githubImports.length > 0"
            label="Check for updates"
            icon="i-lucide-refresh-cw"
            size="xs"
            variant="soft"
            @click="onCheckUpdates"
          />
        </div>
        <p class="text-[12px] text-meta">
          Manage repositories imported from GitHub.
        </p>

        <div v-if="githubImports.length === 0" class="text-[13px] text-label">
          No GitHub imports. Use the Explore page to import skills from GitHub.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="entry in githubImports"
            :key="`${entry.type}/${entry.owner}/${entry.repo}`"
            class="flex items-center justify-between py-2 px-3 rounded-lg"
            style="background: var(--input-bg);"
          >
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-[12px] text-body">{{ entry.owner }}/{{ entry.repo }}</span>
              <span 
                class="text-[9px] font-mono px-1.5 py-px rounded-full uppercase" 
                style="background: var(--badge-subtle-bg); color: var(--text-tertiary); border: 1px solid var(--border-subtle);"
              >
                {{ entry.type }}
              </span>
              <span class="text-[10px] text-meta ml-1">{{ entry.selectedItems?.length || 0 }} items</span>
            </div>
            <div class="flex items-center gap-2">
              <span
                v-if="entry.currentSha !== entry.remoteSha"
                class="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style="background: rgba(59, 130, 246, 0.1); color: var(--info, #3b82f6);"
              >
                Update available
              </span>
              <UButton
                v-if="entry.currentSha !== entry.remoteSha"
                label="Update"
                size="xs"
                variant="soft"
                @click="onUpdateImport(entry.owner, entry.repo, entry.type)"
              />
              <button
                class="p-1.5 -m-0.5 rounded focus-ring text-meta hover:text-error transition-colors"
                aria-label="Remove import"
                @click="onRemoveImport(entry.owner, entry.repo, entry.type)"
              >
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hooks -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-section-title">Automations</h3>
          <UButton label="Add Automation" icon="i-lucide-plus" size="xs" variant="soft" @click="showAddHookModal = true" />
        </div>
        <p class="text-[12px] text-meta">
          Run shell commands automatically when certain events happen in Claude Code.
        </p>

        <div v-if="hooks.length === 0" class="text-[13px] text-label">
          No automations configured.
        </div>

        <div v-else class="space-y-3">
          <div v-for="hook in hooks" :key="hook.event">
            <div class="flex items-center gap-2 mb-1.5">
              <UIcon name="i-lucide-webhook" class="size-3.5 text-meta" />
              <span class="text-[12px] font-medium text-body">{{ hookEventLabels[hook.event] || hook.event }}</span>
              <span class="font-mono text-[10px] text-meta">{{ hook.commands.length }}</span>
            </div>
            <div class="ml-5 space-y-1">
              <div
                v-for="(cmd, idx) in hook.commands"
                :key="idx"
                class="flex items-center justify-between py-1.5 px-3 rounded-lg group"
                style="background: var(--input-bg);"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-mono text-[12px] truncate block text-label">
                    {{ typeof cmd === 'string' ? cmd : (cmd as any).command || JSON.stringify(cmd) }}
                  </span>
                  <span
                    v-if="typeof cmd === 'object' && (cmd as any).matcher"
                    class="font-mono text-[10px] block mt-0.5 text-meta"
                  >
                    matcher: {{ (cmd as any).matcher }}
                  </span>
                </div>
                <button
                  class="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 -m-0.5 rounded focus-ring"
                  style="color: var(--error);"
                  aria-label="Delete hook"
                  @click="removeHook(hook.event, idx)"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Providers -->
      <div class="rounded-xl p-5 space-y-4 bg-card">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-section-title">Custom Providers</h3>
            <p class="text-[12px] text-meta mt-0.5">
              Add Anthropic-compatible API endpoints as selectable providers in chat.
            </p>
          </div>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
            style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
            @click="addNewProvider"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            Add Provider
          </button>
        </div>

        <!-- Accordion list -->
        <div class="space-y-2">
          <!-- Existing providers -->
          <div
            v-for="p in customProviders"
            :key="p.name"
            class="rounded-lg overflow-hidden"
            style="border: 1px solid var(--border-subtle);"
          >
            <!-- Accordion header -->
            <div
              class="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
              style="background: var(--surface-raised);"
              @click="toggleAccordion(p.name)"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="openAccordions.has(p.name) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-3.5 shrink-0"
                  style="color: var(--text-secondary);"
                />
                <span class="text-[13px] font-medium" style="color: var(--text-primary);">{{ p.displayName }}</span>
                <span class="text-[11px] font-mono" style="color: var(--text-tertiary);">{{ p.name }}</span>
              </div>
              <button
                type="button"
                class="text-[11px] px-2 py-0.5 rounded transition-colors"
                :class="confirmDelete === p.name ? 'text-white bg-red-500' : 'text-error hover:opacity-80'"
                :disabled="providerLoading"
                @click.stop="handleRemoveProvider(p.name)"
              >
                {{ confirmDelete === p.name ? 'Confirm?' : 'Delete' }}
              </button>
            </div>

            <!-- Accordion body -->
            <div v-if="openAccordions.has(p.name) && providerForms[p.name]" class="px-4 py-3 space-y-3" style="border-top: 1px solid var(--border-subtle);">
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Display Name</label>
                <input v-model="providerForms[p.name]!.displayName" class="field-input" :placeholder="p.name" />
              </div>
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Slug <span class="text-meta font-normal">(readonly)</span></label>
                <input :value="p.name" class="field-input opacity-60" readonly />
              </div>
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Base URL <span class="text-error">*</span></label>
                <input v-model="providerForms[p.name]!.baseUrl" class="field-input" placeholder="https://example.me" />
              </div>
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Auth Token <span class="text-error">*</span></label>
                <div class="relative">
                  <input
                    v-model="providerForms[p.name]!.authToken"
                    :type="providerForms[p.name]!.showToken ? 'text' : 'password'"
                    class="field-input pr-10"
                    placeholder="sk-***"
                    @input="providerForms[p.name]!.authTokenUnchanged = false"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-meta hover:text-body transition-colors"
                    @click="providerForms[p.name]!.showToken = !providerForms[p.name]!.showToken"
                  >
                    <UIcon :name="providerForms[p.name]!.showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5" />
                  </button>
                </div>
              </div>
              <div class="space-y-2">
                <p class="text-[12px] font-medium text-body">
                  Model Mappings
                  <span class="font-normal text-meta">(optional)</span>
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Opus →</label>
                    <input v-model="providerForms[p.name]!.modelMappings.opus" class="field-input text-[12px]" placeholder="claude-opus-4" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Sonnet →</label>
                    <input v-model="providerForms[p.name]!.modelMappings.sonnet" class="field-input text-[12px]" placeholder="claude-sonnet-4" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Haiku →</label>
                    <input v-model="providerForms[p.name]!.modelMappings.haiku" class="field-input text-[12px]" placeholder="claude-haiku-4" />
                  </div>
                </div>
              </div>
              <p v-if="providerForms[p.name]!.error" class="text-[12px] text-error">{{ providerForms[p.name]!.error }}</p>
              <div class="flex justify-end pt-1">
                <UButton size="sm" :loading="providerLoading" @click="handleSaveProvider(p.name)">
                  Save
                </UButton>
              </div>
            </div>
          </div>

          <!-- New provider form -->
          <div
            v-if="providerForms.__new__"
            class="rounded-lg overflow-hidden"
            style="border: 1px solid var(--border-subtle);"
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
              style="background: var(--surface-raised);"
              @click="toggleAccordion('__new__')"
            >
              <UIcon
                :name="openAccordions.has('__new__') ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3.5 shrink-0"
                style="color: var(--text-secondary);"
              />
              <span class="text-[13px] font-medium" style="color: var(--text-tertiary);">New Provider</span>
            </button>

            <div v-if="openAccordions.has('__new__')" class="px-4 py-3 space-y-3" style="border-top: 1px solid var(--border-subtle);">
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Provider Name <span class="text-error">*</span> <span class="font-normal text-meta">(used as slug: lowercase alphanumeric + hyphens)</span></label>
                <input v-model="providerForms.__new__!.displayName" class="field-input" placeholder="My Provider" />
              </div>
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Base URL <span class="text-error">*</span></label>
                <input v-model="providerForms.__new__!.baseUrl" class="field-input" placeholder="https://example.me" />
              </div>
              <div class="space-y-1">
                <label class="text-[12px] font-medium text-body">Auth Token <span class="text-error">*</span></label>
                <div class="relative">
                  <input
                    v-model="providerForms.__new__!.authToken"
                    :type="providerForms.__new__!.showToken ? 'text' : 'password'"
                    class="field-input pr-10"
                    placeholder="sk-***"
                    @input="providerForms.__new__!.authTokenUnchanged = false"
                  />
                  <button
                    type="button"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-meta hover:text-body transition-colors"
                    @click="providerForms.__new__!.showToken = !providerForms.__new__!.showToken"
                  >
                    <UIcon :name="providerForms.__new__!.showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5" />
                  </button>
                </div>
              </div>
              <div class="space-y-2">
                <p class="text-[12px] font-medium text-body">
                  Model Mappings
                  <span class="font-normal text-meta">(optional)</span>
                </p>
                <div class="grid grid-cols-3 gap-2">
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Opus →</label>
                    <input v-model="providerForms.__new__!.modelMappings.opus" class="field-input text-[12px]" placeholder="claude-opus-4" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Sonnet →</label>
                    <input v-model="providerForms.__new__!.modelMappings.sonnet" class="field-input text-[12px]" placeholder="claude-sonnet-4" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[11px] text-meta">Haiku →</label>
                    <input v-model="providerForms.__new__!.modelMappings.haiku" class="field-input text-[12px]" placeholder="claude-haiku-4" />
                  </div>
                </div>
              </div>
              <p v-if="providerForms.__new__!.error" class="text-[12px] text-error">{{ providerForms.__new__!.error }}</p>
              <div class="flex justify-between pt-1">
                <button
                  type="button"
                  class="text-[12px] text-meta hover:text-body transition-colors"
                  @click="cancelNewProvider"
                >
                  Cancel
                </button>
                <UButton size="sm" :loading="providerLoading" @click="handleSaveProvider('__new__')">
                  Save Provider
                </UButton>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <p v-if="customProviders.length === 0 && !providerForms.__new__" class="text-[12px] text-meta py-2">
            No custom providers yet. Click "Add Provider" to get started.
          </p>
        </div>
      </div>
    </div>

    <!-- Raw JSON editor -->
    <div v-else class="px-6 py-4">
      <div
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle);"
      >
        <div class="flex items-center justify-between px-4 py-2.5" style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle);">
          <h3 class="text-section-title">settings.json</h3>
          <div class="flex items-center gap-3">
            <span class="font-mono text-[10px] text-meta">
              {{ lineCount }} lines
            </span>
            <span class="font-mono text-[10px] text-meta">
              {{ charCount.toLocaleString() }} chars
            </span>
          </div>
        </div>
        <textarea
          v-model="rawJson"
          class="editor-textarea"
          style="min-height: 600px;"
          spellcheck="false"
        />
      </div>
    </div>

    <!-- Add Hook Modal -->
    <UModal v-model:open="showAddHookModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <h3 class="text-page-title">Add Automation</h3>
          <p class="text-[12px] leading-relaxed text-label">
            Run a shell command automatically when a specific event happens.
          </p>

          <div class="field-group">
            <label class="field-label" data-required>When this happens</label>
            <USelectDropdown v-model="newHookEvent" :options="hookEventOptions" placeholder="Select an event..." />
          </div>

          <div class="field-group">
            <label class="field-label" data-required>Run this command</label>
            <input v-model="newHookCommand" class="field-input" placeholder="e.g., bash -c 'echo done'" />
            <span class="field-hint">The shell command that will be executed</span>
          </div>

          <div class="field-group">
            <label class="field-label">Only for specific tools</label>
            <input v-model="newHookMatcher" class="field-input" placeholder="Leave blank for all (optional)" />
            <span class="field-hint">Only trigger when a specific tool is used (e.g., "Write" or "Bash")</span>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showAddHookModal = false" />
            <UButton
              label="Add"
              size="sm"
              :disabled="!newHookEvent || !newHookCommand"
              @click="addHook"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showRemoveConfirm">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-full flex items-center justify-center shrink-0" style="background: rgba(239, 68, 68, 0.1);">
              <UIcon name="i-lucide-alert-triangle" class="size-6 text-error" />
            </div>
            <div>
              <h3 class="text-[15px] font-semibold text-primary">Remove Repository?</h3>
              <p class="text-[12px] text-label mt-1">This action cannot be undone.</p>
            </div>
          </div>

          <div class="rounded-lg p-3 border" style="background: var(--surface-base); border-color: var(--border-subtle);">
            <p class="text-[13px] leading-relaxed">
              Removing <span class="font-mono font-bold">{{ repoToRemove?.owner }}/{{ repoToRemove?.repo }}</span> will delete the local clone and unlink 
              <strong class="text-error">{{ repoToRemove?.count }} {{ repoToRemove?.type }}</strong> currently installed on your system.
            </p>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              label="Cancel"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="showRemoveConfirm = false"
            />
            <UButton
              label="Confirm Delete"
              color="error"
              size="sm"
              @click="confirmRemove"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
