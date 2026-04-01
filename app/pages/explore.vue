<script setup lang="ts">
import { agentTemplates } from "~/utils/templates";
import { commandTemplates } from "~/utils/commandTemplates";
import { getAgentColor } from "~/utils/colors";
import { getFriendlyModelName } from "~/utils/terminology";

const { create: createAgent, fetchAll: fetchAgents, agents } = useAgents();
const { create: createCommand } = useCommands();
const {
  plugins,
  loading: pluginsLoading,
  error: pluginsError,
  fetchAll: fetchPlugins,
  toggleEnabled,
} = usePlugins();
const { fetchAll: fetchSkills, skills } = useSkills();
const github = useGithubImports();
const skillImports = github.skillImports;
const agentImports = github.agentImports;
const importsLoading = github.loading;
const skillUpdatesAvailable = github.skillUpdatesAvailable;
const agentUpdatesAvailable = github.agentUpdatesAvailable;
const fetchImports = github.fetchImports;
const checkUpdates = github.checkUpdates;
const updateImport = github.updateImport;
const removeImport = github.removeImport;

const searchQuery = ref("");

const filteredSkillImports = computed(() => {
  const list = skillImports?.value || []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(i => 
    i.owner.toLowerCase().includes(q) || 
    i.repo.toLowerCase().includes(q)
  )
})

const filteredAgentImports = computed(() => {
  const list = agentImports?.value || []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(i => 
    i.owner.toLowerCase().includes(q) || 
    i.repo.toLowerCase().includes(q)
  )
})

const importedAgentRepos = computed(() => {
  return filteredAgentImports.value.filter(i => (i.totalItems && i.totalItems > 0) || (i.selectedItems && i.selectedItems.length > 0))
})

const importedSkillRepos = computed(() => {
  return filteredSkillImports.value.filter(i => (i.totalItems && i.totalItems > 0) || (i.selectedItems && i.selectedItems.length > 0))
})

const {
  marketplaceData,
  sources: marketplaceSources,
  loading: marketplaceLoading,
  sourcesLoading,
  availablePlugins,
  fetchAvailable,
  fetchSources,
  installPlugin,
  uninstallPlugin,
  addSource: addMarketplaceSource,
  removeSource: removeMarketplaceSource,
  updateSource: updateMarketplaceSource,
} = useMarketplace();
const router = useRouter();
const route = useRoute();
const toast = useToast();

const creating = ref<string | null>(null);
const activeTab = ref<"templates" | "marketplace" | "import-agent" | "import-skill">(
  route.query.tab === "marketplace"
    ? "marketplace"
    : route.query.tab === "import-agent"
      ? "import-agent"
      : route.query.tab === "import-skill"
        ? "import-skill"
        : "templates",
);
const previewId = ref<string | null>(null);
const showImportSkillsModal = ref(false);
const showImportAgentsModal = ref(false);
const showRemoveConfirm = ref(false);
const repoToRemove = ref<{ owner: string; repo: string; type: 'skills' | 'agents'; count: number } | null>(null);

// Computed for imported agents
const importedAgents = computed(() => {
  const filtered = agents.value.filter(a => a.filePath?.includes('/github/'))
  if (!searchQuery.value) return filtered
  const q = searchQuery.value.toLowerCase()
  return filtered.filter(a => 
    a.frontmatter.name.toLowerCase().includes(q) || 
    a.frontmatter.description.toLowerCase().includes(q)
  )
})

// Computed for imported skills
const importedSkills = computed(() => {
  const filtered = skills.value.filter(s => s.filePath?.includes('/github/'))
  if (!searchQuery.value) return filtered
  const q = searchQuery.value.toLowerCase()
  return filtered.filter(s => 
    (s.frontmatter.name || s.slug).toLowerCase().includes(q) || 
    s.frontmatter.description.toLowerCase().includes(q)
  )
})
const showAddMarketplaceModal = ref(false);
const installingPlugin = ref<string | null>(null);
const uninstallingPlugin = ref<string | null>(null);
const marketplaceLimits = ref<Record<string, number>>({});
const installedLimits = ref<Record<string, number>>({});

