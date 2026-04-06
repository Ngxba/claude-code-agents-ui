<script setup lang="ts">
import type { AgentFrontmatter, AgentSkill } from '~/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const slug = route.params.slug as string

const { fetchOne, remove } = useAgents()
const { clearChat: clearStudioChat, toolCalls, isStreaming: studioStreaming } = useStudioChat()
const { reveal } = useReveal()

const frontmatter = ref<AgentFrontmatter>({ name: '', description: '', tools: [] })
const body = ref('')
const savedBody = ref('')
const savedFrontmatter = ref<AgentFrontmatter>({ name: '', description: '', tools: [] })
const loading = ref(true)
const saving = ref(false)
const lastModified = ref<number | null>(null)
const filePath = ref('')
const skills = ref<AgentSkill[]>([])
const loadingSkills = ref(false)
const isTestPanelOpen = ref(true)

const { hasDraft, draftAge, loadDraft, clearDraft, scheduleSave } = useDraftRecovery(`agent:${slug}`)

const isDirty = computed(() => {
  return body.value !== savedBody.value ||
    JSON.stringify(frontmatter.value) !== JSON.stringify(savedFrontmatter.value)
})

const isDraft = computed(() => body.value !== savedBody.value)

watch([frontmatter, body], () => {
  if (!loading.value && isDirty.value) scheduleSave(frontmatter.value, body.value)
}, { deep: true })

function restoreDraft() {
  const draft = loadDraft()
  if (draft) {
    frontmatter.value = { ...frontmatter.value, ...(draft.frontmatter as AgentFrontmatter) }
    body.value = draft.body
    clearDraft()
    toast.add({ title: 'Draft restored', color: 'success' })
  }
}

async function loadAgent() {
  loading.value = true
  try {
    const agent = await fetchOne(slug) as any
    const fm = agent.frontmatter as AgentFrontmatter
    
    // Ensure memory and tools are initialized
    const normalizedFm = { 
      memory: 'none',
      tools: [],
      ...fm 
    } as AgentFrontmatter
    
    frontmatter.value = { ...normalizedFm }
    savedFrontmatter.value = { ...normalizedFm }
    body.value = agent.body as string
    savedBody.value = agent.body as string
    lastModified.value = (agent.lastModified as number) || null
    filePath.value = agent.filePath || ''
  } catch {
    router.push('/agents')
  } finally {
    loading.value = false
  }
}

async function loadSkills() {
  loadingSkills.value = true
  try {
    skills.value = await $fetch<AgentSkill[]>(`/api/agents/${slug}/skills`)
  } catch {
    skills.value = []
  } finally {
    loadingSkills.value = false
  }
}

onMounted(() => {
  loadAgent()
  loadSkills()
  clearStudioChat()
})

