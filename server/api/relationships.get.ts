import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolveClaudePath } from '../utils/claudeDir'
import { parseFrontmatter } from '../utils/frontmatter'
import { extractRelationships } from '../utils/relationships'

async function loadAgents() {
  const dir = resolveClaudePath('agents')
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter(f => f.endsWith('.md'))
  return Promise.all(files.map(async (f) => {
    const raw = await readFile(join(dir, f), 'utf-8')
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw)
    return { slug: f.replace(/\.md$/, ''), body, frontmatter }
  }))
}

async function loadCommands(dir: string, relDir: string): Promise<{ slug: string; body: string; frontmatter: Record<string, unknown> }[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const results: { slug: string; body: string; frontmatter: Record<string, unknown> }[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await loadCommands(fullPath, relDir ? `${relDir}/${entry.name}` : entry.name))
    } else if (entry.name.endsWith('.md')) {
      const raw = await readFile(fullPath, 'utf-8')
      const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw)
      const baseName = entry.name.replace(/\.md$/, '')
      const slug = relDir ? `${relDir.replace(/\//g, '--')}--${baseName}` : baseName
      results.push({ slug, body, frontmatter })
    }
  }
  return results
}

async function loadSkills() {
  const dir = resolveClaudePath('skills')
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const skillDirs = entries.filter(e => e.isDirectory())
  const skills = await Promise.all(skillDirs.map(async (d) => {
    const skillPath = join(dir, d.name, 'SKILL.md')
    if (!existsSync(skillPath)) return null
    const raw = await readFile(skillPath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(raw)
    return { slug: d.name, body, frontmatter: { name: d.name, ...frontmatter } }
  }))
  return skills.filter(Boolean) as { slug: string; body: string; frontmatter: Record<string, unknown> }[]
}

interface PluginEntry {
  id: string
  name: string
  skills: string[]
}

async function loadPlugins(): Promise<PluginEntry[]> {
  const installedPath = resolveClaudePath('plugins', 'installed_plugins.json')
  if (!existsSync(installedPath)) return []
  try {
    const raw = await readFile(installedPath, 'utf-8')
    const installed = JSON.parse(raw) as { plugins: Record<string, { installPath: string }[]> }
    if (!installed?.plugins) return []

    return Promise.all(
      Object.entries(installed.plugins).map(async ([id, entries]) => {
        const entry = entries[0]
        if (!entry) return null
        const [name] = id.split('@')
        const skillsDir = join(entry.installPath, 'skills')
        let skills: string[] = []
        if (existsSync(skillsDir)) {
          const skillEntries = await readdir(skillsDir, { withFileTypes: true })
          skills = skillEntries.filter(e => e.isDirectory()).map(e => e.name)
        }
        return { id, name, skills }
      })
    ).then(r => r.filter(Boolean) as PluginEntry[])
  } catch {
    return []
  }
}
async function loadMcpServers(workingDir?: string) {
  const servers: { name: string; command?: string; url?: string; scope: string }[] = []

  // Read global servers
  const globalPath = join(homedir(), '.claude.json')
  if (existsSync(globalPath)) {
    try {
      const raw = await readFile(globalPath, 'utf-8')
      const data = JSON.parse(raw)
      if (data.mcpServers) {
        for (const [name, config] of Object.entries(data.mcpServers)) {
          servers.push({ name, ...(config as any), scope: 'global' })
        }
      }
    } catch {}
  }

  // Read project servers
  if (workingDir && typeof workingDir === 'string') {
    const projectPath = join(workingDir, '.mcp.json')
    if (existsSync(projectPath)) {
      try {
        const raw = await readFile(projectPath, 'utf-8')
        const data = JSON.parse(raw)
        if (data.mcpServers) {
          for (const [name, config] of Object.entries(data.mcpServers)) {
            servers.push({ name, ...(config as any), scope: 'project' })
          }
        }
      } catch {}
    }
  }

  return servers
}

async function loadGithubSkillSlugs(): Promise<string[]> {
  const path = resolveClaudePath('github', 'imports.json')
  if (!existsSync(path)) return []
  try {
    const raw = await readFile(path, 'utf-8')
    const registry = JSON.parse(raw) as { imports: { selectedSkills: string[] }[] }
    return registry.imports.flatMap(i => i.selectedSkills)
  } catch {
    return []
  }
}

export default defineEventHandler(async (event) => {
  const { workingDir } = getQuery(event) as { workingDir?: string }
  const [agents, commands, skills, plugins, mcpServers, githubSkillSlugs] = await Promise.all([
    loadAgents(),
    loadCommands(resolveClaudePath('commands'), ''),
    loadSkills(),
    loadPlugins(),
    loadMcpServers(workingDir),
    loadGithubSkillSlugs(),
  ])
  return extractRelationships(agents, commands, skills, plugins, mcpServers, githubSkillSlugs)
})