const DEFAULT_LIMIT = 5;

function getLimitFor(marketplace: string) {
  return marketplaceLimits.value[marketplace] || DEFAULT_LIMIT;
}

function showMoreInstalled(marketplace: string) {
  const current = installedLimits.value[marketplace] || DEFAULT_LIMIT;
  installedLimits.value[marketplace] = current + 10;
}

function showMoreAvailable(marketplace: string) {
  const current = getLimitFor(marketplace);
  marketplaceLimits.value[marketplace] = current + 10;
}

const filteredAvailablePlugins = computed(() => {
  if (!searchQuery.value) return availablePlugins.value;
  const q = searchQuery.value.toLowerCase();
  return availablePlugins.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.marketplace.toLowerCase().includes(q),
  );
});

const availableGroupedByMarketplace = computed(() => {
  const groups: Record<string, typeof availablePlugins.value> = {};
  for (const plugin of filteredAvailablePlugins.value) {
    if (!groups[plugin.marketplace]) groups[plugin.marketplace] = [];
    groups[plugin.marketplace].push(plugin);
  }
  return groups;
});

async function onInstallPlugin(marketplace: string, plugin: string) {
  installingPlugin.value = plugin;
  try {
    await installPlugin(marketplace, plugin);
    toast.add({ title: `${plugin} installed`, color: "success" });
    await Promise.all([fetchPlugins(), fetchAvailable(), fetchSkills()]);
  } catch (e: any) {
    toast.add({
      title: "Install failed",
      description: e.data?.data?.message || e.data?.message || e.message,
      color: "error",
    });
  } finally {
    installingPlugin.value = null;
  }
}

async function onUninstallPlugin(pluginName: string) {
  uninstallingPlugin.value = pluginName;
  try {
    await uninstallPlugin(pluginName);
    toast.add({ title: `${pluginName} uninstalled`, color: "success" });
    await Promise.all([fetchPlugins(), fetchAvailable(), fetchSkills()]);
  } catch (e: any) {
    toast.add({
      title: "Uninstall failed",
      description: e.data?.data?.message || e.data?.message || e.message,
      color: "error",
    });
  } finally {
    uninstallingPlugin.value = null;
  }
}

async function onUpdateMarketplace(name: string) {
  try {
    await updateMarketplaceSource(name);
    toast.add({ title: `${name} updated`, color: "success" });
    await Promise.all([fetchSources(), fetchAvailable()]);
  } catch (e: any) {
    toast.add({
      title: "Update failed",
      description: e.data?.data?.message || e.data?.message || e.message,
      color: "error",
    });
  }
}

async function onRemoveMarketplace(name: string) {
  try {
    await removeMarketplaceSource(name);
    toast.add({ title: `${name} removed`, color: "success" });
    await Promise.all([fetchSources(), fetchAvailable()]);
  } catch (e: any) {
    toast.add({
      title: "Remove failed",
      description: e.data?.data?.message || e.data?.message || e.message,
      color: "error",
    });
  }
}

const agentCategories: Record<string, string[]> = {
  Development: ["code-reviewer", "debug-helper", "documentation-writer"],
  Writing: ["writing-assistant", "email-drafter", "social-media-writer"],
  Productivity: ["project-planner", "meeting-summarizer", "research-assistant"],
};

function agentCategoryFor(id: string): string {
  for (const [cat, ids] of Object.entries(agentCategories)) {
    if (ids.includes(id)) return cat;
  }
  return "Other";
}

const filteredAgentTemplates = computed(() => {
  if (!searchQuery.value) return agentTemplates;
  const q = searchQuery.value.toLowerCase();
  return agentTemplates.filter(
    (t) =>
      t.frontmatter.name.toLowerCase().includes(q) ||
      t.frontmatter.description.toLowerCase().includes(q),
  );
});

