<script setup lang="ts">
import type { Agent, AgentFrontmatter } from "~/types";
import { MODEL, MODEL_IDS, MODEL_META } from "~/utils/models";

const props = defineProps<{
  mode: "create" | "edit";
  initial?: Agent;
  template?: { frontmatter: AgentFrontmatter; body: string };
}>();

const emit = defineEmits<{
  saved: [agent: Agent];
  cancel: [];
}>();

const { create, update } = useAgents();
const { fetchAll: fetchAllSkills, skills: allSkills } = useSkills();
const toast = useToast();
const saving = ref(false);
const submitted = ref(false);
const skillSearch = ref("");

const source = props.initial || props.template;

const frontmatter = ref<AgentFrontmatter>({
  name: source?.frontmatter.name || "",
  description: source?.frontmatter.description || "",
  model: source?.frontmatter.model,
  color: source?.frontmatter.color,
  memory: source?.frontmatter.memory,
  skills: source?.frontmatter.skills || [],
  tools: source?.frontmatter.tools || [],
});

onMounted(() => {
  fetchAllSkills();
});

const filteredSkills = computed(() => {
  const q = skillSearch.value.toLowerCase();
  if (!q) return allSkills.value;
  return allSkills.value.filter(
    (s) =>
      s.slug.toLowerCase().includes(q) ||
      s.frontmatter.name.toLowerCase().includes(q) ||
      s.frontmatter.description.toLowerCase().includes(q)
  );
});

function toggleSkill(slug: string) {
  const skills = [...(frontmatter.value.skills || [])];
  const idx = skills.indexOf(slug);
  if (idx === -1) {
    skills.push(slug);
  } else {
    skills.splice(idx, 1);
  }
  frontmatter.value.skills = skills;
}

const body = ref(source?.body || "");

const toolOptions: { label: string; value: AgentTool; icon: string }[] = [
  { label: 'Read', value: 'Read', icon: 'i-lucide-book-open' },
  { label: 'Grep', value: 'Grep', icon: 'i-lucide-search' },
  { label: 'Glob', value: 'Glob', icon: 'i-lucide-files' },
  { label: 'Bash', value: 'Bash', icon: 'i-lucide-terminal' },
  { label: 'Write', value: 'Write', icon: 'i-lucide-pencil-line' },
  { label: 'Edit', value: 'Edit', icon: 'i-lucide-file-text' },
]

const memoryOptions: { label: string; value: AgentMemory; description: string }[] = [
  { label: 'User', value: 'user', description: 'Global memory at ~/.claude/agent-memory/' },
  { label: 'Project', value: 'project', description: 'Project-specific persistent memory' },
  { label: 'Local', value: 'local', description: 'Memory stored in current directory' },
  { label: 'None', value: 'none', description: 'Do not persist learnings' },
]

function toggleTool(tool: AgentTool) {
  const tools = [...(frontmatter.value.tools || [])]
  const idx = tools.indexOf(tool)
  if (idx === -1) tools.push(tool)
  else tools.splice(idx, 1)
  frontmatter.value.tools = tools
}

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!frontmatter.value.name.trim()) e.name = "Name is required";
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(frontmatter.value.name.trim()))
    e.name =
      "Names can only contain lowercase letters, numbers, and hyphens (e.g., marketing-agent)";
  if (!frontmatter.value.description.trim())
    e.description = "Description is required";
  return e;
});

const isValid = computed(() => Object.keys(errors.value).length === 0);

function fieldError(field: string) {
  return submitted.value ? errors.value[field] : undefined;
}

