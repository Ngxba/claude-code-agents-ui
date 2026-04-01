import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { resolveClaudePath } from './claudeDir'
import { parseFrontmatter } from './frontmatter'
import type { SkillFrontmatter, GithubImport, GithubImportsRegistry } from '~/types'

interface ParsedGithubUrl {
  owner: string
  repo: string
  branch: string | null
  path: string | null
}

const SKIP_FILENAMES = new Set([
  'README.md', 'readme.md',
  'CHANGELOG.md', 'changelog.md',
  'CONTRIBUTING.md', 'contributing.md',
  'LICENSE.md', 'license.md',
  'CODE_OF_CONDUCT.md',
])

export function parseGithubUrl(url: string): ParsedGithubUrl | null {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(tree|blob)\/([^/]+)(?:\/(.+))?)?$/
  )
  if (!match) return null

  return {
    owner: match[1]!,
    repo: match[2]!,
    branch: match[4] || null,
    path: match[5] || null,
  }
}

interface SkillsIndexEntry {
  slug: string
  name: string
  description: string
  category?: string
  tags?: string | string[]
  path: string
  files: string[]
  metadata?: Record<string, unknown>
}

interface SkillsIndex {
  version: string
  skills: SkillsIndexEntry[]
}

interface DetectedSkill {
  slug: string
  name: string
  description: string
  category: string | null
  tags: string[]
  filePath: string
  hasSupporting: boolean
}

interface DetectedAgent {
  slug: string
  name: string
  description: string
  filePath: string
}

// ── Local scanning helpers (for cloned repos) ──────────────────────────

async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = []
  const items = await readdir(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name === '.git' || item.name === 'node_modules') continue
      files.push(...(await walkDir(fullPath)))
    } else if (item.isFile() && item.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

export async function detectSkillsLocal(
  baseDir: string,
  targetPath: string | null
): Promise<{ skills: DetectedSkill[]; totalCount: number; detectionMethod: 'frontmatter' | 'skills-index' }> {
  const scanRoot = targetPath ? join(baseDir, targetPath) : baseDir
  const skills: DetectedSkill[] = []
  let detectionMethod: 'frontmatter' | 'skills-index' = 'frontmatter'

  // 1. Check for skills-index.json
  const indexPath = join(baseDir, 'skills-index.json')
  if (existsSync(indexPath)) {
    try {
      const content = await readFile(indexPath, 'utf-8')
      const index = JSON.parse(content) as SkillsIndex
      let list = index.skills.map(s => ({
        slug: s.slug,
        name: s.name || s.slug,
        description: typeof s.description === 'string' ? s.description.replace(/^>\s*/, '') : '',
        category: s.category || null,
        tags: Array.isArray(s.tags) ? s.tags : (typeof s.tags === 'string' ? [s.tags] : []),
        filePath: s.files?.[0] || s.path,
        hasSupporting: (s.files?.length || 0) > 1,
      }))

      if (targetPath) {
        list = list.filter(s => s.filePath.startsWith(targetPath))
      }
      return { skills: list, totalCount: list.length, detectionMethod: 'skills-index' }
    } catch { }
  }

  // 2. Scan for SKILL.md files
  const allMdFiles = await walkDir(scanRoot)
  const skillFiles = allMdFiles.filter(f => f.toLowerCase().endsWith('skill.md'))

  for (const file of skillFiles) {
    try {
      const content = await readFile(file, 'utf-8')
      const { frontmatter } = parseFrontmatter<any>(content)

      if (frontmatter.name && frontmatter.description) {
        const relPath = relative(baseDir, file)
        const parts = relPath.split('/')
        const parentDir = parts.at(-2)
        const slug = parentDir || frontmatter.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

        const dir = dirname(file)
        const items = await readdir(dir)
        const hasSupporting = items.length > 1

        const category = parts.length > 2 ? parts[parts.length - 3] || null : null

        skills.push({
          slug,
          name: frontmatter.name,
          description: frontmatter.description,
          category,
          tags: [],
          filePath: relPath,
          hasSupporting,
        })
      }
    } catch { }
  }

  return { skills, totalCount: skills.length, detectionMethod: 'frontmatter' }
}

export async function detectAgentsLocal(
  baseDir: string,
  targetPath: string | null
): Promise<{ agents: DetectedAgent[]; totalCount: number }> {
  const scanRoot = targetPath ? join(baseDir, targetPath) : baseDir
  const agents: DetectedAgent[] = []
  
  const allMdFiles = await walkDir(scanRoot)
  const agentFiles = allMdFiles.filter(f => !f.toLowerCase().endsWith('skill.md'))

  for (const file of agentFiles) {
    const fileName = file.split('/').pop()!
    if (SKIP_FILENAMES.has(fileName)) continue

    try {
      const content = await readFile(file, 'utf-8')
      const { frontmatter } = parseFrontmatter<any>(content)

      if (frontmatter.name && frontmatter.description) {
        const relPath = relative(baseDir, file)
        const parts = relPath.split('/')
        let slug = fileName.replace(/\.md$/, '')
        
        if (slug.toLowerCase() === 'agent' && parts.length > 1) {
          slug = parts[parts.length - 2]!
        }

        agents.push({
          slug,
          name: frontmatter.name,
          description: frontmatter.description,
          filePath: relPath,
        })
      }
    } catch { }
  }

  return { agents, totalCount: agents.length }
}

// ── Registry helpers ──────────────────────────────────

export function getRegistryPath(type: 'skills' | 'agents'): string {
  return resolveClaudePath('github', `${type}-imports.json`)
}

export async function readImportsRegistry(type: 'skills' | 'agents'): Promise<GithubImportsRegistry> {
  const path = getRegistryPath(type)
  if (!existsSync(path)) return { imports: [] }
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as GithubImportsRegistry
  } catch {
    return { imports: [] }
  }
}

export async function writeImportsRegistry(type: 'skills' | 'agents', registry: GithubImportsRegistry): Promise<void> {
  const path = getRegistryPath(type)
  const dir = dirname(path)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(path, JSON.stringify(registry, null, 2), 'utf-8')
}

export function findImport(registry: GithubImportsRegistry, owner: string, repo: string): GithubImport | undefined {
  return registry.imports.find(i => i.owner === owner && i.repo === repo)
}
