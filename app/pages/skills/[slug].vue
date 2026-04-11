<script setup lang="ts">
import type { Skill, SkillFrontmatter } from '~/types'
import InstructionEditor from '~/components/studio/InstructionEditor.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { skills, fetchOne, fetchOneByPath, update, remove } = useSkills()
const { prefillSkill } = useChat()
const { agents } = useAgents()
const { workingDir } = useWorkingDir()
const { reveal } = useReveal()
const { clearChat: clearStudioChat, toolCalls, isStreaming: studioStreaming } = useStudioChat()

const slug = route.params.slug as string
const queryWorkingDir = route.query.workingDir as string | undefined
const queryFilePath = route.query.filePath as string | undefined
const skill = ref<Skill | null>(null)
const isImported = computed(() => skill.value?.source === 'github')
const saving = ref(false)

const frontmatter = ref<SkillFrontmatter>({ name: '', description: '' })
const body = ref('')

const { hasDraft, draftAge, loadDraft, clearDraft, scheduleSave } = useDraftRecovery(`skill:${slug}`)

watch([frontmatter, body], () => {
  if (skill.value && isDirty.value) scheduleSave(frontmatter.value, body.value)
}, { deep: true })

function restoreDraft() {
  const draft = loadDraft()
  if (draft) {
    frontmatter.value = draft.frontmatter as SkillFrontmatter
    body.value = draft.body
    clearDraft()
    toast.add({ title: 'Draft restored', color: 'success' })
  }
}

