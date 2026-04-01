import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveClaudePath } from '../../utils/claudeDir'
import { 
  parseGithubUrl, 
  detectAgentsLocal 
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
    
    const { agents, totalCount } = await detectAgentsLocal(tempDir, parsed.path)

    if (agents.length === 0) {
      throw createError({
        statusCode: 404,
        data: { error: 'no_agents', message: 'No valid agent files found at this location' },
      })
    }

    // Check for conflicts with existing local agents
    const agentsWithConflicts = agents.map(a => ({
      ...a,
      conflict: existsSync(resolveClaudePath('agents', a.slug + '.md')),
    }))

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: '', // Not needed for local scan
      targetPath: parsed.path || '',
      agents: agentsWithConflicts,
      totalAgents: totalCount,
      detectionMethod: 'frontmatter',
    }
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
})
