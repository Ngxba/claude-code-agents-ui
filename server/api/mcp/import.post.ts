import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { content } = body

  if (!content) {
    throw createError({ statusCode: 400, message: 'No content provided' })
  }

  let importedData: any
  try {
    importedData = JSON.parse(content)
  } catch (err) {
    throw createError({ statusCode: 400, message: 'Invalid JSON content' })
  }

  // Expecting { mcpServers: { ... } } or just { ... } where keys are server names
  const newServers = importedData.mcpServers || importedData

  if (typeof newServers !== 'object' || newServers === null) {
    throw createError({ statusCode: 400, message: 'Invalid MCP configuration format' })
  }

  // Validate each MCP server config entry
  for (const [name, config] of Object.entries(newServers)) {
    if (typeof name !== 'string' || !name.match(/^[a-zA-Z0-9_-]+$/)) {
      throw createError({ statusCode: 400, message: `Invalid server name: ${name}` })
    }

    const cfg = config as Record<string, unknown>
    if (typeof cfg !== 'object' || cfg === null) {
      throw createError({ statusCode: 400, message: `Invalid config for server: ${name}` })
    }

    // Must have either 'command' (stdio) or 'url' (SSE/streamable-http) — not arbitrary fields
    const hasCommand = typeof cfg.command === 'string'
    const hasUrl = typeof cfg.url === 'string'
    if (!hasCommand && !hasUrl) {
      throw createError({ statusCode: 400, message: `Server "${name}" must have a "command" or "url" field` })
    }

    // Validate URL format if present
    if (hasUrl) {
      try {
        const parsed = new URL(cfg.url as string)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol')
        }
      } catch {
        throw createError({ statusCode: 400, message: `Server "${name}" has an invalid URL` })
      }
    }

    // Validate args is array of strings if present
    if (cfg.args !== undefined && (!Array.isArray(cfg.args) || !cfg.args.every((a: unknown) => typeof a === 'string'))) {
      throw createError({ statusCode: 400, message: `Server "${name}" args must be an array of strings` })
    }

    // Validate env is a string-to-string object if present
    if (cfg.env !== undefined) {
      if (typeof cfg.env !== 'object' || cfg.env === null || Array.isArray(cfg.env)) {
        throw createError({ statusCode: 400, message: `Server "${name}" env must be an object` })
      }
      for (const [k, v] of Object.entries(cfg.env as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          throw createError({ statusCode: 400, message: `Server "${name}" env values must be strings` })
        }
      }
    }

    // Strip any unexpected fields — only allow known MCP config keys
    const allowedKeys = new Set(['command', 'args', 'env', 'url', 'type', 'headers'])
    for (const key of Object.keys(cfg)) {
      if (!allowedKeys.has(key)) {
        delete cfg[key]
      }
    }
  }

  const filePath = join(homedir(), '.claude.json')
  let existingData: any = { mcpServers: {} }

  if (existsSync(filePath)) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      existingData = JSON.parse(raw)
      if (!existingData.mcpServers) existingData.mcpServers = {}
    } catch (err) {
      console.error('Failed to parse existing .claude.json during import', err)
      existingData = { mcpServers: {} }
    }
  }

  // Merge validated servers
  for (const [name, config] of Object.entries(newServers)) {
    existingData.mcpServers[name] = config
  }

  // Write back
  await writeFile(filePath, JSON.stringify(existingData, null, 2), 'utf-8')

  return { success: true, count: Object.keys(newServers).length }
})
