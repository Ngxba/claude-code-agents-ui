import { existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(() => {
  const possiblePaths = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]

  const results = possiblePaths.map((path) => ({
    path,
    exists: existsSync(path),
    accessible: checkAccess(path),
  }))

  const pathSearch = process.env.PATH
    ? process.env.PATH.split(':').map((dir) => {
        const claudePath = join(dir, 'claude')
        return {
          path: claudePath,
          exists: existsSync(claudePath),
          accessible: checkAccess(claudePath),
        }
      }).filter(r => r.exists)
    : []

  return {
    possiblePaths: results,
    pathSearch: pathSearch.slice(0, 5),
    claudeCliPathConfigured: !!process.env.CLAUDE_CLI_PATH,
    recommendation: results.find(r => r.accessible)?.path || pathSearch.find(r => r.accessible)?.path || null,
  }
})

function checkAccess(filePath: string): boolean {
  try {
    const fs = require('node:fs')
    fs.accessSync(filePath, fs.constants.F_OK)
    if (process.platform !== 'win32') {
      fs.accessSync(filePath, fs.constants.X_OK)
    }
    return true
  } catch {
    return false
  }
}
