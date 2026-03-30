<script setup lang="ts">
const emit = defineEmits<{
  installed: []
  close: []
}>()

const { 
  availablePlugins, 
  loading, 
  installPlugin, 
  fetchAvailable 
} = useMarketplace()

const toast = useToast()
const searchQuery = ref('')
const manualInput = ref('')
const installingPlugin = ref<string | null>(null)
const isManualInstalling = ref(false)

onMounted(() => {
  fetchAvailable()
})

const filteredPlugins = computed(() => {
  if (!searchQuery.value) return availablePlugins.value
  const q = searchQuery.value.toLowerCase()
  return availablePlugins.value.filter(p => 
    p.name.toLowerCase().includes(q) || 
    (p.description && p.description.toLowerCase().includes(q))
  )
})

async function onInstall(marketplace: string, pluginName: string) {
  installingPlugin.value = pluginName
  try {
    await installPlugin(marketplace, pluginName)
    toast.add({ title: `${pluginName} installed`, color: 'success' })
    emit('installed')
  } catch (e: any) {
    toast.add({ 
      title: 'Installation failed', 
      description: e.data?.message || e.message, 
      color: 'error' 
    })
  } finally {
    installingPlugin.value = null
  }
}

async function onManualInstall() {
  const input = manualInput.value.trim()
  if (!input) return
  
  let marketplace = ''
  let plugin = ''
  
  if (input.includes('/')) {
    const parts = input.split('/')
    marketplace = parts[0]
    plugin = parts.slice(1).join('/')
  } else if (input.includes('@')) {
    const parts = input.split('@')
    plugin = parts[0]
    marketplace = parts[1]
  } else {
    toast.add({ 
      title: 'Invalid format', 
      description: 'Please use "marketplace/plugin" or "plugin@marketplace"', 
      color: 'error' 
    })
    return
  }

  isManualInstalling.value = true
  try {
    await installPlugin(marketplace, plugin)
    toast.add({ title: `${plugin} installed`, color: 'success' })
    manualInput.value = ''
    emit('installed')
  } catch (e: any) {
    toast.add({ 
      title: 'Installation failed', 
      description: e.data?.message || e.message, 
      color: 'error' 
    })
  } finally {
    isManualInstalling.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6 bg-overlay max-h-[90vh] flex flex-col">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-page-title">Add Plugin</h3>
        <p class="text-[12px] text-label mt-1">
          Install extensions from your registered marketplaces.
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="emit('close')"
      />
    </div>

    <!-- Manual Install Section -->
    <div class="p-4 rounded-xl bg-surface-base border border-border-subtle space-y-3">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-terminal" class="size-4 text-accent" />
        <span class="text-[13px] font-medium">Quick Install</span>
      </div>
      <div class="flex gap-2">
        <input
          v-model="manualInput"
          placeholder="e.g. marketplace/plugin or plugin@marketplace"
          class="field-input text-[13px] flex-1"
          @keydown.enter="onManualInstall"
        />
        <UButton
          label="Install"
          icon="i-lucide-plus"
          size="sm"
          :loading="isManualInstalling"
          :disabled="!manualInput.trim()"
          @click="onManualInstall"
        />
      </div>
      <p class="text-[11px] text-meta">
        Type the plugin's full identifier to install it directly.
      </p>
    </div>

    <div class="space-y-4 flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between">
        <h4 class="text-[12px] font-mono uppercase tracking-wider text-meta">Browse Marketplaces</h4>
        <div class="relative w-48">
          <input
            v-model="searchQuery"
            placeholder="Search..."
            class="field-search text-[12px] h-8"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto min-h-0 space-y-2 pr-2 custom-scrollbar">
        <div v-if="loading && !availablePlugins.length" class="space-y-2">
          <SkeletonRow v-for="i in 4" :key="i" />
        </div>

        <template v-else-if="filteredPlugins.length">
          <div
            v-for="plugin in filteredPlugins"
            :key="plugin.name"
            class="p-4 rounded-xl bg-card border border-border-subtle group hover:border-accent/30 transition-all flex items-start gap-4 shadow-sm"
          >
            <div class="size-10 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-puzzle" class="size-5 text-accent" />
            </div>
            
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-[14px] font-medium truncate">{{ plugin.name }}</span>
                <span class="text-[10px] px-1.5 py-px rounded-full bg-surface-base text-meta font-mono border border-border-subtle">
                  {{ plugin.marketplace }}
                </span>
              </div>
              <p class="text-[12px] text-label leading-normal line-clamp-2">
                {{ plugin.description || 'No description available.' }}
              </p>
              <div class="flex items-center gap-3 pt-1">
                <span v-if="plugin.skillCount" class="font-mono text-[10px] text-meta">
                  {{ plugin.skillCount }} skill{{ plugin.skillCount === 1 ? '' : 's' }}
                </span>
                <span v-if="plugin.commandCount" class="font-mono text-[10px] text-meta">
                  {{ plugin.commandCount }} cmd{{ plugin.commandCount === 1 ? '' : 's' }}
                </span>
              </div>
            </div>

            <UButton
              label="Install"
              size="sm"
              variant="soft"
              :loading="installingPlugin === plugin.name"
              :disabled="installingPlugin !== null || isManualInstalling"
              @click="onInstall(plugin.marketplace, plugin.name)"
            />
          </div>
        </template>

        <div v-else-if="searchQuery" class="py-12 text-center border border-dashed border-border-subtle rounded-xl">
          <p class="text-[13px] text-meta">No plugins match "{{ searchQuery }}"</p>
        </div>
        
        <div v-else class="py-12 text-center space-y-3 border border-dashed border-border-subtle rounded-xl">
          <UIcon name="i-lucide-package-open" class="size-8 mx-auto text-meta opacity-20" />
          <p class="text-[13px] text-meta">No available plugins found in your marketplaces.</p>
          <UButton 
            label="Manage Marketplaces" 
            to="/explore?tab=marketplace" 
            variant="link" 
            size="xs" 
            @click="emit('close')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
}
</style>
