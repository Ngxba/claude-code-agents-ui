import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export async function getMcpCapabilities(config: {
  transport?: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}) {
  let transport
  const effectiveTransport = config.transport || (config.command ? 'stdio' : (config.url ? 'sse' : undefined))

  if (effectiveTransport === 'stdio') {
    if (!config.command) throw new Error('Command is required for stdio transport')
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...(config.env || {}), ...(config.headers || {}) } as Record<string, string>
    })
  } else {
    if (!effectiveTransport) {
      throw new Error('Transport type could not be determined. Either "command" or "url" must be provided.')
    }
    if (!config.url) throw new Error(`URL is required for ${effectiveTransport} transport`)
    
    const configHeaders = config.headers || {}
    const transportOpts = {
      fetch: async (url: string | URL, init?: RequestInit) => {
        const isPost = init?.method?.toUpperCase() === 'POST'
        const headers = new Headers(init?.headers)
        
        // MCP standard headers
        if (!isPost) {
          headers.set('Accept', 'text/event-stream')
        }
        headers.set('mcp-protocol-version', '2024-11-05')
        
        for (const [key, value] of Object.entries(configHeaders)) {
          if (!isPost && ['content-type', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
            continue
          }
          headers.set(key, value)
        }

        console.log(`[MCP Client] [${effectiveTransport}] Fetching ${init?.method || 'GET'} ${url.toString()}`)
        try {
          const response = await fetch(url, {
            ...init,
            headers
          })
          console.log(`[MCP Client] [${effectiveTransport}] Response: ${response.status} ${response.statusText}`)
          return response
        } catch (err: any) {
          console.error(`[MCP Client] [${effectiveTransport}] Fetch error: ${err.message}`)
          throw err
        }
      }
    }

    if (effectiveTransport === 'http') {
      transport = new StreamableHTTPClientTransport(new URL(config.url), transportOpts)
    } else {
      transport = new SSEClientTransport(new URL(config.url), transportOpts)
    }
  }

  const client = new Client({
    name: 'claude-code-agents-ui',
    version: '1.0.0'
  }, {
    capabilities: {}
  })

  try {
    await client.connect(transport)

    const capabilities = client.getServerCapabilities()
    const promises = []

    // Only fetch what the server says it supports
    if (capabilities?.tools) {
      promises.push(client.listTools().then(res => ({ type: 'tools', data: res.tools || [] })).catch(err => {
        console.warn(`[MCP Client] Failed to list tools despite capability: ${err.message}`)
        return { type: 'tools', data: [] }
      }))
    } else {
      promises.push(Promise.resolve({ type: 'tools', data: [] }))
    }

    if (capabilities?.resources) {
      promises.push(client.listResources().then(res => ({ type: 'resources', data: res.resources || [] })).catch(err => {
        console.warn(`[MCP Client] Failed to list resources despite capability: ${err.message}`)
        return { type: 'resources', data: [] }
      }))
    } else {
      promises.push(Promise.resolve({ type: 'resources', data: [] }))
    }

    if (capabilities?.prompts) {
      promises.push(client.listPrompts().then(res => ({ type: 'prompts', data: res.prompts || [] })).catch(err => {
        console.warn(`[MCP Client] Failed to list prompts despite capability: ${err.message}`)
        return { type: 'prompts', data: [] }
      }))
    } else {
      promises.push(Promise.resolve({ type: 'prompts', data: [] }))
    }

    const results = await Promise.all(promises)
    
    return {
      tools: results.find(r => r.type === 'tools')?.data || [],
      resources: results.find(r => r.type === 'resources')?.data || [],
      prompts: results.find(r => r.type === 'prompts')?.data || []
    }
  } catch (err: any) {
    console.error('[MCP Client] Connection failed:', err)
    throw err
  } finally {
    try {
      await client.close()
    } catch {
      // Ignore cleanup errors
    }
  }
}
