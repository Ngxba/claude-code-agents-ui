<script setup lang="ts">
import type { GithubImport } from '~/types'

const props = defineProps<{
  entry: GithubImport
}>()

const emit = defineEmits<{
  update: [owner: string, repo: string]
  remove: [owner: string, repo: string]
  changed: []
}>()

const { getAvailableSkills, updateSelectedSkills } = useGithubImports()
const toast = useToast()

const hasUpdate = computed(() => props.entry.currentSha !== props.entry.remoteSha)

const editing = ref(false)
const loadingSkills = ref(false)
const saving = ref(false)
const availableSkills = ref<{ slug: string; name: string; description: string; selected: boolean }[]>([])
const selected = ref<Set<string>>(new Set())

const allSelected = computed(() => {
  return availableSkills.value.length > 0 && selected.value.size === availableSkills.value.length
})

async function startEditing() {
  loadingSkills.value = true
  editing.value = true
  try {
    const skills = await getAvailableSkills(props.entry.owner, props.entry.repo)
    availableSkills.value = skills
    selected.value = new Set(skills.filter(s => s.selected).map(s => s.slug))
  } catch {
    toast.add({ title: 'Failed to load skills', color: 'error' })
    editing.value = false
  } finally {
    loadingSkills.value = false
  }
}

function toggleSkill(slug: string) {
  if (selected.value.has(slug)) {
    selected.value.delete(slug)
  } else {
    selected.value.add(slug)
  }
  selected.value = new Set(selected.value)
}

function toggleAllSkills() {
  if (!availableSkills.value.length) return

  if (allSelected.value) {
    selected.value = new Set()
  } else {
    selected.value = new Set(availableSkills.value.map(s => s.slug))
  }
}

async function saveSelection() {
  saving.value = true
  try {
    const { symlinkSync } = await updateSelectedSkills(
      props.entry.owner,
      props.entry.repo,
      [...selected.value],
    )
    const warnParts: string[] = []
    if (symlinkSync.skippedConflicts.length) {
      warnParts.push(
        `${symlinkSync.skippedConflicts.length} folder(s) in ~/.claude/skills already exist (not overwritten)`,
      )
    }
    if (symlinkSync.missingInClone.length) {
      warnParts.push(
        `${symlinkSync.missingInClone.length} could not be linked (missing in clone)`,
      )
    }
    const linkBits: string[] = []
    if (symlinkSync.linked.length) linkBits.push(`linked ${symlinkSync.linked.length}`)
    if (symlinkSync.removed.length) linkBits.push(`removed ${symlinkSync.removed.length} symlink(s)`)
    toast.add({
      title: 'Selection updated',
      description: linkBits.length ? `${linkBits.join(', ')} under ~/.claude/skills` : undefined,
      color: 'success',
    })
    if (warnParts.length) {
      toast.add({ title: 'Symlinks', description: warnParts.join(' '), color: 'warning' })
    }
    editing.value = false
    emit('changed')
  } catch {
    toast.add({ title: 'Failed to update selection', color: 'error' })
  } finally {
    saving.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="rounded-xl overflow-hidden bg-card hover-lift border border-subtle">
    <div class="p-4 space-y-3">
      <div class="flex items-center gap-2.5">
        <div
          class="size-8 rounded-lg flex items-center justify-center shrink-0"
          style="background: var(--badge-subtle-bg); border: 1px solid var(--border-subtle);"
        >
          <svg class="size-4 text-label" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium truncate">{{ entry.owner }}/{{ entry.repo }}</div>
          <span class="text-[10px] text-meta">{{ entry.selectedSkills.length }} skill{{ entry.selectedSkills.length === 1 ? '' : 's' }} selected</span>
        </div>
        <span
          v-if="hasUpdate"
          class="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style="background: rgba(59, 130, 246, 0.1); color: var(--info, #3b82f6);"
        >
          Update available
        </span>
      </div>

      <div class="flex items-center gap-3 text-[10px] text-meta font-mono">
        <span>Imported {{ formatDate(entry.importedAt) }}</span>
        <span>SHA {{ entry.currentSha.slice(0, 7) }}</span>
      </div>

      <!-- Edit selection panel -->
      <div v-if="editing" class="space-y-2">
        <div v-if="loadingSkills" class="flex items-center gap-2 py-2">
          <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin text-meta" />
          <span class="text-[12px] text-label">Loading skills...</span>
        </div>
        <template v-else>
          <div class="max-h-48 overflow-y-auto space-y-0.5 rounded-lg p-1" style="background: var(--surface-base);">
            <label
              v-for="skill in availableSkills"
              :key="skill.slug"
              class="flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover-row"
            >
              <input
                type="checkbox"
                :checked="selected.has(skill.slug)"
                class="mt-0.5 shrink-0"
                @change="toggleSkill(skill.slug)"
              />
              <div class="flex-1 min-w-0">
                <span class="text-[12px] font-medium">{{ skill.name }}</span>
                <p class="text-[10px] text-label mt-0.5 line-clamp-1">{{ skill.description }}</p>
              </div>
            </label>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              :label="allSelected ? 'Deselect all' : 'Select all'"
              size="xs"
              variant="ghost"
              color="neutral"
              :disabled="availableSkills.length === 0"
              @click="toggleAllSkills"
            />
            <UButton label="Cancel" variant="ghost" color="neutral" size="xs" @click="editing = false" />
            <UButton
              :label="`Save (${selected.size})`"
              size="xs"
              :loading="saving"
              @click="saveSelection"
            />
          </div>
        </template>
      </div>
    </div>

    <div class="px-4 py-3 flex items-center justify-between" style="border-top: 1px solid var(--border-subtle);">
      <a
        :href="entry.url"
        target="_blank"
        rel="noopener"
        class="text-[12px] text-meta hover:text-label transition-colors"
      >
        View on GitHub
      </a>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!editing"
          label="Edit selection"
          icon="i-lucide-settings-2"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="startEditing"
        />
        <UButton
          v-if="hasUpdate"
          label="Update"
          icon="i-lucide-download"
          size="xs"
          variant="soft"
          @click="emit('update', entry.owner, entry.repo)"
        />
        <UButton
          label="Remove"
          icon="i-lucide-trash-2"
          size="xs"
          variant="ghost"
          color="error"
          @click="emit('remove', entry.owner, entry.repo)"
        />
      </div>
    </div>
  </div>
</template>
