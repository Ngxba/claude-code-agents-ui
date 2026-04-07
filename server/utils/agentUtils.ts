import { resolveClaudePath } from './claudeDir'
import { safeClaudePath } from './path-security'

/**
 * Decode an agent slug into its directory and base name.
 *
 * 'code-reviewer'              → { directory: '',            name: 'code-reviewer' }
 * 'engineering--code-reviewer' → { directory: 'engineering', name: 'code-reviewer' }
 *
 * Rule: split on the LAST occurrence of '--'. Agent names and directory names
 * may contain single '-' but not '--'.
 */
export function decodeAgentSlug(slug: string): { directory: string; name: string } {
  // Reject path traversal in slug segments
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw createError({ statusCode: 400, message: 'Invalid slug: contains path traversal characters' })
  }

  const idx = slug.lastIndexOf('--')
  if (idx === -1) return { directory: '', name: slug }
  return {
    directory: slug.slice(0, idx).replace(/--/g, '/'),
    name: slug.slice(idx + 2),
  }
}

/**
 * Encode a directory + agent name into a slug.
 *
 * ('', 'code-reviewer')            → 'code-reviewer'
 * ('engineering', 'code-reviewer') → 'engineering--code-reviewer'
 */
export function encodeAgentSlug(directory: string, name: string): string {
  if (!directory) return name
  return `${directory.replace(/\//g, '--')}--${name}`
}

/**
 * Resolve the absolute file path for an agent given its slug.
 * Uses safeClaudePath to prevent path traversal.
 */
export function resolveAgentFilePath(slug: string): string {
  const { directory, name } = decodeAgentSlug(slug)
  if (directory) {
    return safeClaudePath('agents', ...directory.split('/'), `${name}.md`)
  }
  return safeClaudePath('agents', `${name}.md`)
}
