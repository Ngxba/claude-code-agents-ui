// server/api/v2/providers/config.put.ts
import { providerRegistry } from '../../../utils/providers/registry'
import { getProviderConfig, saveProviderConfig } from '../../../utils/providers/providerConfig'
import { CustomAnthropicProvider, customProviderInfo } from '../../../utils/providers/customProvider'
import type { ProviderEntry } from '../../../utils/providers/providerConfig'

const SLUG_REGEX = /^[a-z0-9-]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<{ entry?: ProviderEntry; defaultProvider?: string }>(event)

  const config = await getProviderConfig()

  if (body.entry) {
    const entry = { ...body.entry }

    if (!entry.name || !SLUG_REGEX.test(entry.name)) {
      throw createError({ statusCode: 400, message: 'Invalid slug. Use lowercase letters, numbers, and hyphens only.' })
    }
    if (entry.name === 'claude') {
      throw createError({ statusCode: 400, message: 'Cannot override built-in provider.' })
    }

    const idx = config.providers.findIndex(p => p.name === entry.name)
    const existing = idx >= 0 ? config.providers[idx] : undefined

    if (entry.authToken === '__unchanged__') {
      if (!existing?.authToken) {
        throw createError({ statusCode: 400, message: 'authToken required when creating new provider.' })
      }
      entry.authToken = existing.authToken
    }

    if (idx >= 0) {
      config.providers[idx] = entry
    }
    else {
      config.providers.push(entry)
    }

    if (entry.baseUrl && entry.authToken) {
      providerRegistry.register(new CustomAnthropicProvider(entry), customProviderInfo(entry))
    }
    else {
      providerRegistry.deregister(entry.name)
      if (config.defaultProvider === entry.name) {
        config.defaultProvider = 'claude'
        providerRegistry.setDefault('claude')
      }
    }
  }

  if (body.defaultProvider) {
    const providerExists = config.providers.some(provider => provider.name === body.defaultProvider)
      || providerRegistry.has(body.defaultProvider)

    if (!providerExists) {
      throw createError({ statusCode: 400, message: `Provider '${body.defaultProvider}' not found.` })
    }

    config.defaultProvider = body.defaultProvider
    if (providerRegistry.has(body.defaultProvider)) {
      providerRegistry.setDefault(body.defaultProvider)
    }
  }

  await saveProviderConfig(config)
  return { ok: true }
})
