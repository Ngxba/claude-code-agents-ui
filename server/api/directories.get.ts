import { readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { isUnderAllowedPath } from '../utils/path-security'
import { getClaudeDir } from '../utils/claudeDir'

// Directories allowed for browsing: home dir and claude config
function getBrowsableRoots(): string[] {
  return [homedir(), getClaudeDir()]
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const input = (query.path as string || '').replace(/^~/, homedir())

  // Determine which directory to list and what prefix to filter by
  let dirToList: string
  let prefix: string

  if (!input || input === '/') {
    // Default to home directory instead of filesystem root
    dirToList = homedir()
    prefix = ''
  } else if (input.endsWith('/')) {
    dirToList = resolve(input)
    prefix = ''
  } else {
    dirToList = dirname(resolve(input))
    prefix = input.slice(dirToList.length).replace(/^\//, '').toLowerCase()
  }

  // Security: restrict directory browsing to allowed roots
  if (!isUnderAllowedPath(dirToList, getBrowsableRoots())) {
    throw createError({ statusCode: 403, message: 'Access denied: path outside allowed directory' })
  }

  try {
    const entries = readdirSync(dirToList, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .filter(e => !prefix || e.name.toLowerCase().startsWith(prefix))
      .slice(0, 15)
      .map(e => {
        const full = resolve(dirToList, e.name)
        // Check if this directory has subdirectories (for showing expandability)
        let hasChildren = false
        try {
          hasChildren = readdirSync(full, { withFileTypes: true }).some(c => c.isDirectory() && !c.name.startsWith('.'))
        } catch { /* no access */ }
        return { name: e.name, path: full + '/', hasChildren }
      })

    return { directories: dirs, basePath: dirToList }
  } catch {
    return { directories: [], basePath: dirToList }
  }
})
