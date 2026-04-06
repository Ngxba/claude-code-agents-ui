/**
 * Claude Code History Reader
 * Reads chat history from Claude Code CLI stored in ~/.claude/projects/
 */

import { promises as fs, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'

import { getClaudeDir } from './claudeDir'

export interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
}

export interface ClaudeCodeSession {
  id: string
  summary: string
  messageCount: number
  lastActivity: string
  cwd: string
  model?: string
  isGrouped?: boolean
  groupSize?: number
}

export interface ClaudeCodeMessage {
  uuid?: string
  parentUuid?: string | null
  sessionId: string
  timestamp: string
  type?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>
  }
  cwd?: string
  toolName?: string
  toolInput?: unknown
  toolUseResult?: unknown
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  [key: string]: unknown
}

const projectDirectoryCache = new Map<string, string>()

interface SessionNames {
  [sessionId: string]: {
    summary: string
    updatedAt: string
  }
}

interface ProjectNames {
  [projectName: string]: {
    displayName: string
    updatedAt: string
  }
}

/**
 * Load custom session names from storage
 */
async function loadSessionNames(): Promise<SessionNames> {
  const filePath = join(getClaudeDir(), 'custom-session-names.json')
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data) as SessionNames
  } catch {
    return {}
  }
}

/**
 * Save custom session names to storage
 */
async function saveSessionNames(names: SessionNames): Promise<void> {
  const filePath = join(getClaudeDir(), 'custom-session-names.json')
  await fs.writeFile(filePath, JSON.stringify(names, null, 2), 'utf8')
}

/**
 * Load custom project names from storage
 */
async function loadProjectNames(): Promise<ProjectNames> {
  const filePath = join(getClaudeDir(), 'custom-project-names.json')
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data) as ProjectNames
  } catch {
    return {}
  }
}

/**
 * Save custom project names to storage
 */
async function saveProjectNames(names: ProjectNames): Promise<void> {
  const filePath = join(getClaudeDir(), 'custom-project-names.json')
  await fs.writeFile(filePath, JSON.stringify(names, null, 2), 'utf8')
}

/**
 * Set a custom name for a session
 */
export async function setSessionName(sessionId: string, summary: string): Promise<void> {
  const names = await loadSessionNames()
  names[sessionId] = {
    summary,
    updatedAt: new Date().toISOString()
  }
  await saveSessionNames(names)
}

/**
 * Delete a custom name for a session
 */
export async function deleteSessionName(sessionId: string): Promise<void> {
  const names = await loadSessionNames()
  if (names[sessionId]) {
    delete names[sessionId]
    await saveSessionNames(names)
  }
}

/**
 * Set a custom name for a project
 */
export async function setProjectName(projectName: string, displayName: string): Promise<void> {
  const names = await loadProjectNames()
  names[projectName] = {
    displayName,
    updatedAt: new Date().toISOString()
  }
  await saveProjectNames(names)
}

/**
 * Delete a custom name for a project
 */
export async function deleteProjectName(projectName: string): Promise<void> {
  const names = await loadProjectNames()
  if (names[projectName]) {
    delete names[projectName]
    await saveProjectNames(names)
  }
}

/**
 * Apply custom names to sessions
 */
async function applyCustomSessionNames(sessions: ClaudeCodeSession[]): Promise<void> {
  if (sessions.length === 0) return
  const names = await loadSessionNames()
  for (const session of sessions) {
    const customName = names[session.id]
    if (customName) {
      session.summary = customName.summary
    }
  }
}

/**
 * Apply custom names to projects
 */
async function applyCustomProjectNames(projects: ClaudeCodeProject[]): Promise<void> {
  if (projects.length === 0) return
  const names = await loadProjectNames()
  for (const project of projects) {
    const customName = names[project.name]
    if (customName) {
      project.displayName = customName.displayName
    }
  }
}

/**
 * Get the Claude projects directory path
 */
function getClaudeProjectsDir(): string {
  return join(getClaudeDir(), 'projects')
}

/**
 * Extract the actual project directory from JSONL sessions
 */
