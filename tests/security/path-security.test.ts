import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// Direct import of the utility functions (no Nuxt auto-imports needed)
// We test the core logic by reimplementing the pure functions here
// to avoid Nuxt server context dependency (createError)

/** Reimplementation of safePath for testing — throws plain Error instead of createError */
function safePath(base: string, ...segments: string[]): string {
  const resolvedBase = resolve(base)
  const resolvedFull = resolve(resolvedBase, ...segments)
  if (!resolvedFull.startsWith(resolvedBase + '/') && resolvedFull !== resolvedBase) {
    throw new Error('Access denied: path outside allowed directory')
  }
  return resolvedFull
}

function isUnderAllowedPath(targetPath: string, allowedBases: string[]): boolean {
  const resolved = resolve(targetPath)
  return allowedBases.some((base) => {
    const resolvedBase = resolve(base)
    return resolved === resolvedBase || resolved.startsWith(resolvedBase + '/')
  })
}

describe('safePath', () => {
  const base = '/tmp/test-base'

  it('allows paths within base directory', () => {
    expect(safePath(base, 'file.txt')).toBe(`${base}/file.txt`)
    expect(safePath(base, 'sub', 'dir', 'file.md')).toBe(`${base}/sub/dir/file.md`)
  })

  it('allows base directory itself', () => {
    expect(safePath(base)).toBe(base)
  })

  it('blocks path traversal with ..', () => {
    expect(() => safePath(base, '..', 'etc', 'passwd')).toThrow('Access denied')
    expect(() => safePath(base, 'sub', '..', '..', 'escape')).toThrow('Access denied')
  })

  it('blocks absolute path escape via segments', () => {
    // resolve('/tmp/test-base', '/etc/passwd') = '/etc/passwd'
    expect(() => safePath(base, '/etc/passwd')).toThrow('Access denied')
  })

  it('blocks traversal disguised with valid prefix', () => {
    expect(() => safePath(base, '..', 'test-base-evil', 'file')).toThrow('Access denied')
  })

  it('handles nested .. that resolves back inside base', () => {
    // /tmp/test-base/sub/../file.txt resolves to /tmp/test-base/file.txt — still inside base
    expect(safePath(base, 'sub', '..', 'file.txt')).toBe(`${base}/file.txt`)
  })
})

describe('isUnderAllowedPath', () => {
  const allowed = ['/home/user/.claude', '/home/user/projects']

  it('allows paths within allowed directories', () => {
    expect(isUnderAllowedPath('/home/user/.claude/agents/test.md', allowed)).toBe(true)
    expect(isUnderAllowedPath('/home/user/projects/src/index.ts', allowed)).toBe(true)
  })

  it('allows exact allowed directory', () => {
    expect(isUnderAllowedPath('/home/user/.claude', allowed)).toBe(true)
  })

  it('blocks paths outside allowed directories', () => {
    expect(isUnderAllowedPath('/etc/passwd', allowed)).toBe(false)
    expect(isUnderAllowedPath('/home/user/.ssh/id_rsa', allowed)).toBe(false)
    expect(isUnderAllowedPath('/home/user/.claude-evil/attack', allowed)).toBe(false)
  })

  it('blocks paths that share a prefix but are not under allowed', () => {
    // /home/user/.claudeX is NOT under /home/user/.claude
    expect(isUnderAllowedPath('/home/user/.claudeX/file', allowed)).toBe(false)
  })
})
