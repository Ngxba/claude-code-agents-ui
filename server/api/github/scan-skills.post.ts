import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveClaudePath } from '../../utils/claudeDir'
import { 
  parseGithubUrl, 
  detectSkillsLocal 
} from '../../utils/github'
import { gitClone } from '../../utils/gitOps'

export default defineEventHandler(async (event) => {
  const { url } = await readBody<{ url: string }>(event)

  if (!url || typeof url !== 'string') {
    throw createError({
      statusCode: 400,
      data: { error: 'invalid_url', message: 'A GitHub URL is required' },
    })
  }

  const parsed = parseGithubUrl(url.trim())
  if (!parsed) {
    throw createError({
      statusCode: 400,
      data: { error: 'invalid_url', message: 'Could not parse GitHub URL. Expected format: https://github.com/owner/repo' },
    })
  }

  // Create temporary directory for cloning
  const tempDir = await mkdtemp(join(tmpdir(), 'claude-import-'))
  const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`

  try {
    await gitClone(repoUrl, tempDir, true)
    
    const { skills, totalCount, detectionMethod } = await detectSkillsLocal(tempDir, parsed.path)

    if (skills.length === 0) {
      throw createError({
        statusCode: 404,
        data: { error: 'no_skills', message: 'No valid skill files found at this location' },
      })
    }

    // Check for conflicts with existing local skills
    const skillsWithConflicts = skills.map(s => ({
      ...s,
      conflict: existsSync(resolveClaudePath('skills', s.slug, 'SKILL.md')),
    }))

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: '', // Not needed for local scan
      targetPath: parsed.path || '',
      skills: skillsWithConflicts,
      totalSkills: totalCount,
      detectionMethod,
    }
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
})