async function extractProjectDirectory(projectName: string): Promise<string> {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName)!
  }

  const projectDir = join(getClaudeProjectsDir(), projectName)
  const cwdCounts = new Map<string, number>()
  let latestTimestamp = 0
  let latestCwd: string | null = null
  let extractedPath = projectName.replace(/-/g, '/')

  try {
    await fs.access(projectDir)

    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      extractedPath = projectName.replace(/-/g, '/')
    } else {
      // Process JSONL files to collect cwd values
      for (const file of jsonlFiles.slice(0, 3)) { // Limit to first 3 files for performance
        const jsonlFile = join(projectDir, file)
        const fileStream = createReadStream(jsonlFile)
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        })

        for await (const line of rl) {
          if (line.trim()) {
            try {
              const entry = JSON.parse(line)
              if (entry.cwd) {
                cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1)
                const timestamp = new Date(entry.timestamp || 0).getTime()
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp
                  latestCwd = entry.cwd
                }
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      if (cwdCounts.size === 0) {
        extractedPath = projectName.replace(/-/g, '/')
      } else if (cwdCounts.size === 1) {
        extractedPath = Array.from(cwdCounts.keys())[0] || extractedPath
      } else {
        // Multiple cwd values - prefer most recent if it has reasonable usage
        const mostRecentCount = latestCwd ? (cwdCounts.get(latestCwd) || 0) : 0
        const maxCount = Math.max(...cwdCounts.values())

        if (mostRecentCount >= maxCount * 0.25 && latestCwd) {
          extractedPath = latestCwd
        } else {
          for (const [cwd, count] of cwdCounts.entries()) {
            if (count === maxCount) {
              extractedPath = cwd
              break
            }
          }
          extractedPath = extractedPath || latestCwd || projectName.replace(/-/g, '/')
        }
      }
    }

    projectDirectoryCache.set(projectName, extractedPath)
    return extractedPath
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      extractedPath = projectName.replace(/-/g, '/')
    } else {
      extractedPath = projectName.replace(/-/g, '/')
    }
    projectDirectoryCache.set(projectName, extractedPath)
    return extractedPath
  }
}

/**
 * Generate display name from project name
 */
async function generateDisplayName(projectName: string, actualProjectDir: string): Promise<string> {
  // Try to read package.json from the project path
  try {
    const packageJsonPath = join(actualProjectDir, 'package.json')
    const packageData = await fs.readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageData)
    if (packageJson.name) {
      return packageJson.name
    }
  } catch {
    // Fall back to path-based naming
  }

  // If it starts with /, return only the last folder name
  if (actualProjectDir.startsWith('/')) {
    const parts = actualProjectDir.split('/').filter(Boolean)
    return parts[parts.length - 1] || actualProjectDir
  }

  return actualProjectDir
}

/**
 * Get all Claude Code projects
 */
export async function getClaudeCodeProjects(): Promise<ClaudeCodeProject[]> {
  const claudeDir = getClaudeProjectsDir()
  const projects: ClaudeCodeProject[] = []

  try {
    await fs.access(claudeDir)

    const entries = await fs.readdir(claudeDir, { withFileTypes: true })
    const directories = entries.filter(e => e.isDirectory())

    for (const entry of directories) {
      const actualProjectDir = await extractProjectDirectory(entry.name)
      const displayName = await generateDisplayName(entry.name, actualProjectDir)

      // Get session count and last activity
      const projectDir = join(claudeDir, entry.name)
      const files = await fs.readdir(projectDir)
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

      let lastActivity: string | undefined
      if (jsonlFiles.length > 0) {
        // Get modification time of most recent file
        const filesWithStats = await Promise.all(
          jsonlFiles.slice(0, 5).map(async (file) => {
            const filePath = join(projectDir, file)
            const stats = await fs.stat(filePath)
            return { mtime: stats.mtime }
          })
        )
        filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        lastActivity = filesWithStats[0]?.mtime.toISOString()
      }

      projects.push({
        name: entry.name,
        path: actualProjectDir,
        displayName,
        lastActivity,
        sessionCount: jsonlFiles.length
      })
    }

    await applyCustomProjectNames(projects)

    // Sort by last activity (newest first)
    projects.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0
      if (!a.lastActivity) return 1
      if (!b.lastActivity) return -1
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    })

    return projects
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    console.error('Error reading Claude Code projects:', error)
    return []
  }
}

/**
 * Parse JSONL file to extract sessions
 */
