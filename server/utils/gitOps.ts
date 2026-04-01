import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'

const exec = promisify(execFile)

async function hasGit(): Promise<boolean> {
  try {
    await exec('git', ['--version'])
    return true
  } catch {
    return false
  }
}

export async function ensureGit(): Promise<void> {
  if (!(await hasGit())) {
    throw createError({
      statusCode: 500,
      data: { error: 'git_not_found', message: 'Git is required for GitHub imports. Install it from git-scm.com' },
    })
  }
}

export async function gitClone(repoUrl: string, destPath: string, allowExisting = false): Promise<void> {
  await ensureGit()
  if (existsSync(destPath) && !allowExisting) {
    throw createError({
      statusCode: 409,
      data: { error: 'already_exists', message: 'This repository is already imported' },
    })
  }
  try {
    await exec('git', ['clone', '--depth', '1', repoUrl, destPath], { timeout: 120_000 })
  } catch (e: any) {
    if (existsSync(destPath)) {
      await rm(destPath, { recursive: true, force: true })
    }
    throw createError({
      statusCode: 500,
      data: { error: 'clone_failed', message: `Failed to clone: ${e.stderr || e.message}` },
    })
  }
}

export async function gitPull(repoPath: string): Promise<string> {
  await ensureGit()
  const { stdout } = await exec('git', ['pull'], { cwd: repoPath, timeout: 60_000 })
  return stdout.trim()
}

export async function gitGetHead(repoPath: string): Promise<string> {
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repoPath })
  return stdout.trim()
}

export async function gitLsRemote(repoUrl: string): Promise<string> {
  await ensureGit()
  try {
    const { stdout } = await exec('git', ['ls-remote', repoUrl, 'HEAD'], { timeout: 15_000 })
    const sha = stdout.split('\t')[0]
    return sha || ''
  } catch {
    return ''
  }
}

export async function gitDiffFiles(repoPath: string, fromSha: string): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['diff', '--name-only', fromSha, 'HEAD'], { cwd: repoPath })
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export async function removeClone(destPath: string): Promise<void> {
  if (existsSync(destPath)) {
    await rm(destPath, { recursive: true, force: true })
  }
}
