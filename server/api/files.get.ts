import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute, resolve } from 'node:path'
import { getClaudeDir } from '../utils/claudeDir'
import { isUnderAllowedPath, getAllowedPaths } from '../utils/path-security'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const path = query.path as string
  const projectDir = query.projectDir as string

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  const claudeDir = getClaudeDir()
  let fullPath: string

  if (!isAbsolute(path)) {
    const baseDir = projectDir && existsSync(projectDir) ? projectDir : claudeDir
    fullPath = resolve(join(baseDir, path))
  } else {
    fullPath = resolve(path)
  }

  // Security: restrict file access to allowed directories
  if (!isUnderAllowedPath(fullPath, getAllowedPaths(projectDir))) {
    throw createError({ statusCode: 403, message: 'Access denied: path outside allowed directory' })
  }

  if (!existsSync(fullPath)) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  try {
    const content = await readFile(fullPath, 'utf-8')
    return { content, path: fullPath }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: 'Failed to read file' })
  }
})