async function parseJsonlSessions(filePath: string): Promise<{
  sessions: Map<string, ClaudeCodeSession>
  entries: ClaudeCodeMessage[]
}> {
  const sessions = new Map<string, ClaudeCodeSession>()
  const entries: ClaudeCodeMessage[] = []
  const pendingSummaries = new Map<string, string>()

  try {
    const fileStream = createReadStream(filePath)
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line) as ClaudeCodeMessage
          entries.push(entry)

          // Handle summary entries that don't have sessionId yet
          if (entry.type === 'summary' && (entry as any).summary && !entry.sessionId && (entry as any).leafUuid) {
            pendingSummaries.set((entry as any).leafUuid, (entry as any).summary)
          }

          if (entry.sessionId) {
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                id: entry.sessionId,
                summary: 'New Session',
                messageCount: 0,
                lastActivity: entry.timestamp || new Date(0).toISOString(),
                cwd: entry.cwd || '',
                model: (entry as any).model || undefined
              })
            }

            const session = sessions.get(entry.sessionId)!

            // Capture model if not already set or if it appears in later entries
            if ((entry as any).model && !session.model) {
              session.model = (entry as any).model
            }

            // Apply pending summary
            if (session.summary === 'New Session' && entry.parentUuid && pendingSummaries.has(entry.parentUuid)) {
              session.summary = pendingSummaries.get(entry.parentUuid)!
            }

            // Update summary from summary entries
            if (entry.type === 'summary' && (entry as any).summary) {
              session.summary = (entry as any).summary
            }

            // Use first user message as summary if still "New Session"
            if (session.summary === 'New Session' && entry.message?.role === 'user') {
              const content = entry.message.content
              let textContent = ''
              if (typeof content === 'string') {
                textContent = content
              } else if (Array.isArray(content)) {
                // Extract text from content array
                const textPart = content.find(c => c.type === 'text' && c.text)
                textContent = textPart?.text || ''
              }
              if (textContent) {
                // Truncate to reasonable length for display
                session.summary = textContent.slice(0, 100).trim()
                if (textContent.length > 100) {
                  session.summary += '...'
                }
              }
            }

            // Count messages and track activity
            session.messageCount++
            if (entry.timestamp) {
              const timestamp = new Date(entry.timestamp)
              if (timestamp > new Date(session.lastActivity)) {
                session.lastActivity = entry.timestamp
              }
            }

            if (entry.cwd) {
              session.cwd = entry.cwd
            }
          }
        } catch {
          // Skip malformed lines
        }
      }
    }
  } catch (error) {
    console.error(`Error parsing JSONL file ${filePath}:`, error)
  }

  return { sessions, entries }
}

/**
 * Get sessions for a specific Claude Code project
 */
export async function getClaudeCodeSessions(
  projectName: string,
  limit = 20,
  offset = 0
): Promise<{
  sessions: ClaudeCodeSession[]
  hasMore: boolean
  total: number
}> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  try {
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return { sessions: [], hasMore: false, total: 0 }
    }

    // Sort files by modification time (newest first)
    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectDir, file)
        const stats = await fs.stat(filePath)
        return { file, mtime: stats.mtime }
      })
    )
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    const allSessions = new Map<string, ClaudeCodeSession>()

    // Collect sessions from all files
    for (const { file } of filesWithStats) {
      const jsonlFile = join(projectDir, file)
      const result = await parseJsonlSessions(jsonlFile)

      result.sessions.forEach((session, id) => {
        if (!allSessions.has(id)) {
          allSessions.set(id, session)
        }
      })

      // Early exit for performance
      if (allSessions.size >= (limit + offset) * 2) {
        break
      }
    }

    // Convert to array and sort by last activity
    const visibleSessions = Array.from(allSessions.values())
      .filter(session => !session.summary.startsWith('{ "'))
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

    const total = visibleSessions.length
    const paginatedSessions = visibleSessions.slice(offset, offset + limit)
    await applyCustomSessionNames(paginatedSessions)
    const hasMore = offset + limit < total

    return { sessions: paginatedSessions, hasMore, total }
  } catch (error: any) {
    console.error(`Error reading sessions for project ${projectName}:`, error)
    return { sessions: [], hasMore: false, total: 0 }
  }
}

/**
 * Get messages for a specific session
 */
export async function getClaudeCodeSessionMessages(
  projectName: string,
  sessionId: string,
  limit: number | null = null,
  offset = 0
): Promise<{
  messages: ClaudeCodeMessage[]
  total: number
  hasMore: boolean
  model?: string
  tokenUsage?: {
    input: number
    output: number
    cacheCreation: number
    cacheRead: number
  }
}> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  try {
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return { messages: [], total: 0, hasMore: false }
    }

    const messages: ClaudeCodeMessage[] = []

    // Process all JSONL files to find messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectDir, file)
      const fileStream = createReadStream(jsonlFile)
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      })

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line) as ClaudeCodeMessage
            if (entry.sessionId === sessionId) {
              messages.push(entry)
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }

    // Sort messages by timestamp
    const sortedMessages = messages.sort((a, b) =>
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    )

    // Extract latest token usage and model from messages (scan from end)
    let tokenUsage: any = undefined
    let model: string | undefined = undefined
    
    for (let i = sortedMessages.length - 1; i >= 0; i--) {
      const msg = sortedMessages[i]
      if (!msg) continue

      // Extract model if present anywhere in session
      if ((msg as any).model && !model) {
        model = (msg as any).model
      }

      // Use msg.message.role or entry.role/type depending on JSONL format
      const role = (msg as any).role || (msg.message as any)?.role || msg.type
      const usage = msg.usage || (msg.message as any)?.usage
      
      if (role === 'assistant' && usage && !tokenUsage) {
        tokenUsage = {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheCreation: usage.cache_creation_input_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0
        }
      }
      
      // If we have both, we can stop
      if (model && tokenUsage) break
    }

    const total = sortedMessages.length

    // If no limit, return all
    if (limit === null) {
      return { messages: sortedMessages, total, hasMore: false, tokenUsage, model }
    }

    // Apply pagination - get most recent messages
    const startIndex = Math.max(0, total - offset - limit)
    const endIndex = total - offset
    const paginatedMessages = sortedMessages.slice(startIndex, endIndex)
    const hasMore = startIndex > 0

    return { messages: paginatedMessages, total, hasMore, tokenUsage, model }
  } catch (error: any) {
    console.error(`Error reading messages for session ${sessionId}:`, error)
    return { messages: [], total: 0, hasMore: false }
  }
}

