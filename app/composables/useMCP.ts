export interface McpServer {
  name: string
  transport: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  scope: 'global' | 'project'
  disabled?: boolean
}

export function useMCP() {
  const servers = useState<McpServer[]>('mcp-servers', () => [])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const { workingDir } = useWorkingDir()
  const toast = useToast()

  async function fetchServers() {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<any[]>('/api/mcp', {
        query: { workingDir: workingDir.value }
      })
      // Map existing configs to include transport if missing
      servers.value = data.map(s => ({
        ...s,
        transport: s.url ? 'sse' : 'stdio'
      }))
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch MCP servers'
      toast.add({ title: 'Failed to load servers', description: error.value, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function fetchServer(name: string, scope: 'global' | 'project') {
    try {
      const data = await $fetch<any>(`/api/mcp/${encodeURIComponent(name)}`, {
        query: { scope, workingDir: workingDir.value }
      })
      return {
        ...data,
        transport: data.url ? 'sse' : 'stdio'
      } as McpServer
    } catch (err: any) {
      toast.add({ title: 'Failed to fetch server', description: err.message, color: 'error' })
      throw err
    }
  }

  async function addServer(payload: Partial<McpServer> & { oldName?: string }) {
    try {
      const res = await $fetch('/api/mcp', {
        method: 'POST',
        body: {
          ...payload,
          workingDir: workingDir.value
        }
      })
      const isUpdate = !!payload.oldName
      toast.add({ 
        title: `Server ${payload.name} ${isUpdate ? 'updated' : 'added'} successfully`, 
        color: 'success' 
      })
      await fetchServers()
      return res
    } catch (err: any) {
      toast.add({ title: 'Failed to save server', description: err.message, color: 'error' })
      throw err
    }
  }

  async function toggleServer(server: McpServer) {
    try {
      const newDisabled = !server.disabled
      await addServer({
        ...server,
        oldName: server.name,
        disabled: newDisabled
      })
      toast.add({ 
        title: `Server ${server.name} ${newDisabled ? 'disabled' : 'enabled'}`, 
        color: 'success' 
      })
    } catch (err: any) {
      toast.add({ title: 'Failed to toggle server', description: err.message, color: 'error' })
    }
  }

  async function removeServer(name: string, scope: 'global' | 'project') {
    try {
      await $fetch(`/api/mcp/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        query: { scope, workingDir: workingDir.value }
      })
      toast.add({ title: `Server ${name} removed`, color: 'success' })
      await fetchServers()
    } catch (err: any) {
      toast.add({ title: 'Failed to remove server', description: err.message, color: 'error' })
      throw err
    }
  }

  return {
    servers,
    loading,
    error,
    fetchServers,
    fetchServer,
    addServer,
    toggleServer,
    removeServer
  }
}
