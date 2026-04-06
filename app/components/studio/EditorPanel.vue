<script setup lang="ts">
import type { AgentFrontmatter, AgentMemory, AgentSkill, AgentTool } from '~/types'
import { MODEL_META, MODEL_IDS } from '~/utils/models'
import { getAgentColor, agentColorMap } from '~/utils/colors'

const props = defineProps<{
  frontmatter: AgentFrontmatter
  body: string
  skills: AgentSkill[]
  loadingSkills: boolean
}>()

const emit = defineEmits<{
  'update:frontmatter': [value: AgentFrontmatter]
  'update:body': [value: string]
}>()

const { fetchAll: fetchAllSkills, skills: allSkills } = useSkills()

const activeTab = ref<'instructions' | 'settings' | 'skills'>('instructions')

const modelOptions = MODEL_IDS.map(id => ({
  value: id,
  label: MODEL_META[id].label,
  description: MODEL_META[id].description
}))

const memoryOptions: { label: string; value: AgentMemory; description: string }[] = [
  { label: 'User', value: 'user', description: 'Global memory at ~/.claude/agent-memory/' },
  { label: 'Project', value: 'project', description: 'Project-specific persistent memory' },
  { label: 'Local', value: 'local', description: 'Memory stored in current directory' },
  { label: 'None', value: 'none', description: 'Do not persist learnings' },
]

const toolOptions: { label: string; value: AgentTool; icon: string; description: string }[] = [
  { label: 'Read', value: 'Read', icon: 'i-lucide-book-open', description: 'Read file contents' },
  { label: 'Grep', value: 'Grep', icon: 'i-lucide-search', description: 'Search inside files' },
  { label: 'Glob', value: 'Glob', icon: 'i-lucide-files', description: 'Find files by pattern' },
  { label: 'Bash', value: 'Bash', icon: 'i-lucide-terminal', description: 'Execute shell commands' },
  { label: 'Write', value: 'Write', icon: 'i-lucide-pencil-line', description: 'Create or overwrite files' },
  { label: 'Edit', value: 'Edit', icon: 'i-lucide-file-text', description: 'Edit specific lines in files' },
]

function updateFrontmatter(key: keyof AgentFrontmatter, value: unknown) {
  emit('update:frontmatter', { ...props.frontmatter, [key]: value })
}

onMounted(() => {
  fetchAllSkills()
})

const preloadedSkillSlugs = computed({
  get: () => props.frontmatter.skills || [],
  set: (val) => updateFrontmatter('skills', val)
})

function toggleTool(tool: AgentTool) {
  const tools = [...(props.frontmatter.tools || [])]
  const idx = tools.indexOf(tool)
  if (idx === -1) tools.push(tool)
  else tools.splice(idx, 1)
  updateFrontmatter('tools', tools)
}

