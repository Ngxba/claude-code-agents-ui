import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parseFrontmatter } from '../../utils/frontmatter'
import { resolveClaudePath } from '../../utils/claudeDir'

/**
 * Built-in command handlers
 * Each returns { type: 'builtin', action: string, data: any }
 */
const builtInHandlers: Record<string, (args: string[], context: any) => Promise<any>> = {
  '/help': async () => ({
    type: 'builtin',
    action: 'help',
    data: {
      content: `# Claude Code Commands

## Built-in Commands
- **/help** — Show this help
- **/clear** — Clear conversation history
- **/model** — View or switch the current AI model
- **/cost** — Display token usage and cost
- **/memory** — Open CLAUDE.md memory file
- **/config** — Open settings
- **/status** — Show system status

## Custom Commands
Custom commands are loaded from:
- Project: \`.claude/commands/\`
- User: \`~/.claude/commands/\`

### Syntax
- \`$ARGUMENTS\` — all arguments joined
- \`$1\`, \`$2\`, etc. — positional arguments
`,
      format: 'markdown',
    },
  }),

  '/clear': async () => ({
    type: 'builtin',
    action: 'clear',
    data: { message: 'Conversation history cleared' },
  }),

  '/model': async (args, context) => ({
    type: 'builtin',
    action: 'model',
    data: {
      current: context?.model || 'sonnet',
      message: args.length > 0
        ? `Switching to model: ${args[0]}`
        : `Current model: ${context?.model || 'sonnet'}`,
    },
  }),

  '/cost': async (_args, context) => {
    const tokenUsage = context?.tokenUsage || {}
    const used = Number(tokenUsage.used ?? tokenUsage.totalUsed ?? 0) || 0
    const total = Number(tokenUsage.total ?? tokenUsage.contextWindow ?? 200000) || 200000
    const percentage = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0

    return {
      type: 'builtin',
      action: 'cost',
      data: {
        tokenUsage: { used, total, percentage },
        model: context?.model || 'sonnet',
      },
    }
  },

  '/status': async (_args, context) => {
    const uptime = process.uptime()
    const uptimeMinutes = Math.floor(uptime / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const uptimeFormatted = uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes % 60}m`
      : `${uptimeMinutes}m`

    return {
      type: 'builtin',
      action: 'status',
      data: {
        uptime: uptimeFormatted,
        model: context?.model || 'sonnet',
        nodeVersion: process.version,
        platform: process.platform,
      },
    }
  },

  '/memory': async (_args, context) => {
    const projectPath = context?.projectPath
    if (!projectPath) {
      return {
        type: 'builtin',
        action: 'memory',
        data: { error: true, message: 'No project selected' },
      }
    }

    const claudeMdPath = path.join(projectPath, 'CLAUDE.md')
    let exists = false
    try {
      await fs.access(claudeMdPath)
      exists = true
    } catch {}

    return {
      type: 'builtin',
      action: 'memory',
      data: {
        path: claudeMdPath,
        exists,
        message: exists
          ? `CLAUDE.md found at \`${claudeMdPath}\``
          : `CLAUDE.md not found at ${claudeMdPath}. Create it to store project-specific instructions.`,
      },
    }
  },

  '/config': async () => ({
    type: 'builtin',
    action: 'config',
    data: { message: 'Opening settings...' },
  }),
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { commandName, commandPath, args = [], context = {} } = body

  if (!commandName) {
    throw createError({ statusCode: 400, statusMessage: 'Command name is required' })
  }

  // Handle built-in commands
  const handler = builtInHandlers[commandName]
  if (handler) {
    const result = await handler(args, context)
    return { ...result, command: commandName }
  }

  // Handle custom commands — need commandPath
  if (!commandPath) {
    throw createError({ statusCode: 400, statusMessage: 'Command path is required for custom commands' })
  }

  // Security: validate path is within allowed directories
  const resolvedPath = path.resolve(commandPath)
  const userBase = path.resolve(path.join(os.homedir(), '.claude', 'commands'))
  const claudeDir = resolveClaudePath()
  const skillsBase = path.resolve(path.join(claudeDir, 'skills'))

  const isUnder = (base: string) => {
    const rel = path.relative(base, resolvedPath)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  }

  if (!isUnder(userBase) && !isUnder(skillsBase)) {
    // Also check project-level commands if projectPath provided
    if (context.projectPath) {
      const projectBase = path.resolve(path.join(context.projectPath, '.claude', 'commands'))
      if (!isUnder(projectBase)) {
        throw createError({ statusCode: 403, statusMessage: 'Access denied: command must be in .claude/commands or .claude/skills directory' })
      }
    } else {
      throw createError({ statusCode: 403, statusMessage: 'Access denied: command must be in .claude/commands or .claude/skills directory' })
    }
  }

  // Read and parse the command file
  const content = await fs.readFile(commandPath, 'utf8')
  const { body: commandContent } = parseFrontmatter(content)

  // Argument replacement
  let processedContent = commandContent || ''

  // Replace $ARGUMENTS with all arguments joined
  const argsString = args.join(' ')
  processedContent = processedContent.replace(/\$ARGUMENTS/g, argsString)

  // Replace $1, $2, etc. with positional arguments
  args.forEach((arg: string, index: number) => {
    const placeholder = `$${index + 1}`
    processedContent = processedContent.replace(new RegExp(`\\${placeholder}\\b`, 'g'), arg)
  })

  return {
    type: 'custom',
    command: commandName,
    content: processedContent,
  }
})
