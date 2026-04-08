/**
 * Composable for fetching Claude Code chat history
 */

interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
}

interface ClaudeCodeSession {
  id: string
  summary: string
  messageCount: number
  lastActivity: string
  cwd: string
  model?: string
  isGrouped?: boolean
  groupSize?: number
  isActive?: boolean
}

interface ClaudeCodeMessage {
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
  [key: string]: unknown
}

export function useClaudeCodeHistory() {
  const projects = useState<ClaudeCodeProject[]>('claude-code-projects', () => [])
  const sessions = useState<ClaudeCodeSession[]>('claude-code-sessions', () => [])
  const messages = useState<ClaudeCodeMessage[]>('claude-code-messages', () => [])

  const isLoadingProjects = useState<boolean>('claude-code-loading-projects', () => false)
  const isLoadingSessions = useState<boolean>('claude-code-loading-sessions', () => false)
  const isLoadingMessages = useState<boolean>('claude-code-loading-messages', () => false)

  const selectedProject = useState<ClaudeCodeProject | null>('claude-code-selected-project', () => null)
  const selectedSession = useState<ClaudeCodeSession | null>('claude-code-selected-session', () => null)

  const sessionsHasMore = useState<boolean>('claude-code-sessions-has-more', () => false)
  const sessionsTotal = useState<number>('claude-code-sessions-total', () => 0)
  const messagesHasMore = useState<boolean>('claude-code-messages-has-more', () => false)
  const messagesTotal = useState<number>('claude-code-messages-total', () => 0)

  /**
   * Fetch all Claude Code projects
   */
  async function fetchProjects() {
    isLoadingProjects.value = true
    try {
      const response = await $fetch<ClaudeCodeProject[]>('/api/projects')
      projects.value = response
      return response
    } catch (error) {
      console.error('Failed to fetch Claude Code projects:', error)
      projects.value = []
      return []
    } finally {
      isLoadingProjects.value = false
    }
  }

  /**
   * Rename a project (folder)
   */
  async function renameProject(projectName: string, newDisplayName: string) {
    try {
      await $fetch(`/api/projects/${encodeURIComponent(projectName)}/rename`, {
        method: 'PUT',
        body: { displayName: newDisplayName }
      })

      // Update local state
      const project = projects.value.find(p => p.name === projectName)
      if (project) {
        project.displayName = newDisplayName
      }
      if (selectedProject.value?.name === projectName) {
        selectedProject.value.displayName = newDisplayName
      }
      return true
    } catch (error) {
      console.error('Failed to rename project:', error)
      throw error
    }
  }

  /**
   * Delete a project (folder)
   */
  async function deleteProject(projectName: string) {
    try {
      await $fetch(`/api/projects/${encodeURIComponent(projectName)}`, {
        method: 'DELETE'
      })

      // Update local state
      projects.value = projects.value.filter(p => p.name !== projectName)
      
      if (selectedProject.value?.name === projectName) {
        clearSelection()
      }
      
      return true
    } catch (error) {
      console.error('Failed to delete project:', error)
      throw error
    }
  }

  /**
   * Fetch sessions for a specific project
   */
  async function fetchSessions(projectName: string, limit = 20, offset = 0) {
    isLoadingSessions.value = true
    try {
      const response = await $fetch<{
        sessions: ClaudeCodeSession[]
        hasMore: boolean
        total: number
        projectName: string
      }>(`/api/projects/${encodeURIComponent(projectName)}/sessions`, {
        query: { limit, offset }
      })

      if (offset === 0) {
        sessions.value = response.sessions
      } else {
        sessions.value = [...sessions.value, ...response.sessions]
      }

      sessionsHasMore.value = response.hasMore
      sessionsTotal.value = response.total
      return response.sessions
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
      if (offset === 0) {
        sessions.value = []
      }
      return []
    } finally {
      isLoadingSessions.value = false
    }
  }

  /**
   * Rename a session
   */
  async function renameSession(projectName: string, sessionId: string, newName: string) {
    try {
      await $fetch(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
        method: 'PUT',
        body: { summary: newName, projectName }
      })

      // Update local state
      const session = sessions.value.find(s => s.id === sessionId)
      if (session) {
        session.summary = newName
      }
      if (selectedSession.value?.id === sessionId) {
        selectedSession.value.summary = newName
      }
      return true
    } catch (error) {
      console.error('Failed to rename session:', error)
      throw error
    }
  }

  /**
   * Delete a session
   */
  async function deleteSession(projectName: string, sessionId: string) {
    try {
      await $fetch(`/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      })

      // Update local state
      sessions.value = sessions.value.filter(s => s.id !== sessionId)
      sessionsTotal.value = Math.max(0, sessionsTotal.value - 1)

      if (selectedSession.value?.id === sessionId) {
        selectedSession.value = null
        messages.value = []
      }

      // Update project session count
      const project = projects.value.find(p => p.name === projectName)
      if (project) {
        project.sessionCount = Math.max(0, project.sessionCount - 1)
      }

      return true
    } catch (error) {
      console.error('Failed to delete session:', error)
      throw error
    }
  }

  /**
   * Fetch messages for a specific session
   */
  async function fetchMessages(
    projectName: string,
    sessionId: string,
    limit: number | null = 50,
    offset = 0
  ) {
    isLoadingMessages.value = true
    try {
      const query: Record<string, any> = { offset }
      if (limit !== null) {
        query.limit = limit
      }

      const response = await $fetch<{
        messages: ClaudeCodeMessage[]
        total: number
        hasMore: boolean
        projectName: string
        sessionId: string
        model?: string
        tokenUsage?: {
          input: number
          output: number
          cacheCreation: number
          cacheRead: number
        }
      }>(`/api/v2/claude-code/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionId)}/messages`, {
        query
      })

      if (offset === 0) {
        messages.value = response.messages
        // Sync model to selected session if we found one
        if (response.model && selectedSession.value && selectedSession.value.id === sessionId) {
          // Use direct assignment to ensure it's reactive within the object
          selectedSession.value.model = response.model
        }
      }
 else {
        // Prepend older messages
        messages.value = [...response.messages, ...messages.value]
      }

      messagesHasMore.value = response.hasMore
      messagesTotal.value = response.total
      return {
        messages: response.messages,
        tokenUsage: response.tokenUsage,
        model: response.model
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      if (offset === 0) {
        messages.value = []
      }
      return { messages: [] }
    } finally {
      isLoadingMessages.value = false
    }
  }

  /**
   * Select a project and load its sessions
   */
  async function selectProject(project: ClaudeCodeProject | null) {
    selectedProject.value = project
    selectedSession.value = null
    sessions.value = []
    messages.value = []

    if (project) {
      await fetchSessions(project.name)
    }
  }

  /**
   * Select a session and load its messages
   */
  async function selectSession(session: ClaudeCodeSession | null) {
    selectedSession.value = session
    messages.value = []

    if (session && selectedProject.value) {
      await fetchMessages(selectedProject.value.name, session.id)
    }
  }

  /**
   * Load more sessions (pagination)
   */
  async function loadMoreSessions() {
    if (!selectedProject.value || !sessionsHasMore.value || isLoadingSessions.value) {
      return
    }

    await fetchSessions(selectedProject.value.name, 20, sessions.value.length)
  }

  /**
   * Load more messages (pagination)
   */
  async function loadMoreMessages() {
    if (!selectedProject.value || !selectedSession.value || !messagesHasMore.value || isLoadingMessages.value) {
      return
    }

    await fetchMessages(
      selectedProject.value.name,
      selectedSession.value.id,
      50,
      messagesTotal.value - messages.value.length
    )
  }

  /**
   * Clear selection
   */
  function clearSelection() {
    selectedProject.value = null
    selectedSession.value = null
    sessions.value = []
    messages.value = []
  }

  return {
    // State
    projects,
    sessions,
    messages,
    selectedProject,
    selectedSession,
    isLoadingProjects,
    isLoadingSessions,
    isLoadingMessages,
    sessionsHasMore,
    sessionsTotal,
    messagesHasMore,
    messagesTotal,

    // Actions
    fetchProjects,
    fetchSessions,
    fetchMessages,
    renameProject,
    deleteProject,
    renameSession,
    deleteSession,
    selectProject,
    selectSession,
    loadMoreSessions,
    loadMoreMessages,
    clearSelection
  }
}