const presetColors = Object.entries(agentColorMap)
const currentColor = computed(() => getAgentColor(props.frontmatter.color))
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="shrink-0 flex border-b" style="border-color: var(--border-subtle);">
      <button
        v-for="tab in (['instructions', 'settings', 'skills'] as const)"
        :key="tab"
        class="px-4 py-2.5 text-[12px] font-medium capitalize transition-all relative"
        :style="{ color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)' }"
        @click="activeTab = tab"
      >
        {{ tab }}
        <div v-if="activeTab === tab" class="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style="background: var(--accent);" />
      </button>
    </div>

    <div v-if="activeTab === 'instructions'" class="flex-1 min-h-0 flex flex-col">
      <InstructionEditor :model-value="body" :agent-name="frontmatter.name" :agent-description="frontmatter.description" @update:model-value="emit('update:body', $event)" />
    </div>

    <div v-if="activeTab === 'settings'" class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="space-y-1">
        <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Name</label>
        <input :value="frontmatter.name" class="field-input w-full" placeholder="Agent name" @input="updateFrontmatter('name', ($event.target as HTMLInputElement).value)" />
      </div>
      <div class="space-y-1">
        <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Description</label>
        <textarea :value="frontmatter.description" rows="4" class="field-input w-full" placeholder="What does this agent do?" @input="updateFrontmatter('description', ($event.target as HTMLInputElement).value)" />
      </div>
      <div class="space-y-1">
        <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Model</label>
        <div class="flex gap-2">
          <button
            v-for="opt in modelOptions"
            :key="opt.value"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            :style="{
              background: frontmatter.model === opt.value ? 'var(--accent-muted)' : 'var(--surface-raised)',
              border: '1px solid ' + (frontmatter.model === opt.value ? 'rgba(229, 169, 62, 0.2)' : 'var(--border-subtle)'),
              color: frontmatter.model === opt.value ? 'var(--accent)' : 'var(--text-secondary)'
            }"
            @click="updateFrontmatter('model', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="space-y-1">
        <label class="text-[11px] font-medium" style="color: var(--text-tertiary);">Memory</label>
        <div class="flex gap-2">
          <button
            v-for="opt in memoryOptions"
            :key="opt.value"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
            :style="{
              background: frontmatter.memory === opt.value ? 'var(--accent-muted)' : 'var(--surface-raised)',
              border: '1px solid ' + (frontmatter.memory === opt.value ? 'rgba(229, 169, 62, 0.2)' : 'var(--border-subtle)'),
              color: frontmatter.memory === opt.value ? 'var(--accent)' : 'var(--text-secondary)'
            }"
            @click="updateFrontmatter('memory', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Tools selection -->
      <div class="space-y-2 pt-2">
        <label class="text-[11px] font-medium uppercase tracking-wider opacity-50" style="color: var(--text-primary);">Allowed Tools</label>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="tool in toolOptions"
            :key="tool.value"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all border text-left"
            :style="{
              background: frontmatter.tools?.includes(tool.value) ? 'var(--accent-muted)' : 'var(--surface-base)',
              borderColor: frontmatter.tools?.includes(tool.value) ? 'rgba(229, 169, 62, 0.3)' : 'var(--border-subtle)',
            }"
            @click="toggleTool(tool.value)"
          >
            <div 
              class="size-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
              :style="{ 
                background: frontmatter.tools?.includes(tool.value) ? 'rgba(229, 169, 62, 0.1)' : 'var(--surface-raised)',
                color: frontmatter.tools?.includes(tool.value) ? 'var(--accent)' : 'var(--text-tertiary)'
              }"
            >
              <UIcon :name="tool.icon" class="size-3.5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[11.5px] font-medium leading-none" :style="{ color: frontmatter.tools?.includes(tool.value) ? 'var(--text-primary)' : 'var(--text-secondary)' }">
                {{ tool.label }}
              </div>
            </div>
            <div v-if="frontmatter.tools?.includes(tool.value)" class="shrink-0">
              <UIcon name="i-lucide-check" class="size-3" style="color: var(--accent);" />
            </div>
          </button>
        </div>
      </div>

      <!-- Color -->
      <div class="space-y-2.5 pt-2">
        <label class="text-[11px] font-medium uppercase tracking-wider opacity-50" style="color: var(--text-primary);">UI Theme Color</label>
        <div class="flex flex-wrap gap-2">
          <!-- Preset Swatches -->
          <button
            v-for="[name, value] in presetColors"
            :key="name"
            type="button"
            class="size-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95"
            :style="{ 
              background: value, 
              borderColor: (frontmatter.color === name || frontmatter.color === value) ? 'white' : 'transparent',
              boxShadow: (frontmatter.color === name || frontmatter.color === value) ? '0 0 0 1px ' + value : 'none'
            }"
            :title="name"
            @click="updateFrontmatter('color', name)"
          />
          
          <!-- Custom Color Picker -->
          <div class="relative flex items-center gap-2 ml-1 pl-3 border-l" style="border-color: var(--border-subtle);">
            <div 
              class="size-6 rounded-full border relative overflow-hidden" 
              :style="{ background: currentColor, borderColor: 'var(--border-subtle)' }"
            >
              <input 
                type="color" 
                :value="currentColor" 
                class="absolute inset-0 opacity-0 cursor-pointer scale-150" 
                @input="updateFrontmatter('color', ($event.target as HTMLInputElement).value)" 
              />
              <UIcon name="i-lucide-plus" class="absolute inset-0 m-auto size-3 pointer-events-none" style="color: white; mix-blend-mode: difference;" />
            </div>
            <span class="text-[10px] font-mono opacity-60 uppercase" style="color: var(--text-tertiary);">{{ frontmatter.color || 'Default' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'skills'" class="flex-1 overflow-y-auto p-5 space-y-6">
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Preloaded Skills</label>
          <HelpTip title="Preloading Skills" body="Injected directly into the subagent's context. Faster and more reliable than discovery." />
        </div>
        
        <UMultiSelectDropdown
          v-model="preloadedSkillSlugs"
          :options="allSkills.map(s => ({
            value: s.slug,
            label: s.frontmatter.name || s.slug,
            description: s.frontmatter.description
          }))"
          placeholder="Add skills to preload..."
          search-placeholder="Search available skills..."
          icon="i-lucide-sparkles"
        />
        
        <p class="text-[10px] leading-relaxed" style="color: var(--text-tertiary);">
          These skills will be available to the agent immediately without needing to search for them.
        </p>
      </div>

      <div class="space-y-3">
        <label class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Currently Attached</label>
        
        <div v-if="loadingSkills" class="text-[11px] font-mono py-4 text-center" style="color: var(--text-disabled);">Loading attached skills...</div>
        <div v-else-if="!skills.length" class="text-[12px] py-8 text-center border border-dashed rounded-xl" style="color: var(--text-tertiary); border-color: var(--border-subtle);">
          <UIcon name="i-lucide-sparkles" class="size-5 mx-auto mb-2 opacity-20" />
          No skills attached to this agent.
        </div>
        <div v-else class="space-y-2">
          <NuxtLink 
            v-for="skill in skills" 
            :key="skill.slug" 
            :to="`/skills/${skill.slug}`"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:border-accent/30 hover:shadow-sm group/skill" 
            style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors group-hover/skill:bg-accent/10" style="background: var(--accent-muted); border: 1px solid rgba(229, 169, 62, 0.1);">
              <UIcon name="i-lucide-sparkles" class="size-4" style="color: var(--accent);" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[12px] font-medium truncate group-hover/skill:text-accent transition-colors" style="color: var(--text-primary);">{{ skill.frontmatter.name }}</div>
              <div class="text-[10px] truncate" style="color: var(--text-tertiary);">{{ skill.frontmatter.description }}</div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span class="text-[9px] font-mono px-1.5 py-px rounded-full" style="background: var(--badge-subtle-bg); color: var(--text-tertiary); border: 1px solid var(--border-subtle);">{{ skill.source }}</span>
              <span v-if="frontmatter.skills?.includes(skill.slug)" class="text-[8px] font-bold uppercase tracking-tighter" style="color: var(--accent);">Preloaded</span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
