import { spawn as ptySpawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { FSWatcher } from 'chokidar'
import { getClaudeDir } from './claudeDir'

export interface CliSessionMetadata {
  id: string
  agentSlug?: string
  workingDir: string
  shell: string
  status: 'active' | 'idle' | 'terminated'
  createdAt: string
  lastActivity: string
  tokenUsage?: {
    input: number
    output: number
    cached: number
  }
  cost?: number
}

export interface CliSessionData {
  pty: IPty
  metadata: CliSessionMetadata
  watchers: FSWatcher[]
  idleTimer?: NodeJS.Timeout
  output: string[] // Store output history for saving
}

// In-memory session store
const sessions = new Map<string, CliSessionData>()

// Auto-cleanup idle sessions after 30 minutes
const IDLE_TIMEOUT = 30 * 60 * 1000

/**
 * Create a new CLI session with PTY
 */
export async function createCliSession(options: {
  agentSlug?: string
  workingDir?: string
  shell?: string
  cols?: number
  rows?: number
}): Promise<CliSessionMetadata> {
  const sessionId = randomUUID()
  const workingDir = options.workingDir || os.homedir()

  // Find Claude CLI
  const claudePath = getClaudePath()
  console.log('[CLI Session] Claude CLI detection result:', claudePath)
  if (!claudePath) {
    console.error('[CLI Session] Claude CLI not found in PATH or common locations')
    console.error('[CLI Session] PATH:', process.env.PATH)
    throw new Error('Claude CLI not found. Please install Claude Code CLI or set CLAUDE_CLI_PATH environment variable.')
  }

  // Build command arguments for Claude CLI
  const args: string[] = []

  // If agent is specified, add agent flag
  if (options.agentSlug) {
    args.push('--agent', options.agentSlug)
  }

  console.log('[CLI Session] Creating Claude Code session:', {
    sessionId,
    workingDir,
    claudePath,
    agentSlug: options.agentSlug,
    args,
  })

  // Verify working directory exists and is accessible
  try {
    await fs.access(workingDir)
    const stats = await fs.stat(workingDir)
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${workingDir}`)
    }
  } catch (error: any) {
    const errorMsg = error.message || `Directory does not exist: ${workingDir}`
    console.error('[CLI Session] Invalid working directory:', errorMsg)
    throw new Error(errorMsg)
  }

  console.log('[CLI Session] All validations passed, spawning Claude Code CLI...')

  // Spawn Claude Code CLI in PTY
  let pty: IPty
  try {
    pty = ptySpawn(claudePath, args, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HOME: os.homedir(),
        // Ensure Claude has access to the working directory
        PWD: workingDir,
      },
    })
    console.log('[CLI Session] Claude Code CLI spawned successfully')
  } catch (error: any) {
    console.error('[CLI Session] Failed to spawn Claude CLI:', error)
    console.error('[CLI Session] Error details:', {
      claudePath,
      workingDir,
      args,
      errorCode: error.code,
      errorMessage: error.message,
    })
    throw new Error(`Failed to spawn Claude CLI: ${error.message || error.code || 'spawn failed'}`)
  }

  const metadata: CliSessionMetadata = {
    id: sessionId,
    agentSlug: options.agentSlug,
    workingDir,
    shell: claudePath,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  }

  const sessionData: CliSessionData = {
    pty,
    metadata,
    watchers: [],
    output: [],
  }

  // Set up auto-cleanup
  sessionData.idleTimer = setTimeout(() => {
    terminateSession(sessionId)
  }, IDLE_TIMEOUT)

  // Store output history
  pty.onData((data) => {
    sessionData.output.push(data)
    // Keep only last 10000 lines
    if (sessionData.output.length > 10000) {
      sessionData.output = sessionData.output.slice(-10000)
    }
    updateLastActivity(sessionId)
  })

  // Handle PTY exit
  pty.onExit(({ exitCode }) => {
    console.log(`[CLI Session ${sessionId}] PTY exited with code ${exitCode}`)
    if (sessions.has(sessionId)) {
      const data = sessions.get(sessionId)!
      data.metadata.status = 'terminated'
      // Save session history before cleanup
      saveSessionHistory(sessionId).catch(console.error)
      // Clean up after 1 minute
      setTimeout(() => {
        sessions.delete(sessionId)
      }, 60_000)
    }
  })

  sessions.set(sessionId, sessionData)

  return metadata
}

/**
 * Get session data by ID
 */
export function getCliSession(sessionId: string): CliSessionData | undefined {
  return sessions.get(sessionId)
}

/**
 * Get all active sessions
 */
export function getAllSessions(): CliSessionMetadata[] {
  return Array.from(sessions.values()).map((s) => s.metadata)
}

/**
 * Update last activity timestamp
 */
export function updateLastActivity(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.metadata.lastActivity = new Date().toISOString()
    session.metadata.status = 'active'

    // Reset idle timer
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
    }
    session.idleTimer = setTimeout(() => {
      terminateSession(sessionId)
    }, IDLE_TIMEOUT)
  }
}

/**
 * Resize PTY terminal
 */
export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.pty.resize(cols, rows)
    updateLastActivity(sessionId)
  }
}

/**
 * Write data to PTY
 */
export function writeToSession(sessionId: string, data: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.pty.write(data)
    updateLastActivity(sessionId)
  }
}

/**
 * Terminate a session and clean up resources
 */
export async function terminateSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return

  // Update status
  session.metadata.status = 'terminated'

  // Clear idle timer
  if (session.idleTimer) {
    clearTimeout(session.idleTimer)
  }

  // Close file watchers
  for (const watcher of session.watchers) {
    await watcher.close()
  }

  // Save session history
  await saveSessionHistory(sessionId)

  // Kill PTY
  try {
    session.pty.kill()
  } catch (e) {
    console.error(`[CLI Session ${sessionId}] Error killing PTY:`, e)
  }

  // Remove from sessions
  sessions.delete(sessionId)
}

/**
 * Save session history to disk
 */
async function saveSessionHistory(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    const historyDir = path.join(getClaudeDir(), 'cli-history')
    await fs.mkdir(historyDir, { recursive: true })

    const historyFile = path.join(historyDir, `${sessionId}.json`)
    const history = {
      ...session.metadata,
      output: session.output.join(''),
    }

    await fs.writeFile(historyFile, JSON.stringify(history, null, 2))
  } catch (e) {
    console.error(`[CLI Session ${sessionId}] Failed to save history:`, e)
  }
}

/**
 * Load session history from disk
 */
export async function loadSessionHistory(sessionId: string): Promise<any> {
  try {
    const historyDir = path.join(getClaudeDir(), 'cli-history')
    const historyFile = path.join(historyDir, `${sessionId}.json`)
    const content = await fs.readFile(historyFile, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    throw new Error(`Session ${sessionId} not found`)
  }
}

/**
 * List all saved session histories
 */
export async function listSessionHistories(): Promise<CliSessionMetadata[]> {
  try {
    const historyDir = path.join(getClaudeDir(), 'cli-history')
    await fs.mkdir(historyDir, { recursive: true })

    const files = await fs.readdir(historyDir)
    const histories: CliSessionMetadata[] = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(historyDir, file), 'utf-8')
          const data = JSON.parse(content)
          // Extract metadata only (without output)
          const { output, ...metadata } = data
          histories.push(metadata)
        } catch (e) {
          console.error(`Failed to load history file ${file}:`, e)
        }
      }
    }

    // Sort by creation date (newest first)
    histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return histories
  } catch (e) {
    return []
  }
}

/**
 * Get Claude CLI path
 */
function getClaudePath(): string | null {
  console.log('[CLI Session] Searching for Claude CLI...')

  // First check CLAUDE_CLI_PATH environment variable
  const config = useRuntimeConfig()
  if (config.claudeCliPath) {
    console.log('[CLI Session] Checking CLAUDE_CLI_PATH:', config.claudeCliPath)
    if (existsSync(config.claudeCliPath)) {
      console.log('[CLI Session] Found Claude CLI via CLAUDE_CLI_PATH:', config.claudeCliPath)
      return config.claudeCliPath
    } else {
      console.warn('[CLI Session] CLAUDE_CLI_PATH set but file not found/not executable:', config.claudeCliPath)
    }
  }

  // Check CLAUDE_CLI_PATH from process.env as fallback
  if (process.env.CLAUDE_CLI_PATH) {
    console.log('[CLI Session] Checking process.env.CLAUDE_CLI_PATH:', process.env.CLAUDE_CLI_PATH)
    if (existsSync(process.env.CLAUDE_CLI_PATH)) {
      console.log('[CLI Session] Found Claude CLI via process.env.CLAUDE_CLI_PATH:', process.env.CLAUDE_CLI_PATH)
      return process.env.CLAUDE_CLI_PATH
    }
  }

  // Check common installation paths
  const possiblePaths = [
    '/opt/homebrew/bin/claude',  // Homebrew on Apple Silicon
    '/usr/local/bin/claude',     // Homebrew on Intel
    '/usr/bin/claude',           // System installation
  ]

  for (const claudePath of possiblePaths) {
    console.log('[CLI Session] Checking:', claudePath)
    if (existsSync(claudePath)) {
      console.log('[CLI Session] Found Claude CLI at:', claudePath)
      return claudePath
    }
  }

  // Then try to find in PATH
  if (process.env.PATH) {
    console.log('[CLI Session] Searching in PATH...')
    const pathDirs = process.env.PATH.split(':')
    for (const dir of pathDirs) {
      const claudePath = path.join(dir, 'claude')
      if (existsSync(claudePath)) {
        console.log('[CLI Session] Found Claude CLI at:', claudePath)
        return claudePath
      }
    }
  } else {
    console.log('[CLI Session] PATH environment variable not set')
  }

  console.error('[CLI Session] Claude CLI not found in any location')
  console.error('[CLI Session] Searched paths:', possiblePaths)
  console.error('[CLI Session] Hint: Set CLAUDE_CLI_PATH environment variable to specify the path')
  return null
}

/**
 * Check if a file exists synchronously
 */
function existsSync(filePath: string): boolean {
  try {
    const fs = require('node:fs')
    // First check if file exists at all
    fs.accessSync(filePath, fs.constants.F_OK)
    // Then check if it's executable (on Unix systems)
    if (process.platform !== 'win32') {
      fs.accessSync(filePath, fs.constants.X_OK)
    }
    return true
  } catch (error: any) {
    console.log(`[CLI Session] File check failed for ${filePath}:`, error.code)
    return false
  }
}

/**
 * Update session token usage
 */
export function updateSessionTokens(
  sessionId: string,
  tokens: { input: number; output: number; cached: number }
): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.metadata.tokenUsage = tokens
  }
}

/**
 * Update session cost
 */
export function updateSessionCost(sessionId: string, cost: number): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.metadata.cost = cost
  }
}

// Cleanup all sessions on server shutdown (SIGTERM/SIGINT for real signal handling)
function cleanupAllSessions() {
  for (const sessionId of sessions.keys()) {
    terminateSession(sessionId).catch(console.error)
  }
}

process.on('beforeExit', cleanupAllSessions)
process.on('SIGTERM', () => { cleanupAllSessions(); process.exit(0) })
process.on('SIGINT', () => { cleanupAllSessions(); process.exit(0) })