async function save() {
  submitted.value = true;
  if (!isValid.value) return;

  saving.value = true;
  try {
    const isEdit = props.mode === "edit" && props.initial;
    const agent = isEdit
      ? await update(props.initial!.slug, {
          frontmatter: frontmatter.value,
          body: body.value,
        })
      : await create({ frontmatter: frontmatter.value, body: body.value });
    toast.add({
      title: isEdit ? "Agent updated" : "Agent created",
      color: "success",
    });
    emit("saved", agent);
  } catch (e: any) {
    toast.add({
      title: `Failed to ${props.mode} agent`,
      description: e.data?.message || e.message,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="p-6 space-y-4 bg-overlay flex flex-col w-fit">
    <h3 class="text-page-title">
      {{ mode === "edit" ? "Edit Agent" : "New Agent" }}
    </h3>

    <div v-if="mode === 'edit' && initial?.filePath" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-base border border-border-subtle group transition-colors hover:border-accent/30 w-full">
      <UIcon name="i-lucide-file-text" class="size-3.5 text-secondary group-hover:text-accent transition-colors" />
      <div class="flex flex-col min-w-0">
        <span class="text-[9px] font-mono text-meta uppercase tracking-wider">File Location</span>
        <span class="text-[11px] font-mono text-text-secondary truncate select-all">{{ initial.filePath }}</span>
      </div>
    </div>

    <p class="text-[12px] leading-relaxed text-label">
      Agents are specialized AI assistants with custom instructions. Give yours
      a name and describe when it should be used.
    </p>

    <div class="flex sm:grid-cols-2 gap-4">
      <div class="field-group">
        <label
          class="field-label"
          data-required
          >Name</label
        >
        <input
          v-model="frontmatter.name"
          class="field-input"
          :class="{ 'field-input--error': fieldError('name') }"
          placeholder="my-agent"
        />
        <span
          v-if="fieldError('name')"
          class="field-error"
          >{{ fieldError("name") }}</span
        >
        <span
          v-else
          class="field-hint"
          >This is used as an identifier (e.g., marketing-agent)</span
        >
      </div>

      <div class="field-group">
        <label class="field-label">Model</label>
        <div class="pill-picker">
          <button
            type="button"
            class="pill-picker__option"
            :class="{ 'pill-picker__option--active': !frontmatter.model }"
            @click="frontmatter.model = undefined"
          >
            none
          </button>
          <button
            v-for="id in MODEL_IDS"
            :key="id"
            type="button"
            :class="[
              'pill-picker__option',
              `pill-picker__option--${id}`,
              { 'pill-picker__option--active': frontmatter.model === id },
            ]"
            @click="frontmatter.model = id"
          >
            {{ MODEL_META[id].label.toLowerCase() }}
          </button>
        </div>
      </div>
    </div>

    <div class="field-group">
      <label class="field-label" data-required>Description</label>
      <textarea
        v-model="frontmatter.description"
        rows="3"
        class="field-textarea"
        :class="{ 'field-input--error': fieldError('description') }"
        placeholder="When to use this agent..."
      />
    </div>

    <div class="field-group">
      <label class="field-label">Persistent Memory</label>
      <div class="flex flex-wrap gap-2 mt-1.5">
        <button
          v-for="opt in memoryOptions"
          :key="opt.value"
          type="button"
          class="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all"
          :style="{
            background: frontmatter.memory === opt.value ? 'var(--accent-muted)' : 'transparent',
            borderColor: frontmatter.memory === opt.value ? 'var(--accent)' : 'var(--border-subtle)',
            color: frontmatter.memory === opt.value ? 'var(--accent)' : 'var(--text-secondary)'
          }"
          @click="frontmatter.memory = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
      <span class="field-hint mt-1.5">Where should this agent store its learnings?</span>
    </div>

    <div class="field-group">
      <label class="field-label">Allowed Tools</label>
      <div class="flex flex-wrap gap-2 mt-1.5">
        <button
          v-for="tool in toolOptions"
          :key="tool.value"
          type="button"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition-all"
          :style="{
            background: frontmatter.tools?.includes(tool.value) ? 'var(--accent-muted)' : 'transparent',
            borderColor: frontmatter.tools?.includes(tool.value) ? 'var(--accent)' : 'var(--border-subtle)',
            color: frontmatter.tools?.includes(tool.value) ? 'var(--accent)' : 'var(--text-secondary)'
          }"
          @click="toggleTool(tool.value)"
        >
          <UIcon :name="tool.icon" class="size-3.5" />
          {{ tool.label }}
          <UIcon v-if="frontmatter.tools?.includes(tool.value)" name="i-lucide-check" class="size-3" />
        </button>
      </div>
    </div>

    <div class="field-group">
      <label class="field-label">Preloaded Skills</label>
      <span class="field-hint">
        Select skills that should be automatically loaded into this agent's
        context at startup.
      </span>
      <div class="mt-2">
        <UMultiSelectDropdown
          v-model="frontmatter.skills"
          :options="allSkills.map(s => ({
            value: s.slug,
            label: s.frontmatter.name || s.slug,
            description: s.frontmatter.description
          }))"
          placeholder="Select skills to preload..."
          search-placeholder="Search skills..."
          icon="i-lucide-sparkles"
        />
      </div>
    </div>

    <div class="field-group">
      <label class="field-label">Instructions</label>
      <span class="field-hint"
        >Tell this agent how it should behave, what tone to use, and what rules
        to follow.</span
      >
      <textarea
        v-model="body"
        class="editor-textarea editor-textarea--standalone"
        spellcheck="false"
        placeholder="Tell this agent how it should behave..."
      />
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <UButton
        label="Cancel"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="emit('cancel')"
      />
      <UButton
        :label="mode === 'edit' ? 'Save' : 'Create'"
        size="sm"
        :loading="saving"
        @click="save"
      />
    </div>
  </div>
</template>