async function save() {
  saving.value = true
  try {
    const result = await $fetch<{ slug: string; lastModified?: number }>(`/api/agents/${slug}`, {
      method: 'PUT',
      body: {
        frontmatter: frontmatter.value,
        body: body.value,
        ...(lastModified.value ? { lastModified: lastModified.value } : {}),
      },
    })

    savedFrontmatter.value = { ...frontmatter.value }
    savedBody.value = body.value
    lastModified.value = result.lastModified || null
    clearDraft()

    toast.add({
      title: 'Agent saved successfully',
      color: 'success'
    })

    if (result.slug !== slug) {
      router.push(`/agents/${result.slug}`)
    }
  } catch (e: any) {
    console.error('Failed to save:', e)
    toast.add({
      title: 'Failed to save agent',
      description: e.data?.message || e.message,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const showDeleteConfirm = ref(false)
async function handleDelete() {
  await remove(slug)
  clearDraft()
  router.push('/agents')
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (isDirty.value && !saving.value) save()
  }
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

useUnsavedChanges(isDirty)
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Top bar -->
    <div class="shrink-0 flex items-center justify-between px-6 py-3 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-3">
        <NuxtLink to="/agents" class="p-1 rounded-md hover-bg" style="color: var(--text-tertiary);">
          <UIcon name="i-lucide-arrow-left" class="size-4" />
        </NuxtLink>
        <div class="size-3 rounded-full" :style="{ background: frontmatter.color || 'var(--accent)' }" />
        <h1 class="text-[16px] font-semibold tracking-tight" style="color: var(--text-primary); font-family: var(--font-display);">
          {{ frontmatter.name || 'Agent' }}
        </h1>
        <span v-if="isDirty" class="text-[9px] font-mono px-1.5 py-px rounded-full" style="background: rgba(229, 169, 62, 0.1); color: var(--accent);">Unsaved</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-message-square"
          size="sm"
          variant="ghost"
          :color="isTestPanelOpen ? 'primary' : 'neutral'"
          :title="isTestPanelOpen ? 'Hide Test Panel' : 'Show Test Panel'"
          @click="isTestPanelOpen = !isTestPanelOpen"
        />
        <UButton
          v-if="filePath"
          icon="i-lucide-folder-open"
          size="sm"
          variant="ghost"
          color="neutral"
          title="Open in Finder"
          @click="reveal(filePath)"
        />
        <UButton
          label="Delete"
          icon="i-lucide-trash-2"
          size="sm"
          variant="ghost"
          color="error"
          title="Delete agent"
          @click="showDeleteConfirm = true"
        />
        <UButton
          :label="saving ? 'Saving...' : 'Save'"
          icon="i-lucide-save"
          size="sm"
          :variant="isDirty ? 'solid' : 'soft'"
          :color="isDirty ? 'primary' : 'neutral'"
          :disabled="!isDirty || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" style="color: var(--text-disabled);" />
    </div>

    <!-- Studio panels -->
    <div v-else class="flex-1 flex min-h-0">
      <!-- Left: Editor -->
      <div 
        class="flex flex-col min-h-0 transition-all duration-300 ease-in-out"
        :class="isTestPanelOpen ? 'w-[70%] border-r' : 'w-full'"
        style="border-color: var(--border-subtle);"
      >
        <!-- Draft recovery banner -->
        <ClientOnly>
          <div
            v-if="hasDraft"
            class="m-6 mb-0 rounded-xl px-4 py-3 flex items-center gap-3"
            style="background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.12);"
          >
            <UIcon name="i-lucide-archive-restore" class="size-4 shrink-0" style="color: var(--info, #3b82f6);" />
            <span class="text-[12px] flex-1" style="color: var(--text-secondary);">
              You have an unsaved draft from {{ draftAge }}.
            </span>
            <button class="text-[12px] font-medium px-2 py-1 rounded hover-bg" style="color: var(--info, #3b82f6);" @click="restoreDraft">Restore</button>
            <button class="text-[12px] px-2 py-1 rounded hover-bg text-meta" @click="clearDraft">Dismiss</button>
          </div>
        </ClientOnly>

        <EditorPanel
          :frontmatter="frontmatter"
          :body="body"
          :skills="skills"
          :loading-skills="loadingSkills"
          @update:frontmatter="frontmatter = $event"
          @update:body="body = $event"
        />
      </div>

      <!-- Right: Test + Inspector -->
      <div 
        v-if="isTestPanelOpen"
        class="w-[30%] flex flex-col transition-all duration-300 ease-in-out"
      >
        <div class="flex-1 min-h-0">
          <TestPanel :agent-slug="slug" :agent-name="frontmatter.name" :is-draft="isDraft" />
        </div>
        <ExecutionInspector :tool-calls="toolCalls" :is-streaming="studioStreaming" />

        <!-- File location (collapsed) -->
        <div class="shrink-0 p-4 border-t" style="border-color: var(--border-subtle); background: var(--surface-base);">
          <details class="group">
            <summary class="text-[10px] cursor-pointer list-none flex items-center gap-1.5 text-meta hover:text-label transition-colors">
              <UIcon name="i-lucide-file" class="size-3" />
              Show file location
            </summary>
            <div v-if="filePath" class="mt-2 font-mono text-[10px] pl-4.5 text-meta break-all select-all py-1.5 px-2 rounded bg-card border border-subtle">
              {{ filePath }}
            </div>
            <div v-else class="mt-2 font-mono text-[10px] pl-4.5 text-meta italic">
              Loading path...
            </div>
          </details>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.4);">
        <div class="rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" style="background: var(--surface-raised); border: 1px solid var(--border-subtle);">
          <h3 class="text-[15px] font-semibold" style="color: var(--text-primary);">Delete {{ frontmatter.name }}?</h3>
          <p class="text-[13px]" style="color: var(--text-secondary);">This will permanently delete this agent and cannot be undone.</p>
          <div class="flex gap-2 justify-end">
            <button class="px-3 py-1.5 rounded-lg text-[12px] font-medium hover-bg" style="color: var(--text-tertiary);" @click="showDeleteConfirm = false">Cancel</button>
            <button class="px-3 py-1.5 rounded-lg text-[12px] font-medium" style="background: var(--error); color: white;" @click="handleDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
