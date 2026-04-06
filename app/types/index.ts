export type AgentModel = 'opus' | 'sonnet' | 'haiku'
export type AgentMemory = 'user' | 'project' | 'local' | 'none'
export type AgentTool = 'Read' | 'Grep' | 'Glob' | 'Bash' | 'Write' | 'Edit'

export interface AgentFrontmatter {
  name: string
  description: string
  model?: AgentModel
  color?: string
  memory?: AgentMemory
  skills?: string[]
  tools?: AgentTool[]
}

export interface Agent {
  slug: string
  filename: string
  directory: string
  frontmatter: AgentFrontmatter
  body: string
  hasMemory: boolean
  filePath: string
}

export interface CommandFrontmatter {
  name: string
  description: string
  'argument-hint'?: string
  'allowed-tools'?: string[]
}

export interface Command {
  slug: string
  filename: string
  directory: string
  frontmatter: CommandFrontmatter
  body: string
  filePath: string
}

export interface Settings {
  hooks?: Record<string, unknown[]>
  enabledPlugins?: Record<string, boolean>
  statusLine?: { type: string; command: string }
  alwaysThinkingEnabled?: boolean
  onboardingCompleted?: boolean
  guidanceSeen?: {
    agentDetail?: boolean
    explore?: boolean
    chat?: boolean
  }
  [key: string]: unknown
}

export type RelationshipType = 'spawns' | 'agent-frontmatter' | 'spawned-by'

export interface Relationship {
  sourceType: 'agent' | 'command' | 'skill' | 'plugin' | 'mcp'
  sourceSlug: string
  targetType: 'agent' | 'command' | 'skill' | 'plugin' | 'mcp'
  targetSlug: string
  type: RelationshipType
  evidence: string
}

export interface AgentPayload {
  frontmatter: AgentFrontmatter
  body: string
  directory?: string
}

export interface CommandPayload {
  frontmatter: CommandFrontmatter
  body: string
  directory?: string
}

export interface Plugin {
  id: string
  name: string
  marketplace: string
  description: string
  version: string
  enabled: boolean
  installedAt: string
  lastUpdated: string
  installPath: string
  skills: string[]
  author?: { name: string; email?: string }
}

export interface SkillFrontmatter {
  name: string
  description: string
  context?: string
  agent?: string
  [key: string]: unknown
}

export interface Skill {
  slug: string
  frontmatter: SkillFrontmatter
  body: string
  filePath: string
  source?: 'local' | 'github' | 'plugin'
  githubRepo?: string
  pluginName?: string
  mcpServer?: { name: string; scope: string }
  agents?: { name: string; slug: string }[]
}

export interface AgentSkill {
  slug: string
  frontmatter: SkillFrontmatter
  body: string
  filePath: string
  source: 'standalone' | 'plugin'
  pluginId?: string
  pluginName?: string
}

export interface SkillPayload {
  frontmatter: SkillFrontmatter
  body: string
}

// ── GitHub Imports ──────────────────────────────────

export interface ScannedSkill {
  slug: string
  name: string
  description: string
  category: string | null
  tags: string[]
  filePath: string
  hasSupporting: boolean
  conflict: boolean
}

export interface ScannedAgent {
  slug: string
  name: string
  description: string
  category: string | null
  filePath: string
  conflict: boolean
}

export interface SkillScanResult {
  owner: string
  repo: string
  branch: string
  targetPath: string
  skills: ScannedSkill[]
  totalSkills: number
  detectionMethod: 'frontmatter' | 'skills-index'
}

export interface AgentScanResult {
  owner: string
  repo: string
  branch: string
  targetPath: string
  agents: ScannedAgent[]
  totalAgents: number
  detectionMethod: 'frontmatter'
}

export interface GithubImport {
  owner: string
  repo: string
  url: string
  targetPath: string
  localPath: string
  importedAt: string
  lastChecked: string
  currentSha: string
  remoteSha: string
  selectedItems: string[]
  totalItems: number
}

export interface GithubImportsRegistry {
  imports: GithubImport[]
}

// ── Marketplace ─────────────────────────────────────

export interface AvailablePlugin {
  name: string
  description: string
  author?: { name: string; email?: string }
  skillCount: number
  commandCount: number
  installed: boolean
  marketplace: string
}

