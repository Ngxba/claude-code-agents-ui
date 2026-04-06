import { providerRegistry } from '../../../utils/providers/registry'
import { getProviderConfig } from '../../../utils/providers/providerConfig'

export default defineEventHandler(async () => {
  const config = await getProviderConfig()
  const providers = providerRegistry.getAllInfo()
  const defaultProvider = providerRegistry.has(config.defaultProvider)
    ? config.defaultProvider
    : 'claude'

  return {
    providers,
    default: defaultProvider,
  }
})