const groupedAgentTemplates = computed(() => {
  const groups: Record<string, typeof agentTemplates> = {};
  for (const t of filteredAgentTemplates.value) {
    const cat = agentCategoryFor(t.id);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }
  return groups;
});

const filteredCommandTemplates = computed(() => {
  if (!searchQuery.value) return commandTemplates;
  const q = searchQuery.value.toLowerCase();
  return commandTemplates.filter(
    (t) =>
      t.frontmatter.name.toLowerCase().includes(q) ||
      t.frontmatter.description.toLowerCase().includes(q),
  );
});

const filteredPlugins = computed(() => {
  if (!searchQuery.value) return plugins.value;
  const q = searchQuery.value.toLowerCase();
  return plugins.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.marketplace.toLowerCase().includes(q),
  );
});

const groupedByMarketplace = computed(() => {
  const groups: Record<string, typeof plugins.value> = {};
  for (const plugin of filteredPlugins.value) {
    const key = plugin.marketplace;
    if (!groups[key]) groups[key] = [];
    groups[key].push(plugin);
  }
  return groups;
});

async function useAgentTemplate(templateId: string) {
  const template = agentTemplates.find((t) => t.id === templateId);
  if (!template) return;
  creating.value = templateId;
  try {
    const agent = await createAgent({
      frontmatter: { ...template.frontmatter },
      body: template.body,
    });
    toast.add({
      title: `${template.frontmatter.name} created`,
      color: "success",
    });
    router.push(`/agents/${agent.slug}`);
  } catch (e: any) {
    toast.add({
      title: "Failed to create",
      description: e.data?.message || e.message,
      color: "error",
    });
  } finally {
    creating.value = null;
  }
}

async function useCommandTemplate(templateId: string) {
  const template = commandTemplates.find((t) => t.id === templateId);
  if (!template) return;
  creating.value = templateId;
  try {
    const command = await createCommand({
      frontmatter: { ...template.frontmatter },
      body: template.body,
      directory: template.directory,
    });
    toast.add({
      title: `/${template.frontmatter.name} created`,
      color: "success",
    });
    router.push(`/commands/${command.slug}`);
  } catch (e: any) {
    toast.add({
      title: "Failed to create",
      description: e.data?.message || e.message,
      color: "error",
    });
  } finally {
    creating.value = null;
  }
}

