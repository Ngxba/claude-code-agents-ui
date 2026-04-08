import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter } from '../../../utils/frontmatter'
import { getClaudeCodeProjects } from '../../../utils/claudeCodeHistory'
import type { Agent, Skill, AgentFrontmatter, SkillFrontmatter } from '~/types'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName')
  if (!projectName) {
    throw createError({ statusCode: 400, message: 'Missing projectName' })
  }

  const projects = await getClaudeCodeProjects()
  const project = projects.find(p => p.name === projectName)

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  const projectPath = project.path
  const agents: Agent[] = []
  const skills: Skill[] = []

  // Directories to scan for agents
  const agentDirs = [
    join(projectPath, 'agents'),
    join(projectPath, '.claude', 'agents')
  ]

  for (const agentsDir of agentDirs) {
    if (existsSync(agentsDir)) {
      try {
        const files = await readdir(agentsDir)
        for (const file of files) {
          if (!file.endsWith('.md')) continue
          try {
            const slug = file.replace(/\.md$/, '')
            const filePath = join(agentsDir, file)
            
            // Avoid duplicates if same slug exists in both places
            if (agents.some(a => a.slug === slug)) continue

            const raw = await readFile(filePath, 'utf-8')
            const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(raw)
            
            agents.push({
              slug,
              filename: file,
              directory: relative(projectPath, agentsDir),
              frontmatter: { name: slug, description: '', ...frontmatter },
              body,
              hasMemory: frontmatter.memory === 'local' || frontmatter.memory === 'project',
              filePath,
            })
          } catch {
            // skip
          }
        }
      } catch {
        // skip
      }
    }
  }

  // Directories to scan for skills
  const skillDirs = [
    join(projectPath, 'skills'),
    join(projectPath, '.claude', 'skills')
  ]

  for (const skillsDir of skillDirs) {
    if (existsSync(skillsDir)) {
      try {
        const entries = await readdir(skillsDir, { withFileTypes: true })
        for (const dir of entries) {
          if (!dir.isDirectory()) continue
          const skillPath = join(skillsDir, dir.name, 'SKILL.md')
          if (!existsSync(skillPath)) continue

          try {
            const raw = await readFile(skillPath, 'utf-8')
            const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(raw)

            let slug = dir.name
            if ((slug.toLowerCase() === 'skill' || !slug) && frontmatter.name) {
              slug = frontmatter.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            }

            // Avoid duplicates
            if (skills.some(s => s.slug === slug)) continue

            skills.push({
              slug,
              frontmatter: { name: slug, description: '', ...frontmatter },
              body,
              filePath: skillPath,
              source: 'local',
            })
          } catch {
            // skip
          }
        }
      } catch {
        // skip
      }
    }
  }

  return { agents, skills, project }
})
