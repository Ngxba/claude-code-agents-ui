// server/utils/providers/providerConfig.ts
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveClaudePath } from '../claudeDir'

export interface ProviderEntry {
  name: string
  displayName: string
  builtIn?: boolean
  baseUrl?: string
  authToken?: string
  modelMappings?: Partial<Record<'opus' | 'sonnet' | 'haiku', string>>
}

export interface ProviderConfig {
  defaultProvider: string
  providers: ProviderEntry[]
}

const BUILT_IN_PROVIDER: ProviderEntry = {
  name: 'claude',
  displayName: 'Claude (Default)',
  builtIn: true,
}

const DEFAULT_CONFIG: ProviderConfig = {
  defaultProvider: BUILT_IN_PROVIDER.name,
  providers: [BUILT_IN_PROVIDER],
}

function normalizeProviderConfig(config: ProviderConfig | null | undefined): ProviderConfig {
  const providers = Array.isArray(config?.providers) ? config.providers.filter(Boolean) : []
  const withoutClaude = providers.filter(provider => provider.name !== BUILT_IN_PROVIDER.name)
  const normalizedProviders = [BUILT_IN_PROVIDER, ...withoutClaude]
  const defaultProvider = normalizedProviders.some(provider => provider.name === config?.defaultProvider)
    ? config!.defaultProvider
    : BUILT_IN_PROVIDER.name

  return {
    defaultProvider,
    providers: normalizedProviders,
  }
}

export async function getProviderConfig(): Promise<ProviderConfig> {
  const filePath = resolveClaudePath('providers.json')
  if (!existsSync(filePath)) return structuredClone(DEFAULT_CONFIG)

  try {
    const raw = await readFile(filePath, 'utf-8')
    return normalizeProviderConfig(JSON.parse(raw) as ProviderConfig)
  }
  catch (error) {
    console.warn(`[ProviderConfig] Failed to load ${filePath}, using defaults.`, error)
    return structuredClone(DEFAULT_CONFIG)
  }
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  const filePath = resolveClaudePath('providers.json')
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(normalizeProviderConfig(config), null, 2), 'utf-8')
}