export interface MarketplaceSource {
  name: string
  sourceType: string
  sourceUrl: string
  lastUpdated: string
}

export interface MarketplaceData {
  marketplaces: Record<string, { plugins: AvailablePlugin[] }>
}

export interface PluginDetail extends Plugin {
  skillDetails: Skill[]
}

export interface SkillInvocation {
  skill: string
  args: string | null
}

export type WizardStep = 1 | 2 | 3

export interface WorkflowStep {
  id: string
  agentSlug: string
  label: string
}

export interface Workflow {
  slug: string
  name: string
  description: string
  steps: WorkflowStep[]
  createdAt: string
  lastRunAt?: string
  filePath: string
}

export interface WorkflowPayload {
  name: string
  description: string
  steps: WorkflowStep[]
}

export interface StepExecution {
  stepId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  input: string
  output: string
  error?: string
  startedAt?: number
  completedAt?: number
}

// ── Chat ──────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  timestamp: number
  toolCalls?: Array<{ id: string; toolName: string; input: any }>
  toolResults?: Array<{ id: string; toolName: string; result: any; isError?: boolean }>
}

export type StreamActivity =
  | { type: 'thinking' }
  | { type: 'tool'; name: string; elapsed: number }
  | { type: 'writing' }
  | null

// ── History ───────────────────────────────────────

export interface ToolCallRecord {
  toolName: string
  elapsed: number
  timestamp: number
}

export interface ConversationSession {
  id: string
  agentSlug: string
  messages: ChatMessage[]
  toolCalls: ToolCallRecord[]
  tokenUsage: { input: number; output: number }
  duration: number
  createdAt: string
}

export interface ConversationSummary {
  id: string
  agentSlug: string
  messageCount: number
  firstUserMessage: string
  createdAt: string
}

// ── CLI Terminal ──────────────────────────────────

export interface CliSession {
  id: string
  agentSlug?: string
  workingDir: string
  shell: string
  status: 'active' | 'idle' | 'terminated'
  createdAt: string
  lastActivity: string
  tokenUsage?: TokenUsage
  cost?: number
}

export interface TokenUsage {
  input: number
  output: number
  cached: number
  cacheCreation?: number
}

export interface CostBreakdown {
  total: number
  input: number
  output: number
  cached: number
}

export interface FileChange {
  path: string
  type: 'created' | 'modified' | 'deleted'
  timestamp: string
  size?: number
  diff?: string
}

export interface ToolCall {
  toolName: string
  timestamp: string
  elapsed?: number
  args?: any
  result?: any
  status: 'running' | 'success' | 'error'
}

export interface ContextMetrics {
  tokens: TokenUsage
  cost: CostBreakdown
  contextWindow: {
    used: number
    total: number
    percentage: number
  }
  files: {
    created: FileChange[]
    modified: FileChange[]
    deleted: FileChange[]
  }
  tools: ToolCall[]
}

export interface CliSettings {
  defaultShell: string
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  scrollback: number
  autoSave: boolean
}

// WebSocket message types
export type CliWebSocketMessage =
  | { type: 'execute'; sessionId?: string; agentSlug?: string; workingDir?: string; cols?: number; rows?: number }
  | { type: 'input'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'kill'; sessionId: string }

export type CliWebSocketEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'output'; data: string }
  | { type: 'context_update'; metrics: ContextMetrics }
  | { type: 'token_update'; tokens: Partial<TokenUsage> }
  | { type: 'file_change'; change: FileChange }
  | { type: 'tool_call'; tool: ToolCall }
  | { type: 'error'; error: string }
  | { type: 'exit'; exitCode: number }

// ── Claude Code Chat ──────────────────────────────────

export type NormalizedMessageKind =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'stream_delta'
  | 'stream_end'
  | 'complete'
  | 'error'
  | 'status'
  | 'session_created'
  // Chat v2 message kinds
  | 'permission_request'
  | 'permission_cancelled'
  | 'interactive_prompt'
  | 'task_notification'

