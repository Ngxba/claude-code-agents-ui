// server/plugins/providers.ts
import { providerRegistry } from '../utils/providers/registry'
import { getProviderConfig } from '../utils/providers/providerConfig'
import { CustomAnthropicProvider, customProviderInfo } from '../utils/providers/customProvider'

export default defineNitroPlugin(async () => {
  try {
    const config = await getProviderConfig()

    for (const entry of config.providers) {
      if (!entry.builtIn && entry.baseUrl && entry.authToken) {
        providerRegistry.register(new CustomAnthropicProvider(entry), customProviderInfo(entry))
        console.log('[providers] Registered provider:', entry.name, '-', entry.displayName)
      }
    }

    if (providerRegistry.has(config.defaultProvider)) {
      providerRegistry.setDefault(config.defaultProvider)
    }
  }
  catch (err) {
    console.error('[providers] Failed to load providers.json:', err)
  }
})