async function onToggle(id: string, enabled: boolean) {
  try {
    await toggleEnabled(id, enabled);
    toast.add({
      title: `Extension ${enabled ? "enabled" : "disabled"}`,
      color: "success",
    });
  } catch {
    toast.add({ title: "Failed to update", color: "error" });
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

onMounted(() => {
  fetchPlugins();
  fetchAvailable();
  fetchSources();
});

onMounted(async () => {
  await Promise.all([
    fetchImports('skills'),
    fetchImports('agents')
  ]);
  checkUpdates('skills');
  checkUpdates('agents');
});

async function onUpdate(owner: string, repo: string) {
  const type = activeTab.value === 'import-skill' ? 'skills' : 'agents';
  try {
    await updateImport(owner, repo, type);
    toast.add({ title: "Import updated", color: "success" });
    fetchSkills();
    fetchAgents();
  } catch {
    toast.add({ title: "Failed to update", color: "error" });
  }
}

async function onRemove(owner: string, repo: string) {
  const type = activeTab.value === 'import-skill' ? 'skills' : 'agents';
  const list = type === 'skills' ? skillImports : agentImports;
  const entry = list.value.find(i => i.owner === owner && i.repo === repo);
  
  repoToRemove.value = {
    owner,
    repo,
    type,
    count: entry?.selectedItems?.length || 0
  };
  showRemoveConfirm.value = true;
}

async function confirmRemove() {
  if (!repoToRemove.value) return;
  const { owner, repo, type } = repoToRemove.value;
  
  try {
    await removeImport(owner, repo, type);
    toast.add({ title: "Import removed", color: "success" });
    fetchSkills();
    fetchAgents();
  } catch {
    toast.add({ title: "Failed to remove", color: "error" });
  } finally {
    showRemoveConfirm.value = false;
    repoToRemove.value = null;
  }
}

function scrollToMarketplace(name: string) {
  const el = document.getElementById(`available-${name}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
</script>

<template>
  <div>
    <PageHeader title="Explore">
      <template #trailing>
        <span class="text-[12px] text-meta"
          >{{ agentTemplates.length + commandTemplates.length }} templates</span
        >
      </template>
      <template #right>
        <div class="flex items-center gap-2">
          <UButton
            label="Import Skills"
            icon="i-lucide-github"
            size="sm"
            variant="soft"
            @click="showImportSkillsModal = true"
          />
          <UButton
            label="Import Agent"
            icon="i-lucide-users"
            size="sm"
            variant="soft"
            @click="showImportAgentsModal = true"
          />
        </div>
      </template>
    </PageHeader>

    <div class="px-6 py-4 space-y-5">
      <!-- Tab switcher -->
      <div
        class="flex items-center gap-1 p-0.5 rounded-lg w-fit"
        style="background: var(--badge-subtle-bg)"
      >
        <button
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
          :style="{
            background:
              activeTab === 'templates' ? 'var(--surface-base)' : 'transparent',
            color:
              activeTab === 'templates'
                ? 'var(--text-primary)'
                : 'var(--text-tertiary)',
            boxShadow:
              activeTab === 'templates'
                ? '0 1px 3px var(--card-shadow)'
                : 'none',
          }"
          @click="activeTab = 'templates'"
        >
          Templates
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
          :style="{
            background:
              activeTab === 'import-agent' ? 'var(--surface-base)' : 'transparent',
            color:
              activeTab === 'import-agent'
                ? 'var(--text-primary)'
                : 'var(--text-tertiary)',
            boxShadow:
              activeTab === 'import-agent'
                ? '0 1px 3px var(--card-shadow)'
                : 'none',
          }"
          @click="activeTab = 'import-agent'"
        >
          Imported Agents ({{ importedAgentRepos.length }})
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
          :style="{
            background:
              activeTab === 'import-skill' ? 'var(--surface-base)' : 'transparent',
            color:
              activeTab === 'import-skill'
                ? 'var(--text-primary)'
                : 'var(--text-tertiary)',
            boxShadow:
              activeTab === 'import-skill'
                ? '0 1px 3px var(--card-shadow)'
                : 'none',
          }"
          @click="activeTab = 'import-skill'"
        >
          Imported Skills ({{ importedSkillRepos.length }})
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
          :style="{
            background:
              activeTab === 'marketplace'
                ? 'var(--surface-base)'
                : 'transparent',
            color:
              activeTab === 'marketplace'
                ? 'var(--text-primary)'
                : 'var(--text-tertiary)',
            boxShadow:
              activeTab === 'marketplace'
                ? '0 1px 3px var(--card-shadow)'
                : 'none',
          }"
          @click="activeTab = 'marketplace'"
        >
          Marketplace ({{ marketplaceSources.length }})
        </button>
      </div>
<!-- Search -->
<input
  v-model="searchQuery"
  :placeholder="
    activeTab === 'templates'
      ? 'Search templates...'
      : activeTab === 'import-agent'
        ? 'Search imported agents...'
        : activeTab === 'import-skill'
          ? 'Search imported skills...'
          : 'Search marketplace...'
  "
  class="field-search max-w-xs"
/>
      <!-- Import Agent Tab -->
      <template v-if="activeTab === 'import-agent'">
        <div class="flex items-center justify-between">
          <p class="text-[13px] leading-relaxed text-label">
            Agents imported from GitHub repositories.
          </p>
          <UButton
            label="Import new Agent"
            icon="i-lucide-plus"
            size="xs"
            variant="soft"
            @click="showImportAgentsModal = true"
          />
        </div>

        <div
          v-if="importsLoading"
          class="space-y-1"
        >
          <SkeletonRow
            v-for="i in 3"
            :key="i"
          />
        </div>

        <div v-else-if="importedAgentRepos.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ImportedRepoCard
            v-for="entry in importedAgentRepos"
            :key="`${entry.owner}/${entry.repo}`"
            :entry="entry"
            type="agents"
            @update="onUpdate"
            @remove="onRemove"
            @changed="() => { fetchImports('agents'); fetchAgents(); }"
          />
        </div>

        <div v-else class="text-center py-16 space-y-4">
          <div class="size-16 mx-auto rounded-full flex items-center justify-center bg-surface-raised">
            <UIcon name="i-lucide-users" class="size-8 text-meta" />
          </div>
          <div class="space-y-1">
            <p class="text-[14px] font-medium">No imported agents yet</p>
            <p class="text-[12px] text-label max-w-xs mx-auto">
              Import specialized agents from GitHub repositories to expand your assistant's capabilities.
            </p>
          </div>
          <UButton
            label="Import your first Agent"
            icon="i-lucide-plus"
            @click="showImportAgentsModal = true"
          />
        </div>
      </template>

      <!-- Templates Tab -->
      <template v-if="activeTab === 'templates'">
        <p class="text-[13px] leading-relaxed text-label">
          Ready-made configurations you can create with one click. Customize
          them after creation.
        </p>

        <!-- Agent templates -->
        <div
          v-for="(templates, category) in groupedAgentTemplates"
          :key="category"
          class="space-y-3"
        >
          <h3 class="text-section-label">{{ category }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="template in templates"
              :key="template.id"
              class="rounded-xl overflow-hidden bg-card group flex flex-col hover-lift border border-subtle"
            >
              <div class="p-4 space-y-3 flex-1">
                <div class="flex items-center gap-2.5">
                  <div
                    class="size-8 rounded-lg flex items-center justify-center shrink-0"
                    :style="{
                      background:
                        getAgentColor(template.frontmatter.color) + '15',
                      border:
                        '1px solid ' +
                        getAgentColor(template.frontmatter.color) +
                        '25',
                    }"
                  >
                    <UIcon
                      :name="template.icon"
                      class="size-4"
                      :style="{
                        color: getAgentColor(template.frontmatter.color),
                      }"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium truncate">
                      {{ template.frontmatter.name }}
                    </div>
                    <span
                      class="text-[10px] px-1.5 py-px rounded-full"
                      style="
                        background: var(--badge-subtle-bg);
                        color: var(--text-disabled);
                      "
                    >
                      {{ getFriendlyModelName(template.frontmatter.model) }}
                    </span>
                  </div>
                </div>
                <p class="text-[12px] text-label leading-relaxed">
                  {{ template.frontmatter.description }}
                </p>
                <button
                  class="text-[12px] text-meta hover:text-label transition-colors"
                  @click="
                    previewId = previewId === template.id ? null : template.id
                  "
                >
                  {{
                    previewId === template.id
                      ? "Hide instructions"
                      : "Preview instructions"
                  }}
                </button>
                <div
                  v-if="previewId === template.id"
                  class="rounded-lg p-3 text-[12px] font-mono leading-relaxed text-label max-h-48 overflow-y-auto"
                  style="
                    background: var(--surface-base);
                    border: 1px solid var(--border-subtle);
                  "
                >
                  <pre class="whitespace-pre-wrap">{{ template.body }}</pre>
                </div>
              </div>
              <div
                class="px-4 py-3 flex items-center justify-end h-min"
                style="border-top: 1px solid var(--border-subtle)"
              >
                <UButton
                  label="Use template"
                  size="sm"
                  :loading="creating === template.id"
                  :disabled="creating !== null && creating !== template.id"
                  @click="useAgentTemplate(template.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="
            !filteredAgentTemplates.length && !filteredCommandTemplates.length
          "
          class="text-center py-12"
        >
          <p class="text-[13px] text-label">No templates match your search.</p>
        </div>

        <!-- Action templates -->
        <div
          v-if="filteredCommandTemplates.length"
          class="space-y-3"
        >
          <h3 class="text-section-label">Action Templates</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="template in filteredCommandTemplates"
              :key="template.id"
              class="rounded-xl overflow-hidden bg-card group hover-lift border border-subtle"
            >
              <div class="p-4 space-y-3">
                <div class="flex items-center gap-2.5">
                  <div
                    class="size-8 rounded-lg flex items-center justify-center shrink-0"
                    style="
                      background: var(--badge-subtle-bg);
                      border: 1px solid var(--border-subtle);
                    "
                  >
                    <UIcon
                      :name="template.icon"
                      class="size-4 text-label"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium truncate">
                      /{{ template.frontmatter.name }}
                    </div>
                  </div>
                </div>
                <p class="text-[12px] text-label leading-relaxed">
                  {{ template.frontmatter.description }}
                </p>
                <button
                  class="text-[12px] text-meta hover:text-label transition-colors"
                  @click="
                    previewId = previewId === template.id ? null : template.id
                  "
                >
                  {{
                    previewId === template.id
                      ? "Hide instructions"
                      : "Preview instructions"
                  }}
                </button>
                <div
                  v-if="previewId === template.id"
                  class="rounded-lg p-3 text-[12px] font-mono leading-relaxed text-label max-h-48 overflow-y-auto"
                  style="
                    background: var(--surface-base);
                    border: 1px solid var(--border-subtle);
                  "
                >
                  <pre class="whitespace-pre-wrap">{{ template.body }}</pre>
                </div>
              </div>
              <div
                class="px-4 py-3 flex items-center justify-end"
                style="border-top: 1px solid var(--border-subtle)"
              >
                <UButton
                  label="Use template"
                  size="sm"
                  :loading="creating === template.id"
                  :disabled="creating !== null && creating !== template.id"
                  @click="useCommandTemplate(template.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Import Skill Tab -->
      <template v-if="activeTab === 'import-skill'">
        <div class="flex items-center justify-between">
          <p class="text-[13px] leading-relaxed text-label">
            Skill repositories imported from GitHub.
          </p>
          <UButton
            label="Import new Skill"
            icon="i-lucide-plus"
            size="xs"
            variant="soft"
            @click="showImportSkillsModal = true"
          />
        </div>

        <div
          v-if="importsLoading"
          class="space-y-1"
        >
          <SkeletonRow
            v-for="i in 3"
            :key="i"
          />
        </div>

        <div v-else-if="importedSkillRepos.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ImportedRepoCard
            v-for="entry in importedSkillRepos"
            :key="`${entry.owner}/${entry.repo}`"
            :entry="entry"
            type="skills"
            @update="onUpdate"
            @remove="onRemove"
            @changed="() => { fetchImports('skills'); fetchSkills(); }"
          />
        </div>

        <div v-else class="text-center py-16 space-y-4">
          <div class="size-16 mx-auto rounded-full flex items-center justify-center bg-surface-raised">
            <UIcon name="i-lucide-sparkles" class="size-8 text-meta" />
          </div>
          <div class="space-y-1">
            <p class="text-[14px] font-medium">No imported skills yet</p>
            <p class="text-[12px] text-label max-w-xs mx-auto">
              Import specialized skills from GitHub repositories to give your agents new capabilities.
            </p>
          </div>
          <UButton
            label="Import your first Skill"
            icon="i-lucide-plus"
            @click="showImportSkillsModal = true"
          />
        </div>
      </template>

      <!-- Marketplace Tab -->
      <template v-if="activeTab === 'marketplace'">
        <p class="text-[13px] leading-relaxed text-label">
          Browse, install, and manage plugins from your registered marketplaces.
        </p>

        <div
          v-if="pluginsError"
          class="rounded-xl px-4 py-3 flex items-start gap-3"
          style="background: rgba(248, 113, 113, 0.06); border: 1px solid rgba(248, 113, 113, 0.12);"
        >
          <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5" style="color: var(--error)" />
          <span class="text-[12px]" style="color: var(--error)">{{ pluginsError }}</span>
        </div>

        <!-- Section 1: Marketplace Sources -->
        <div class="space-y-3">
          <h3 class="text-section-label flex items-center gap-1.5">
            <UIcon name="i-lucide-settings" class="size-3.5" />
            Marketplace sources ({{ marketplaceSources.length }})
          </h3>
          <div class="space-y-3 pl-4.5">
            <div v-if="sourcesLoading" class="space-y-1">
              <SkeletonRow v-for="i in 2" :key="i" />
            </div>

            <div v-else-if="marketplaceSources.length" class="space-y-2">
              <MarketplaceSourceRow
                v-for="source in marketplaceSources"
                :key="source.name"
                :source="source"
                @update="onUpdateMarketplace"
                @remove="onRemoveMarketplace"
                @click-name="scrollToMarketplace"
              />
            </div>

            <p v-else class="text-[11px] text-meta">No marketplace sources registered.</p>

            <UButton
              label="Add Marketplace"
              icon="i-lucide-plus"
              size="xs"
              variant="soft"
              @click="showAddMarketplaceModal = true"
            />
          </div>
        </div>

        <div class="h-px bg-border-subtle my-2" />

        <!-- Section 2: Installed Plugins -->
        <div v-if="pluginsLoading" class="space-y-1">
          <SkeletonRow v-for="i in 5" :key="i" />
        </div>

        <div v-else-if="Object.keys(groupedByMarketplace).length" class="space-y-4">
          <div v-for="(group, marketplace) in groupedByMarketplace" :key="marketplace" class="space-y-3">
            <h3 class="text-section-label">Installed from {{ marketplace }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="plugin in group.slice(0, installedLimits[marketplace] || DEFAULT_LIMIT)"
                :key="plugin.id"
                class="rounded-xl overflow-hidden bg-card group flex flex-col hover-lift border border-subtle"
              >
                <div class="p-4 space-y-3 flex-1">
                  <div class="flex items-center gap-2.5">
                    <div
                      class="size-8 rounded-lg flex items-center justify-center shrink-0"
                      style="background: var(--accent-muted); border: 1px solid rgba(45, 212, 191, 0.15);"
                    >
                      <UIcon name="i-lucide-puzzle" class="size-4" style="color: var(--accent);" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-medium truncate">{{ plugin.name }}</div>
                      <span class="text-[10px] px-1.5 py-px rounded-full" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">
                        v{{ plugin.version }}
                      </span>
                    </div>
                    <label class="field-toggle shrink-0" @click.stop>
                      <input
                        type="checkbox"
                        :checked="plugin.enabled"
                        @change="onToggle(plugin.id, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="field-toggle__track">
                        <span class="field-toggle__thumb" />
                      </span>
                    </label>
                  </div>
                  <p class="text-[12px] text-label leading-relaxed">{{ plugin.description }}</p>
                  <div class="flex items-center gap-3">
                    <span v-if="plugin.skills.length" class="font-mono text-[10px] text-meta">
                      {{ plugin.skills.length }} skill{{ plugin.skills.length === 1 ? '' : 's' }}
                    </span>
                    <span class="font-mono text-[10px] text-meta">{{ formatDate(plugin.installedAt) }}</span>
                  </div>
                </div>
                <div class="px-4 py-3 flex items-center justify-between" style="border-top: 1px solid var(--border-subtle);">
                  <NuxtLink :to="`/plugins/${plugin.id}`" class="text-[12px] text-meta hover:text-label transition-colors">
                    View details
                  </NuxtLink>
                  <UButton
                    label="Uninstall"
                    size="xs"
                    variant="ghost"
                    color="error"
                    :loading="uninstallingPlugin === plugin.name"
                    @click="onUninstallPlugin(plugin.name)"
                  />
                </div>
              </div>
            </div>

            <div v-if="group.length > (installedLimits[marketplace] || DEFAULT_LIMIT)" class="flex justify-center pt-2">
              <UButton
                label="Show more"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-chevron-down"
                @click="showMoreInstalled(marketplace)"
              />
            </div>
          </div>
        </div>

        <!-- Section 3: Available Plugins -->
        <div v-if="!marketplaceLoading && Object.keys(availableGroupedByMarketplace).length" class="space-y-4 pt-4">
          <h3 class="text-section-label">Available to install</h3>

          <div v-for="(group, marketplace) in availableGroupedByMarketplace" :key="marketplace" :id="`available-${marketplace}`" class="space-y-3 pt-6">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-store" class="size-3.5 text-meta" />
              <span class="font-mono text-[12px] font-medium text-body">{{ marketplace }}</span>
              <span class="font-mono text-[11px] text-meta">{{ group.length }}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="plugin in group.slice(0, getLimitFor(marketplace))"
                :key="plugin.name"
                class="rounded-xl overflow-hidden bg-card group flex flex-col hover-lift border border-subtle"
              >
                <div class="p-4 space-y-3 flex-1">
                  <div class="flex items-center gap-2.5">
                    <div
                      class="size-8 rounded-lg flex items-center justify-center shrink-0"
                      style="background: var(--badge-subtle-bg); border: 1px solid var(--border-subtle);"
                    >
                      <UIcon name="i-lucide-puzzle" class="size-4 text-label" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[13px] font-medium truncate">{{ plugin.name }}</div>
                    </div>
                  </div>
                  <p class="text-[12px] text-label leading-relaxed">{{ plugin.description || 'No description' }}</p>
                  <div class="flex items-center gap-3">
                    <span v-if="plugin.skillCount" class="font-mono text-[10px] text-meta">
                      {{ plugin.skillCount }} skill{{ plugin.skillCount === 1 ? '' : 's' }}
                    </span>
                    <span v-if="plugin.commandCount" class="font-mono text-[10px] text-meta">
                      {{ plugin.commandCount }} cmd{{ plugin.commandCount === 1 ? '' : 's' }}
                    </span>
                  </div>
                </div>
                <div class="px-4 py-3 flex items-center justify-end" style="border-top: 1px solid var(--border-subtle);">
                  <UButton
                    label="Install"
                    icon="i-lucide-download"
                    size="sm"
                    :loading="installingPlugin === plugin.name"
                    @click="onInstallPlugin(plugin.marketplace, plugin.name)"
                  />
                </div>
              </div>
            </div>
            
            <div v-if="group.length > getLimitFor(marketplace)" class="flex justify-center pt-2">
              <UButton
                label="Show more"
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-chevron-down"
                @click="showMoreAvailable(marketplace)"
              />
            </div>
          </div>
        </div>

        <div v-else-if="marketplaceLoading" class="space-y-1">
          <SkeletonRow v-for="i in 3" :key="i" />
        </div>
      </template>
    </div>

    <UModal v-model:open="showImportSkillsModal">
      <template #content>
        <GithubImportModal
          type="skills"
          @imported="
            showImportSkillsModal = false;
            fetchImports('skills');
            fetchSkills();
          "
        />
      </template>
    </UModal>

    <UModal v-model:open="showImportAgentsModal">
      <template #content>
        <GithubImportModal
          type="agents"
          @imported="
            showImportAgentsModal = false;
            fetchImports('agents');
            fetchAgents();
          "
        />
      </template>
    </UModal>

    <UModal v-model:open="showAddMarketplaceModal">
      <template #content>
        <AddMarketplaceModal @added="showAddMarketplaceModal = false; fetchSources(); fetchAvailable()" />
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