onMounted(async () => {
  try {
    // Try to find skill in local state to get filePath
    const localSkill = skills.value.find(s => s.slug === slug)
    const effectiveWorkingDir = queryWorkingDir || workingDir.value
    const query = effectiveWorkingDir ? { workingDir: effectiveWorkingDir } : {}
    const resolvedFilePath = queryFilePath || localSkill?.filePath

    if (resolvedFilePath) {
      skill.value = await $fetch<Skill>(`/api/skills/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: { filePath: resolvedFilePath },
        query
      })
    } else {
      skill.value = await $fetch<Skill>(`/api/skills/${encodeURIComponent(slug)}`, {
        query
      })
    }
    frontmatter.value = { ...skill.value.frontmatter }
    body.value = skill.value.body
    clearStudioChat()
  } catch (err: any) {
    console.error('Skill load error:', err)
    toast.add({ title: 'Skill not found', color: 'error' })
    router.push('/skills')
  }
})

async function save() {
  if (!frontmatter.value.name.trim()) {
    toast.add({ title: 'Name is required', color: 'error' })
    return
  }

  saving.value = true
  try {
    // Clean empty optional fields
    const fm: SkillFrontmatter = {
      name: frontmatter.value.name.trim(),
      description: frontmatter.value.description.trim(),
    }
    if (frontmatter.value.context?.trim()) fm.context = frontmatter.value.context.trim()
    if (frontmatter.value.agent?.trim()) fm.agent = frontmatter.value.agent.trim()

    const updated = await update(slug, { frontmatter: fm, body: body.value })
    skill.value = updated
    clearDraft()
    toast.add({ title: 'Saved', color: 'success' })
    if (updated.slug !== slug) router.replace(`/skills/${updated.slug}`)
  } catch (e: any) {
    toast.add({ title: 'Failed to save', description: e.data?.message || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const showDeleteConfirm = ref(false)

async function deleteSkill() {
  try {
    await remove(slug)
    toast.add({ title: 'Deleted', color: 'success' })
    router.push('/skills')
  } catch {
    toast.add({ title: 'Failed to delete', color: 'error' })
  }
}

async function editCopy() {
  if (!skill.value) return
  const { create } = useSkills()
  try {
    const copy = await create({
      frontmatter: { ...skill.value.frontmatter, name: skill.value.frontmatter.name + ' (copy)' },
      body: skill.value.body,
    })
    toast.add({ title: 'Copy created', color: 'success' })
    router.push(`/skills/${copy.slug}`)
  } catch (e: any) {
    toast.add({ title: 'Failed to create copy', description: e.data?.message || e.message, color: 'error' })
  }
}

// Cmd+S to save
if (import.meta.client) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save()
    }
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

const charCount = computed(() => body.value.length)
const lineCount = computed(() => body.value.split('\n').length)

const isDirty = computed(() => {
  if (!skill.value) return false
  return JSON.stringify(frontmatter.value) !== JSON.stringify(skill.value.frontmatter)
    || body.value !== skill.value.body
})

const isDraftComputed = computed(() => {
  if (!skill.value) return false
  return body.value !== skill.value.body || JSON.stringify(frontmatter.value) !== JSON.stringify(skill.value.frontmatter)
})

useUnsavedChanges(isDirty)
</script>

<template>
  <div class="h-full flex flex-col">
    <PageHeader :title="skill?.frontmatter.name || slug">
      <template #leading>
        <NuxtLink to="/skills" class="focus-ring rounded p-1.5 -m-1.5" aria-label="Back to skills">
          <UIcon name="i-lucide-arrow-left" class="size-4 text-label" />
        </NuxtLink>
      </template>
      <template #subtitle>
        <div v-if="skill?.filePath" class="flex items-center gap-1.5 text-[10px] text-meta font-mono max-w-2xl truncate">
          <UIcon name="i-lucide-file-text" class="size-3" />
          <span class="select-all">{{ skill.filePath }}</span>
        </div>
      </template>
      <template #trailing>
        <UIcon name="i-lucide-sparkles" class="size-4" style="color: var(--accent);" />
      </template>
      <template #right>
        <UButton
          icon="i-lucide-message-square"
          size="sm"
          variant="ghost"
          color="neutral"
          title="Use Skill in Chat"
          :disabled="!skill"
          @click="prefillSkill(skill!.frontmatter.name)"
        />
        <UButton
          v-if="skill?.filePath"
          icon="i-lucide-folder-open"
          size="sm"
          variant="ghost"
          color="neutral"
          title="Open in Finder"
          @click="reveal(skill.filePath)"
        />
        <template v-if="!isImported">
          <UButton
            label="Delete"
            icon="i-lucide-trash-2"
            size="sm"
            variant="ghost"
            color="error"
            @click="showDeleteConfirm = true"
          />
          <UButton 
            label="Save" 
            icon="i-lucide-save" 
            size="sm" 
            :loading="saving" 
            :variant="isDirty ? 'solid' : 'soft'" 
            :color="isDirty ? 'primary' : 'neutral'" 
            :disabled="!isDirty || saving"
            @click="save" 
          />
        </template>
        <UButton v-else label="Edit a copy" icon="i-lucide-copy" size="sm" color="neutral" variant="soft" @click="editCopy" />
      </template>
    </PageHeader>

    <div v-if="skill" class="px-6 py-5 space-y-6">
      <!-- Left: Editor -->
      <div class="flex flex-col space-y-6">
        <!-- Draft recovery banner -->
        <ClientOnly>
          <div
            v-if="hasDraft"
            class="rounded-xl px-4 py-3 flex items-center gap-3"
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

        <!-- Read-only banner for imported skills -->
        <div
          v-if="isImported"
          class="rounded-xl px-4 py-3 flex items-center gap-3"
          style="background: var(--badge-subtle-bg); border: 1px solid var(--border-subtle);"
        >
          <svg class="size-4 shrink-0 text-label" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span class="text-[12px] flex-1 text-label">
            This skill is imported from GitHub and is read-only. Updates from the source may overwrite local changes.
          </span>
          <UButton label="Edit a copy" size="xs" variant="soft" @click="editCopy" />
        </div>

        <!-- Configuration -->
        <div
          class="rounded-xl relative z-20"
          style="border: 1px solid var(--border-subtle);"
        >
          <!-- Skill identity banner -->
          <div class="relative px-5 pt-6 pb-5 rounded-t-xl overflow-hidden" style="background: var(--surface-raised);">
            <!-- Top accent bar -->
            <div
              class="absolute inset-x-0 top-0 h-[3px]"
              style="background: var(--accent);"
            />

            <!-- Identity row -->
            <div class="flex items-start gap-4">
              <div
                class="size-11 rounded-xl flex items-center justify-center shrink-0"
                style="background: var(--accent-muted); border: 1px solid rgba(45, 212, 191, 0.15);"
              >
                <UIcon name="i-lucide-sparkles" class="size-5" style="color: var(--accent);" />
              </div>

              <div class="flex-1 min-w-0 pt-0.5">
                <div class="flex items-center gap-2.5 flex-wrap">
                  <span class="text-[15px] font-semibold tracking-tight truncate">
                    {{ frontmatter.name || 'Unnamed Skill' }}
                  </span>
                  <span
                    v-if="frontmatter.context"
                    class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 badge badge-subtle"
                  >
                    {{ frontmatter.context }}
                  </span>
                  <span
                    v-if="skill.mcpServer"
                    class="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
                    style="background: rgba(99, 102, 241, 0.1); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.2);"
                  >
                    mcp: {{ skill.mcpServer.name }}
                  </span>
                </div>
                <p v-if="frontmatter.description" class="text-[12px] mt-1 leading-relaxed text-label">
                  {{ frontmatter.description }}
                </p>
              </div>
            </div>
          </div>

          <!-- Form fields -->
          <div class="px-5 py-4 space-y-4 rounded-b-xl" style="background: var(--surface-base); border-top: 1px solid var(--border-subtle);">
            <h3 class="text-section-label">Configuration</h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="field-group">
                <label class="field-label">Name</label>
                <input v-model="frontmatter.name" class="field-input" :disabled="isImported" />
                <span class="field-hint">Identifier for this skill. Also used as the slash command name.</span>
              </div>
              <div class="field-group">
                <label class="field-label">Availability</label>
                <input v-model="frontmatter.context" class="field-input" :disabled="isImported" placeholder="Leave blank for always available" />
                <span class="field-hint">Restrict when this skill appears (e.g., only in certain repos)</span>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Description</label>
              <textarea v-model="frontmatter.description" rows="4" class="field-textarea" :disabled="isImported" />
              <span class="field-hint">Helps Claude decide when to use this skill. Be specific about the trigger.</span>
            </div>
          </div>
        </div>

        <!-- MCP Server Info -->
        <div v-if="skill.mcpServer" class="space-y-3">
          <label class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Associated MCP Server</label>
          
          <NuxtLink 
            :to="`/mcp/${encodeURIComponent(skill.mcpServer.name)}?scope=${skill.mcpServer.scope}`"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:border-accent/30 hover:shadow-sm group/mcp" 
            style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors group-hover/mcp:bg-accent/10" style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.15);">
              <UIcon name="i-lucide-server" class="size-4" style="color: #818cf8;" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[12px] font-medium truncate group-hover/mcp:text-accent transition-colors" style="color: var(--text-primary);">{{ skill.mcpServer.name }}</div>
              <div class="text-[10px] truncate" style="color: var(--text-tertiary);">
                This skill appears to be part of or uses the {{ skill.mcpServer.name }} MCP server.
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span class="text-[9px] font-mono px-1.5 py-px rounded-full capitalize" style="background: var(--badge-subtle-bg); color: var(--text-tertiary); border: 1px solid var(--border-subtle);">{{ skill.mcpServer.scope }}</span>
            </div>
            <div class="shrink-0">
              <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-0 group-hover/mcp:opacity-100 transition-all text-meta" />
            </div>
          </NuxtLink>
        </div>

        <!-- Agents using this skill -->
        <div v-if="skill.agents?.length" class="space-y-3">
          <label class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Agents Preloading This Skill</label>
          
          <div class="space-y-2">
            <NuxtLink 
              v-for="agent in skill.agents" 
              :key="agent.slug" 
              :to="`/agents/${agent.slug}`"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:border-accent/30 hover:shadow-sm group/agent" 
              style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
            >
              <div class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors group-hover/agent:bg-accent/10" style="background: var(--accent-muted); border: 1px solid rgba(229, 169, 62, 0.1);">
                <UIcon name="i-lucide-user" class="size-4" style="color: var(--accent);" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[12px] font-medium truncate group-hover/agent:text-accent transition-colors" style="color: var(--text-primary);">{{ agent.name }}</div>
                <div class="text-[10px] truncate" style="color: var(--text-tertiary);">This agent will have this skill available in its context by default.</div>
              </div>
              <div class="shrink-0">
                <UIcon name="i-lucide-chevron-right" class="size-3.5 opacity-0 group-hover/agent:opacity-100 transition-all text-meta" />
              </div>
            </NuxtLink>
          </div>
          <p class="text-[10px] leading-relaxed" style="color: var(--text-tertiary);">
            These agents have this skill explicitly listed in their preloaded skills. You can manage this in each agent's settings.
          </p>
        </div>

        <!-- Skill Prompt Editor -->
        <div class="rounded-xl overflow-hidden bg-card flex flex-col" style="border: 1px solid var(--border-subtle); height: 500px;">
          <InstructionEditor
            v-model="body"
            :agent-name="frontmatter.name"
            :agent-description="frontmatter.description"
          />
        </div>
      </div>
    </div>

    <div v-else class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-meta" />
    </div>

    <!-- Delete confirmation -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <h3 class="text-page-title">Delete Skill</h3>
          <p class="text-[13px] text-label">
            Permanently delete <strong>{{ skill?.frontmatter.name }}</strong>? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showDeleteConfirm = false" />
            <UButton label="Delete" color="error" size="sm" @click="deleteSkill" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
