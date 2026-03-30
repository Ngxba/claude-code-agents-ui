import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { name, transport, command, args, env, url, headers, scope, workingDir, oldName, disabled } = body

  if (!name || !scope || !transport) {
    throw createError({ statusCode: 400, message: 'Missing required fields' })
  }

  let filePath = ''
  if (scope === 'global') {
    filePath = join(homedir(), '.claude.json')
  } else if (scope === 'project') {
    if (!workingDir) {
      throw createError({ statusCode: 400, message: 'Working directory is required for project scope' })
    }
    filePath = join(workingDir, '.mcp.json')
  } else {
    throw createError({ statusCode: 400, message: 'Invalid scope' })
  }

  let data: any = { mcpServers: {} }
  if (existsSync(filePath)) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      data = JSON.parse(raw)
      if (!data.mcpServers) {
        data.mcpServers = {}
      }
    } catch (err) {
      console.error(`Failed to parse ${filePath}`, err)
      data = { mcpServers: {} }
    }
  }

  // Handle rename if oldName is provided and different
  if (oldName && oldName !== name && data.mcpServers[oldName]) {
    delete data.mcpServers[oldName]
  }

  // Build config based on transport
  const config: any = {}
  if (disabled !== undefined) {
    config.disabled = !!disabled
  }
  
  if (transport === 'stdio') {
    if (!command) throw createError({ statusCode: 400, message: 'Command is required for stdio transport' })
    config.command = command
    config.args = Array.isArray(args) ? args : []
    config.env = typeof env === 'object' && env !== null ? env : {}
  } else if (transport === 'sse') {
    if (!url) throw createError({ statusCode: 400, message: 'URL is required for sse transport' })
    config.url = url
    config.headers = typeof headers === 'object' && headers !== null ? headers : {}
  } else {
    throw createError({ statusCode: 400, message: 'Unsupported transport type' })
  }

  // Update or add the server
  data.mcpServers[name] = config

  // Write back to file
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')

  return { success: true, server: { name, ...config, scope } }
})
