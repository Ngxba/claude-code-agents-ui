<script setup lang="ts">
import { onMounted, ref } from 'vue'

const { servers, loading, error, fetchServers, addServer, toggleServer, removeServer } = useMCP()
const { isPanelOpen, pendingInput } = useChat()

const isAddModalOpen = ref(false)
const showImportModal = ref(false)
const adding = ref(false)

onMounted(() => fetchServers())

async function onAddServer(payload: any) {
  adding.value = true
  try {
    await addServer(payload)
    isAddModalOpen.value = false
  } finally {
    adding.value = false
  }
}

function testServer(name: string) {
  isPanelOpen.value = true
  pendingInput.value = `Can you show me the tools provided by the ${name} MCP server?`
}
</script>

<template>
  <div class="h-full overflow-y-auto custom-scrollbar flex flex-col">
    <PageHeader title="MCP Servers">
      <template #trailing>
        <span class="font-mono text-[12px] text-meta mr-4">{{ servers.length }}</span>
      </template>
      <template #right>
        <UButton label="Import" icon="i-lucide-upload" size="sm" variant="soft" @click="showImportModal = true" />
        <UButton label="New MCP Server" icon="i-lucide-plus" size="sm" @click="isAddModalOpen = true" />
      </template>
    </PageHeader>

    <div class="px-6 py-4 flex-1">
      <p class="text-[13px] mb-6 leading-relaxed text-label max-w-2xl">
        Manage Model Context Protocol (MCP) servers. Global servers are available across all your projects, while project servers are scoped to your current working directory.
      </p>

      <div v-if="error" class="rounded-xl px-4 py-3 mb-6 flex items-start gap-3 border-error bg-error-subtle">
        <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5 text-error" />
        <span class="text-[12px] text-error">{{ error }}</span>
      </div>

      <div v-if="loading" class="space-y-2">
        <SkeletonRow v-for="i in 3" :key="i" />
      </div>
      <div v-else-if="servers.length === 0" class="flex flex-col items-center justify-center py-12 border border-dashed rounded-xl border-subtle">
        <UIcon name="i-lucide-server" class="size-8 text-meta mb-3" />
        <p class="text-[13px] text-secondary">No MCP servers configured.</p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NuxtLink
          v-for="server in servers"
          :key="server.name"
          :to="`/mcp/${encodeURIComponent(server.name)}?scope=${server.scope}`"
          class="bg-card group relative p-4 rounded-xl flex flex-col gap-3 hover-lift focus-ring cursor-pointer"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-[14px] font-semibold text-primary font-display truncate" :class="{ 'opacity-50': server.disabled }">{{ server.name }}</h3>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide uppercase"
                  :class="server.scope === 'global' ? 'bg-accent-subtle text-accent border border-accent-subtle' : 'bg-surface-raised text-secondary border border-subtle'"
                >
                  {{ server.scope }}
                </span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide uppercase bg-surface-raised text-meta border border-subtle">
                  {{ server.transport }}
                </span>
                <span v-if="server.disabled" class="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide uppercase bg-error/10 text-error border border-error/20">
                  Disabled
                </span>
              </div>
              <div v-if="server.transport === 'stdio'" class="text-[12px] font-mono text-meta truncate" :title="server.command + ' ' + (server.args?.join(' ') || '')" :class="{ 'opacity-50': server.disabled }">
                {{ server.command }} <span v-if="server.args?.length">{{ server.args.join(' ') }}</span>
              </div>
              <div v-else class="text-[12px] font-mono text-meta truncate" :title="server.url" :class="{ 'opacity-50': server.disabled }">
                {{ server.url }}
              </div>
            </div>
            
            <div class="flex items-center gap-2" @click.prevent>
              <label class="field-toggle scale-90" @click.stop>
                <input
                  type="checkbox"
                  :checked="!server.disabled"
                  @change="toggleServer(server)"
                />
                <span class="field-toggle__track">
                  <span class="field-toggle__thumb" />
                </span>
              </label>
            </div>
          </div>

          <div v-if="(server.env && Object.keys(server.env).length) || (server.headers && Object.keys(server.headers).length)" class="mt-auto pt-3 border-t border-subtle flex items-center gap-2" :class="{ 'opacity-50': server.disabled }">
            <UIcon :name="server.transport === 'stdio' ? 'i-lucide-key' : 'i-lucide-shield-check'" class="size-3 text-meta" />
            <span class="text-[11px] text-meta">
              {{ server.transport === 'stdio' ? `Has ${Object.keys(server.env || {}).length} env variable(s)` : `Has ${Object.keys(server.headers || {}).length} header(s)` }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Add Server Modal -->
    <UModal v-model:open="isAddModalOpen">
      <template #content>
        <AddMcpModal @close="isAddModalOpen = false" @add="onAddServer" />
      </template>
    </UModal>

    <!-- Import Modal -->
    <UModal v-model:open="showImportModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay rounded-2xl border border-subtle">
          <h3 class="text-page-title">Import MCP Config</h3>
          <p class="text-[12px] text-secondary opacity-80 leading-relaxed">
            Upload a <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">.json</code> file (e.g., your <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">~/.claude.json</code> or <code class="font-mono text-[11px] px-1 py-px rounded bg-surface-raised">claude_desktop_config.json</code>). Servers will be merged into your global configuration.
          </p>
          <FileImport
            type="mcp"
            @imported="() => { showImportModal = false; fetchServers() }"
          />
          <div class="flex justify-end pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showImportModal = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.bg-overlay { background: var(--surface-raised); }
.border-subtle { border-color: var(--border-subtle); }
.bg-surface-raised { background: var(--surface-raised); }
.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-meta { color: var(--text-meta); }
.text-accent { color: var(--accent); }
.hover\:text-accent:hover { color: var(--accent); }
.hover\:text-error:hover { color: var(--error); }
.bg-accent-subtle { background: rgba(229, 169, 62, 0.1); border-color: rgba(229, 169, 62, 0.2); }
.border-error { border-color: rgba(248, 113, 113, 0.2); }
.bg-error-subtle { background: rgba(248, 113, 113, 0.05); }
.text-error { color: var(--error); }
.font-display { font-family: var(--font-display); }

.btn-primary {
  background: var(--accent);
  color: var(--bg-primary);
  border-radius: 0.5rem;
  font-weight: 500;
}
</style>
