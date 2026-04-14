import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const { scope, workingDir } = getQuery(event)

  if (!name) {
    throw createError({ statusCode: 400, message: 'Server name is required' })
  }

  let filePath = ''
  if (scope === 'global') {
    filePath = join(homedir(), '.claude.json')
  } else if (scope === 'project') {
    if (!workingDir || typeof workingDir !== 'string') {
      throw createError({ statusCode: 400, message: 'Working directory is required for project scope' })
    }
    filePath = join(workingDir, '.mcp.json')
  } else {
    throw createError({ statusCode: 400, message: 'Invalid scope' })
  }

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'Configuration file not found' })
  }

  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw)

    if (!data.mcpServers || !data.mcpServers[name]) {
      throw createError({ statusCode: 404, message: 'Server not found' })
    }

    const config = data.mcpServers[name] as any
    const transport = config.transport || config.type || (config.command ? 'stdio' : (config.url ? 'sse' : undefined))

    return {
      name,
      ...config,
      transport,
      scope
    }
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 500, message: 'Failed to read server configuration' })
  }
})
