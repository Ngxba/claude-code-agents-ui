// app/composables/useProviderConfig.ts
import type { ProviderConfig, ProviderEntry } from '~/types'

export function useProviderConfig() {
  const config = useState<ProviderConfig | null>('providerConfig', () => null)
  const selectedProvider = useState<string>('selectedProvider', () => 'claude')
  const loading = useState('providerConfigLoading', () => false)

  async function load() {
    loading.value = true
    try {
      const data = await $fetch<ProviderConfig>('/api/v2/providers/config')
      config.value = data
      selectedProvider.value = data.defaultProvider
    }
    finally {
      loading.value = false
    }
  }

  /** Save (create or update) a provider entry. entry.name is the slug. */
  async function saveProvider(entry: ProviderEntry) {
    loading.value = true
    try {
      await $fetch('/api/v2/providers/config', {
        method: 'PUT',
        body: { entry },
      })
      await load()
    }
    finally {
      loading.value = false
    }
  }

  /** Delete a custom provider by slug. */
  async function removeProvider(name: string) {
    loading.value = true
    try {
      await $fetch(`/api/v2/providers/${name}`, { method: 'DELETE' })
      await load()
    }
    finally {
      loading.value = false
    }
  }

  /** Switch the active provider and persist as default. */
  async function switchProvider(providerName: string) {
    const previousProvider = selectedProvider.value
    const previousDefaultProvider = config.value?.defaultProvider

    selectedProvider.value = providerName

    try {
      await $fetch('/api/v2/providers/config', {
        method: 'PUT',
        body: { defaultProvider: providerName },
      })

      if (config.value) {
        config.value.defaultProvider = providerName
      }
    }
    catch (error) {
      selectedProvider.value = previousProvider
      if (config.value && previousDefaultProvider) {
        config.value.defaultProvider = previousDefaultProvider
      }
      throw error
    }
  }

  const customProviders = computed(
    () => config.value?.providers.filter(p => !p.builtIn) ?? [],
  )

  const hasCustomProvider = computed(() => customProviders.value.length > 0)

  const providers = computed(() => config.value?.providers ?? [])

  return {
    config,
    selectedProvider,
    loading,
    load,
    saveProvider,
    removeProvider,
    switchProvider,
    customProviders,
    hasCustomProvider,
    providers,
  }
}
