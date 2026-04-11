<script setup lang="ts">
import type { Skill, SkillFrontmatter } from '~/types'

const props = defineProps<{
  mode: 'create' | 'edit'
  initial?: Skill
}>()

const emit = defineEmits<{
  saved: [skill: Skill]
  cancel: []
}>()

const { create, update } = useSkills()
const toast = useToast()
const saving = ref(false)
const submitted = ref(false)

const frontmatter = ref<SkillFrontmatter>({
  name: props.initial?.frontmatter.name || '',
  description: props.initial?.frontmatter.description || '',
  context: props.initial?.frontmatter.context,
})

const body = ref(props.initial?.body || '')

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!frontmatter.value.name.trim()) e.name = 'Name is required'
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(frontmatter.value.name.trim()))
    e.name = 'Names can only contain lowercase letters, numbers, and hyphens (e.g., code-review)'
  if (!frontmatter.value.description.trim()) e.description = 'Description is required'
  return e
})

const isValid = computed(() => Object.keys(errors.value).length === 0)

function fieldError(field: string) {
  return submitted.value ? errors.value[field] : undefined
}

async function save() {
  submitted.value = true
  if (!isValid.value) return

  saving.value = true
  try {
    // Clean empty optional fields
    const fm: SkillFrontmatter = {
      name: frontmatter.value.name.trim(),
      description: frontmatter.value.description.trim(),
    }
    if (frontmatter.value.context?.trim()) fm.context = frontmatter.value.context.trim()

    const isEdit = props.mode === 'edit' && props.initial
    const skill = isEdit
      ? await update(props.initial!.slug, { frontmatter: fm, body: body.value })
      : await create({ frontmatter: fm, body: body.value })
    toast.add({ title: isEdit ? 'Skill updated' : 'Skill created', color: 'success' })
    emit('saved', skill)
  } catch (e: any) {
    toast.add({ title: `Failed to ${props.mode} skill`, description: e.data?.message || e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-4 bg-overlay">
    <h3 class="text-page-title">{{ mode === 'edit' ? 'Edit Skill' : 'New Skill' }}</h3>
    
    <div v-if="mode === 'edit' && initial?.filePath" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-base border border-border-subtle group transition-colors hover:border-accent/30">
      <UIcon name="i-lucide-file-text" class="size-3.5 text-secondary group-hover:text-accent transition-colors" />
      <div class="flex flex-col min-w-0">
        <span class="text-[9px] font-mono text-meta uppercase tracking-wider">File Location</span>
        <span class="text-[11px] font-mono text-text-secondary truncate select-all">{{ initial.filePath }}</span>
      </div>
    </div>

    <p class="text-[12px] leading-relaxed text-label">
      Skills are specific capabilities that can be added to agents. Define what this skill does and when it should be used.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="field-group">
        <label class="field-label" data-required>Name</label>
        <input
          v-model="frontmatter.name"
          class="field-input"
          :class="{ 'field-input--error': fieldError('name') }"
          placeholder="code-review"
        />
        <span v-if="fieldError('name')" class="field-error">{{ fieldError('name') }}</span>
        <span v-else class="field-hint">Used as an identifier (e.g., code-review)</span>
      </div>

      <div class="field-group">
        <label class="field-label">Availability</label>
        <input v-model="frontmatter.context" class="field-input" placeholder="Leave blank for always available" />
        <span class="field-hint">Optionally restrict when this skill appears. Leave blank to make it always available.</span>
      </div>
    </div>

    <div class="field-group">
      <label class="field-label" data-required>Description</label>
      <textarea
        v-model="frontmatter.description"
        rows="4"
        class="field-textarea"
        :class="{ 'field-input--error': fieldError('description') }"
        placeholder="When to use this skill and what it does..."
      />
      <span v-if="fieldError('description')" class="field-error">{{ fieldError('description') }}</span>
    </div>

    <div v-if="initial?.agents?.length" class="field-group">
      <label class="field-label">Preloaded in Agents</label>
      <div class="flex flex-wrap gap-1.5 mt-1">
        <span
          v-for="agent in initial.agents"
          :key="agent.slug"
          class="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-subtle-bg text-text-tertiary border border-border-subtle"
        >
          {{ agent.name }}
        </span>
      </div>
      <span class="field-hint mt-1">This skill is automatically loaded by these agents. Manage this in the Agent settings.</span>
    </div>

    <div v-if="initial?.mcpServer" class="field-group">
      <label class="field-label">Associated MCP Server</label>
      <div class="mt-1">
        <NuxtLink 
          :to="`/mcp/${encodeURIComponent(initial.mcpServer.name)}?scope=${initial.mcpServer.scope}`"
          class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-base border border-border-subtle hover:border-accent/30 transition-all group"
        >
          <UIcon name="i-lucide-server" class="size-3.5 text-secondary group-hover:text-accent transition-colors" />
          <span class="text-[11px] font-medium">{{ initial.mcpServer.name }}</span>
          <span class="text-[9px] font-mono text-meta uppercase ml-1">{{ initial.mcpServer.scope }}</span>
        </NuxtLink>
      </div>
      <span class="field-hint mt-1.5">This skill appears to be associated with an MCP server.</span>
    </div>

    <div class="field-group">
      <label class="field-label">Instructions</label>
      <span class="field-hint">Write detailed instructions for what Claude should do when this skill is used.</span>
      <textarea
        v-model="body"
        class="editor-textarea editor-textarea--standalone"
        spellcheck="false"
        placeholder="Instructions for this skill..."
      />
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="emit('cancel')" />
      <UButton :label="mode === 'edit' ? 'Save' : 'Create'" size="sm" :loading="saving" @click="save" />
    </div>
  </div>
</template>
