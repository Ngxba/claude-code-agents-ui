// server/api/v2/providers/[name].delete.ts
import { providerRegistry } from '../../../utils/providers/registry'
import { getProviderConfig, saveProviderConfig } from '../../../utils/providers/providerConfig'

const SLUG_REGEX = /^[a-z0-9-]+$/

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')

  if (!name || name === 'claude') {
    throw createError({ statusCode: 400, message: 'Cannot delete built-in provider.' })
  }

  if (!SLUG_REGEX.test(name)) {
    throw createError({ statusCode: 400, message: 'Invalid slug. Use lowercase letters, numbers, and hyphens only.' })
  }

  const config = await getProviderConfig()
  config.providers = config.providers.filter(p => p.name !== name)

  if (config.defaultProvider === name) {
    config.defaultProvider = 'claude'
    providerRegistry.setDefault('claude')
  }

  await saveProviderConfig(config)
  providerRegistry.deregister(name)

  return { ok: true }
})