export interface NormalizedMessage {
  kind: NormalizedMessageKind
  id: string
  sessionId: string
  timestamp: string
  role?: 'user' | 'assistant'
  content?: string
  toolName?: string
  toolInput?: any
  toolResult?: any
  isError?: boolean
  exitCode?: number
  stopReason?: string
  metadata?: Record<string, any>
  // Chat v2 extensions
  provider?: string
  images?: string[]
  toolId?: string
  canInterrupt?: boolean
  tokenBudget?: TokenBudget
  requestId?: string
  newSessionId?: string
  summary?: string
}

// ── Chat v2 Types ──────────────────────────────────────

export type PermissionMode = 'default' | 'skip' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface PendingPermission {
  id: string
  toolName: string
  toolInput: any
  sessionId: string
  receivedAt: string
  expiresAt: string
  message?: string
}

export interface TokenBudget {
  maxTokens?: number
  usedTokens?: number
  warningThreshold?: number
}

export interface Project {
  id: string
  name: string
  path: string
  sessionsCount: number
  lastActivity: string
  isStarred: boolean
}

export interface DisplayChatMessage {
  id: string
  kind: NormalizedMessageKind
  role?: 'user' | 'assistant'
  content?: string
  timestamp: string
  toolName?: string
  toolInput?: any
  toolResult?: any
  isError?: boolean
  thinking?: string
  images?: string[]
  permissionRequest?: PendingPermission
  taskProgress?: TaskProgress
  interactivePrompt?: InteractivePrompt
  isStreaming?: boolean
  provider?: string
  model?: string
}

export interface TaskProgress {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  message?: string
}

export interface InteractivePrompt {
  id: string
  question: string
  options?: string[]
  placeholder?: string
  multiline?: boolean
}

export interface ChatSession {
  id: string
  agentSlug?: string
  workingDir?: string
  messages: NormalizedMessage[]
  createdAt: string
  lastActivity: string
  status: 'active' | 'completed' | 'error'
  tokenUsage?: TokenUsage
  messageCount: number
}

export interface ChatSessionSummary {
  id: string
  agentSlug?: string
  messageCount: number
  firstUserMessage: string
  lastActivity: string
  createdAt: string
  status: 'active' | 'completed' | 'error'
}

// WebSocket message types for Chat
export type ChatWebSocketMessage =
  | { type: 'start'; message: string; sessionId?: string; agentSlug?: string; workingDir?: string }
  | { type: 'abort'; sessionId: string }

export type ChatWebSocketEvent =
  | NormalizedMessage
  | { type: 'connected'; sessionId?: string }
  | { type: 'disconnected' }

// ── Chat v2 WebSocket Types ──────────────────────────────────

export type ChatV2WebSocketMessage =
  | {
      type: 'start'
      message: string
      sessionId?: string
      agentSlug?: string
      workingDir?: string
      provider?: string
      permissionMode?: PermissionMode
      model?: string
      effort?: EffortLevel
      images?: string[]
    }
  | { type: 'abort'; sessionId: string }
  | { type: 'permission_response'; permissionId: string; decision: 'allow' | 'deny'; remember?: boolean }
  | { type: 'interactive_response'; promptId: string; value: string }

export type ChatV2WebSocketEvent =
  | NormalizedMessage
  | { type: 'connected'; sessionId?: string }
  | { type: 'disconnected' }
  | { type: 'permission_expired'; permissionId: string }

// ── Effort Level ────────────────────────────────────────

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

// ── Provider Types ──────────────────────────────────────

export interface ProviderQueryOptions {
  prompt: string
  sessionId?: string
  agentSlug?: string
  agentInstructions?: string
  workingDir?: string
  model?: string
  permissionMode?: PermissionMode
  effort?: EffortLevel
  images?: string[]
}

export interface ProviderFetchOptions {
  limit?: number
  offset?: number
  projectName?: string
  projectPath?: string
}

export interface ProviderFetchResult {
  messages: NormalizedMessage[]
  total: number
  hasMore: boolean
  tokenUsage?: TokenUsage
}

// ── Custom Provider Config ─────────────────────────────

export interface ProviderEntry {
  name: string
  displayName: string
  builtIn?: boolean
  baseUrl?: string
  authToken?: string
  modelMappings?: Partial<Record<'opus' | 'sonnet' | 'haiku', string>>
}

export interface ProviderConfig {
  defaultProvider: string
  providers: ProviderEntry[]
}
