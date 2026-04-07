import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { isUnderAllowedPath, getAllowedPaths } from '../utils/path-security'

const execFileAsync = promisify(execFile)

export default defineEventHandler(async (event) => {
  const { path: rawPath } = await readBody<{ path: string }>(event)

  if (!rawPath) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  // Resolve to absolute path
  const resolvedPath = resolve(rawPath)

  // If it's a file, open the containing directory
  const targetPath = existsSync(resolvedPath) ? dirname(resolvedPath) : resolvedPath

  if (!existsSync(targetPath)) {
    throw createError({ statusCode: 404, message: 'Path not found' })
  }

  // Security: restrict to allowed directories
  if (!isUnderAllowedPath(targetPath, getAllowedPaths())) {
    throw createError({ statusCode: 403, message: 'Access denied: path outside allowed directory' })
  }

  // Use execFile (no shell) to prevent command injection
  const platform = process.platform
  let command: string
  if (platform === 'darwin') {
    command = 'open'
  } else if (platform === 'win32') {
    command = 'explorer'
  } else {
    command = 'xdg-open'
  }

  try {
    await execFileAsync(command, [targetPath])
    return { success: true }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: 'Failed to open directory' })
  }
})