/**
 * Delete a session from a project
 */
export async function deleteClaudeCodeSession(projectName: string, sessionId: string): Promise<boolean> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  // Remove from custom names store
  await deleteSessionName(sessionId)

  try {
    await fs.access(projectDir)
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return false
    }

    let deleted = false

    // Process all JSONL files to find and remove messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectDir, file)
      const content = await fs.readFile(jsonlFile, 'utf8')
      const lines = content.split('\n').filter(line => line.trim())

      // Check if this file contains the session
      const hasSession = lines.some(line => {
        try {
          const data = JSON.parse(line)
          return data.sessionId === sessionId
        } catch {
          return false
        }
      })

      if (hasSession) {
        // Filter out all entries for this session
        const filteredLines = lines.filter(line => {
          try {
            const data = JSON.parse(line)
            return data.sessionId !== sessionId
          } catch {
            return true // Keep malformed lines
          }
        })

        // Write back the filtered content
        if (filteredLines.length === 0) {
          // If no lines left, we could delete the file, but it might be better to just keep it empty
          await fs.writeFile(jsonlFile, '', 'utf8')
        } else {
          await fs.writeFile(jsonlFile, filteredLines.join('\n') + '\n', 'utf8')
        }
        deleted = true
      }
    }

    return deleted
  } catch (error) {
    console.error(`Error deleting session ${sessionId} from project ${projectName}:`, error)
    return false
  }
}

/**
 * Rename a session summary in the JSONL files
 * (Note: This is expensive as it modifies history. Alternatively, we could use a sidecar DB)
 */
export async function renameClaudeCodeSession(projectName: string, sessionId: string, newSummary: string): Promise<boolean> {
  const projectDir = join(getClaudeProjectsDir(), projectName)

  // Save to persistent custom names store
  await setSessionName(sessionId, newSummary)

  try {
    await fs.access(projectDir)
    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-'))

    if (jsonlFiles.length === 0) {
      return false
    }

    let renamed = false
    let lastFileForSession = ''

    // Process all JSONL files to find and update the summary for this session
    for (const file of jsonlFiles) {
      const jsonlFile = join(projectDir, file)
      const content = await fs.readFile(jsonlFile, 'utf8')
      const lines = content.split('\n').filter(line => line.trim())

      let fileModified = false
      const updatedLines = lines.map(line => {
        try {
          const data = JSON.parse(line)
          if (data.sessionId === sessionId) {
            lastFileForSession = jsonlFile
            if (data.type === 'summary') {
              data.summary = newSummary
              fileModified = true
              return JSON.stringify(data)
            }
          }
          return line
        } catch {
          return line
        }
      })

      if (fileModified) {
        await fs.writeFile(jsonlFile, updatedLines.join('\n') + '\n', 'utf8')
        renamed = true
      }
    }

    // If we didn't find a summary entry to modify, append a new summary entry to the last file where this session was seen
    if (!renamed && lastFileForSession) {
      const summaryEntry = {
        type: 'summary',
        sessionId: sessionId,
        summary: newSummary,
        timestamp: new Date().toISOString()
      }
      await fs.appendFile(lastFileForSession, JSON.stringify(summaryEntry) + '\n', 'utf8')
      renamed = true
    }

    return renamed
  } catch (error) {
    console.error(`Error renaming session ${sessionId} in project ${projectName}:`, error)
    return false
  }
}

/**
 * Delete a Claude Code project (folder)
 */
export async function deleteClaudeCodeProject(projectName: string): Promise<boolean> {
  const projectDir = join(getClaudeProjectsDir(), projectName)
  
  // Remove from custom names store
  await deleteProjectName(projectName)

  try {
    await fs.rm(projectDir, { recursive: true, force: true })
    return true
  } catch (error) {
    console.error(`Error deleting project ${projectName}:`, error)
    return false
  }
}

/**
 * Rename a Claude Code project (display name)
 */
export async function renameClaudeCodeProject(projectName: string, newDisplayName: string): Promise<boolean> {
  try {
    // We only change the display name in our custom store
    await setProjectName(projectName, newDisplayName)
    return true
  } catch (error) {
    console.error(`Error renaming project ${projectName}:`, error)
    return false
  }
}
