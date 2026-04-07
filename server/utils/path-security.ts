import { resolve, join, normalize } from 'node:path'
import { homedir } from 'node:os'
import { getClaudeDir } from './claudeDir'

/**
 * Resolve a path and verify it stays within the allowed base directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 * Throws if the resolved path escapes the base.
 */
export function safePath(base: string, ...segments: string[]): string {
  const resolvedBase = resolve(base)
  const resolvedFull = resolve(resolvedBase, ...segments)

  if (!resolvedFull.startsWith(resolvedBase + '/') && resolvedFull !== resolvedBase) {
    throw createError({
      statusCode: 403,
      message: 'Access denied: path outside allowed directory',
    })
  }

  return resolvedFull
}

/**
 * Resolve a path within the Claude config directory (~/.claude).
 * Throws if the result escapes the Claude dir.
 */
export function safeClaudePath(...segments: string[]): string {
  return safePath(getClaudeDir(), ...segments)
}

/**
 * Validate that a slug is safe for use in file paths.
 * Allows: lowercase letters, digits, single hyphens, and '--' for directory separators.
 * Rejects: '..', '/', '\', or any other path-sensitive characters.
 */
export function validateSlug(slug: string): void {
  if (!slug || typeof slug !== 'string') {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  // Reject path traversal patterns
  if (slug.includes('..') && !slug.includes('--')) {
    throw createError({ statusCode: 400, message: 'Invalid slug: contains path traversal' })
  }

  // Only allow safe characters: alphanumeric, hyphens, underscores
  // '--' is allowed as directory separator (decoded by agentUtils)
  if (!/^[a-zA-Z0-9][-a-zA-Z0-9_]*$/.test(slug)) {
    throw createError({ statusCode: 400, message: 'Invalid slug: contains unsafe characters' })
  }
}

/**
 * Check if a resolved path is under one of the allowed base directories.
 * Used for endpoints that accept absolute paths (e.g., files.get, directories.get).
 */
export function isUnderAllowedPath(targetPath: string, allowedBases: string[]): boolean {
  const resolved = resolve(targetPath)
  return allowedBases.some((base) => {
    const resolvedBase = resolve(base)
    return resolved === resolvedBase || resolved.startsWith(resolvedBase + '/')
  })
}

/**
 * Get the list of allowed base directories for file access.
 * Includes ~/.claude and optionally a project directory.
 */
export function getAllowedPaths(projectDir?: string): string[] {
  const allowed = [getClaudeDir()]

  if (projectDir) {
    allowed.push(resolve(projectDir))
  }

  return allowed
}
