<script setup lang="ts">
const { plugins, loading, error, fetchAll, toggleEnabled } = usePlugins()
const { fetchAvailable } = useMarketplace()
const toast = useToast()

const searchQuery = ref('')
const showAddPluginModal = ref(false)

onMounted(() => {
  fetchAll()
  fetchAvailable()
})

const filteredPlugins = computed(() => {
  if (!searchQuery.value) return plugins.value
  const q = searchQuery.value.toLowerCase()
  return plugins.value.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description?.toLowerCase().includes(q) ||
    p.marketplace.toLowerCase().includes(q)
  )
})

const groupedByMarketplace = computed(() => {
  const groups: Record<string, typeof plugins.value> = {}
  for (const plugin of filteredPlugins.value) {
    const key = plugin.marketplace
    if (!groups[key]) groups[key] = []
    groups[key].push(plugin)
  }
  return groups
})

async function onToggle(id: string, enabled: boolean) {
  try {
    await toggleEnabled(id, enabled)
    toast.add({ title: `Plugin ${enabled ? 'enabled' : 'disabled'}`, color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update', color: 'error' })
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function onPluginInstalled() {
  showAddPluginModal.value = false
  fetchAll()
}
</script>

<template>
  <div>
    <PageHeader title="Plugins">
      <template #trailing>
        <span class="font-mono text-[12px] text-meta">{{ plugins.length }}</span>
      </template>
      <template #right>
        <UButton
          label="Add Plugin"
          icon="i-lucide-plus"
          size="sm"
          variant="soft"
          @click="showAddPluginModal = true"
        />
      </template>
    </PageHeader>

    <div class="px-6 py-4">
      <p class="text-[13px] mb-4 leading-relaxed text-label">
        Pre-built extensions that add new features and capabilities.
      </p>

      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="searchQuery"
          placeholder="Search plugins..."
          class="field-search max-w-xs"
        />
      </div>

      <div
        v-if="error"
        class="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
        style="background: rgba(248, 113, 113, 0.06); border: 1px solid rgba(248, 113, 113, 0.12);"
      >
        <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5" style="color: var(--error);" />
        <span class="text-[12px]" style="color: var(--error);">{{ error }}</span>
      </div>

      <div v-if="loading" class="space-y-1">
        <SkeletonRow v-for="i in 5" :key="i" />
      </div>

      <div v-else-if="Object.keys(groupedByMarketplace).length" class="space-y-4">
        <div v-for="(group, marketplace) in groupedByMarketplace" :key="marketplace">
          <!-- Marketplace header -->
          <div class="flex items-center gap-2 py-2 px-2 -mx-2">
            <UIcon name="i-lucide-store" class="size-3.5 text-meta" />
            <span class="font-mono text-[13px] font-medium text-body">{{ marketplace }}</span>
            <span class="font-mono text-[12px] text-meta">{{ group.length }}</span>
          </div>

          <!-- Plugin list -->
          <div class="space-y-1">
            <div
              v-for="plugin in group"
              :key="plugin.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg group hover-row"
            >
              <!-- Toggle -->
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

              <!-- Clickable area for navigation -->
              <NuxtLink
                :to="`/plugins/${encodeURIComponent(plugin.id)}`"
                class="flex items-center gap-3 flex-1 min-w-0 focus-ring rounded"
              >
                <!-- Name -->
                <span class="text-[13px] font-medium w-44 shrink-0 truncate">
                  {{ plugin.name }}
                </span>

                <!-- Version badge -->
                <span
                  class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge badge-subtle"
                >
                  v{{ plugin.version }}
                </span>

                <!-- Description -->
                <span class="flex-1 text-[12px] truncate text-label">
                  {{ plugin.description }}
                </span>

                <!-- Metadata -->
                <div class="flex items-center gap-3 shrink-0">
                  <span
                    v-if="plugin.skills.length"
                    class="font-mono text-[10px] text-meta"
                    :title="plugin.skills.join(', ')"
                  >
                    {{ plugin.skills.length }} skill{{ plugin.skills.length === 1 ? '' : 's' }}
                  </span>
                  <span class="font-mono text-[10px] text-meta">
                    {{ formatDate(plugin.installedAt) }}
                  </span>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-meta"
                  />
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state: search miss -->
      <div v-else-if="searchQuery" class="flex flex-col items-center justify-center py-16">
        <p class="text-[13px] text-label">No plugins match your search.</p>
      </div>

      <!-- Empty state: no plugins -->
      <div v-else class="flex flex-col items-center justify-center py-12 space-y-6">
        <div class="rounded-2xl p-8 bg-card max-w-sm w-full font-mono text-[12px] text-label leading-relaxed text-center space-y-6 shadow-sm border border-border-subtle">
          <div class="size-16 mx-auto rounded-2xl bg-accent-muted flex items-center justify-center">
            <UIcon name="i-lucide-puzzle" class="size-8 text-accent" />
          </div>
          <div class="space-y-4">
            <p class="text-[13px] text-body font-sans font-medium">No plugins installed yet</p>
            <div class="px-3 py-2 rounded-lg bg-surface-base text-meta border border-border-subtle text-left overflow-hidden">
              <span class="opacity-50"># Install via CLI</span><br/>
              <span class="text-accent">claude</span> plugin add &lt;name&gt;
            </div>
          </div>
        </div>
        
        <div class="flex gap-3">
          <UButton
            label="Browse Marketplace"
            icon="i-lucide-store"
            variant="soft"
            to="/explore?tab=marketplace"
          />
          <UButton
            label="Quick Install"
            icon="i-lucide-plus"
            @click="showAddPluginModal = true"
          />
        </div>
      </div>
    </div>

    <UModal v-model:open="showAddPluginModal">
      <template #content>
        <AddPluginModal @installed="onPluginInstalled" @close="showAddPluginModal = false" />
      </template>
    </UModal>
  </div>
</template>
