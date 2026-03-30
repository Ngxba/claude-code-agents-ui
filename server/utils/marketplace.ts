import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from './claudeDir'

interface KnownMarketplace {
  source: { source: string; url?: string; repo?: string; path?: string }
  installLocation: string
  lastUpdated: string
  autoUpdate?: boolean
}

interface PluginJson {
  name: string
  description?: string
  author?: { name: string; email?: string }
}

interface ScannedPlugin {
  name: string
  description: string
  author?: { name: string; email?: string }
  skillCount: number
  commandCount: number
}

export async function readKnownMarketplaces(): Promise<Record<string, KnownMarketplace>> {
  const path = resolveClaudePath('plugins', 'known_marketplaces.json')
  if (!existsSync(path)) return {}
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as Record<string, KnownMarketplace>
  } catch {
    return {}
  }
}

export async function scanMarketplacePlugins(installLocation: string): Promise<ScannedPlugin[]> {
  const plugins: ScannedPlugin[] = []

  // Method 1: Centralized marketplace.json (Modern format)
  const marketplaceJsonPath = join(installLocation, '.claude-plugin', 'marketplace.json')
  if (existsSync(marketplaceJsonPath)) {
    try {
      const raw = await readFile(marketplaceJsonPath, 'utf-8')
      const data = JSON.parse(raw) as { plugins: PluginJson[] }
      if (Array.isArray(data.plugins)) {
        for (const p of data.plugins) {
          plugins.push({
            name: p.name,
            description: p.description || '',
            author: p.author,
            skillCount: 0, // Metadata only marketplaces don't know skill counts without cloning
            commandCount: 0,
          })
        }
      }
    } catch (e) {
      console.error(`[Marketplace] Failed to parse ${marketplaceJsonPath}:`, e)
    }
  }

  // Method 2: Local plugins/ directory (Legacy/Mono-repo format)
  // We combine both to ensure we don't miss anything
  const pluginsDir = join(installLocation, 'plugins')
  if (existsSync(pluginsDir)) {
    try {
      const entries = await readdir(pluginsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const pluginDir = join(pluginsDir, entry.name)
        const pluginJsonPath = join(pluginDir, '.claude-plugin', 'plugin.json')

        if (!existsSync(pluginJsonPath)) continue

        try {
          const raw = await readFile(pluginJsonPath, 'utf-8')
          const pluginJson = JSON.parse(raw) as PluginJson

          // Only add if not already added by centralized json (prefer local metadata if both exist)
          const existingIdx = plugins.findIndex(p => p.name === (pluginJson.name || entry.name))
          
          // Count skills
          let skillCount = 0
          const skillsDir = join(pluginDir, 'skills')
          if (existsSync(skillsDir)) {
            const skillEntries = await readdir(skillsDir, { withFileTypes: true })
            skillCount = skillEntries.filter(e => e.isDirectory()).length
          }

          // Count commands
          let commandCount = 0
          const commandsDir = join(pluginDir, 'commands')
          if (existsSync(commandsDir)) {
            const cmdEntries = await readdir(commandsDir, { withFileTypes: true })
            commandCount = cmdEntries.filter(e => e.isDirectory()).length
          }

          const scanned: ScannedPlugin = {
            name: pluginJson.name || entry.name,
            description: pluginJson.description || '',
            author: pluginJson.author,
            skillCount,
            commandCount,
          }

          if (existingIdx >= 0) {
            plugins[existingIdx] = scanned
          } else {
            plugins.push(scanned)
          }
        } catch {
          // Skip malformed plugins
        }
      }
    } catch (e) {
      console.error(`[Marketplace] Failed to read ${pluginsDir}:`, e)
    }
  }

  return plugins
}

export async function getInstalledPluginNames(): Promise<Set<string>> {
  const path = resolveClaudePath('plugins', 'installed_plugins.json')
  if (!existsSync(path)) return new Set()
  try {
    const raw = await readFile(path, 'utf-8')
    const data = JSON.parse(raw) as { plugins: Record<string, unknown[]> }
    const names = new Set<string>()
    for (const id of Object.keys(data.plugins || {})) {
      const [name] = id.split('@')
      names.add(name)
    }
    return names
  } catch {
    return new Set()
  }
}

export function getMarketplaceSourceInfo(marketplace: KnownMarketplace): { sourceType: string; sourceUrl: string } {
  const src = marketplace.source
  if (src.source === 'github') return { sourceType: 'github', sourceUrl: src.repo || '' }
  if (src.source === 'git') return { sourceType: 'git', sourceUrl: src.url || '' }
  if (src.source === 'directory') return { sourceType: 'directory', sourceUrl: src.path || '' }
  return { sourceType: src.source, sourceUrl: '' }
}

/**
 * Robustly resolve a plugin's installation path, handling absolute host paths
 * and providing fallbacks for common cache patterns.
 */
export function resolvePluginInstallPath(pluginId: string, registeredPath: string): string {
  // 1. Handle absolute host paths (e.g. from different environments)
  let resolved = registeredPath
  if (resolved.includes('.claude')) {
    const parts = resolved.split('.claude')
    const relativePart = parts[parts.length - 1]
    resolved = resolveClaudePath(relativePart.startsWith('/') ? relativePart.substring(1) : relativePart)
  }

  // 2. If it exists, we're good
  if (existsSync(resolved)) {
    return resolved
  }

  // 3. Fallback: try common pattern ~/.claude/plugins/cache/{name}
  const [pluginName] = pluginId.split('@')
  const fallbackPath = resolveClaudePath('plugins', 'cache', pluginName)
  if (existsSync(fallbackPath)) {
    return fallbackPath
  }

  // Return original (possibly rebased) path if no better option found
  return resolved
}
