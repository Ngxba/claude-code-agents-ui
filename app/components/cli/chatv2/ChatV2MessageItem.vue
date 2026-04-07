<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'
import { renderMarkdownWithHighlighting } from '~/utils/markdown'
import { formatContent } from '~/utils/messageFormatting'

const props = defineProps<{
  message: DisplayChatMessage
  showTimestamp?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean, updatedInput?: any): void
  (e: 'openFile', filePath: string): void
}>()

// Collapsible states
const showThinking = ref(false)
const showToolDetails = ref(false)
const showAskUserHistory = ref(false)
const copied = ref(false)

// Format and render content (async for Shiki highlighting)
const renderedContent = ref('')

watchEffect(async () => {
  if (!props.message.content) {
    renderedContent.value = ''
    return
  }
  const formatted = formatContent(props.message.content)
  renderedContent.value = await renderMarkdownWithHighlighting(formatted)
})

// Extract filename from tool input
const toolFileName = computed(() => {
  if (!props.message.toolInput) return null

  // Common patterns for file paths in tool inputs
  const input = props.message.toolInput
  const toolName = (props.message.toolName || '').toLowerCase()
  const isFileTool = ['read', 'write', 'edit', 'glob', 'grep', 'applypatch', 'replace', 'write_file', 'read_file', 'glob_search'].includes(toolName)
  
  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    // Try to extract known fields via regex if JSON is partial
    // Support file_path, path, filePath, filename, pattern, file
    // Lenient regex: don't require the closing quote so it works while streaming
    const filePathMatch = raw.match(/"(?:file_path|path|filePath|filename|pattern|file)"\s*:\s*"([^"]*)"?/)
    if (filePathMatch && filePathMatch[1]) return filePathMatch[1]
    
    // Fallback: if the whole thing is just a string in quotes AND it's a file tool
    const stringMatch = raw.match(/^\s*"([^"]*)"?\s*$/)
    if (stringMatch && stringMatch[1] && isFileTool) return stringMatch[1]

    return null
  }

  if (typeof input === 'string' && isFileTool) return input
  if (typeof input === 'object') {
    return input.file_path || input.path || input.filePath || input.filename || input.pattern || input.file || null
  }
  return null
})

// Get just the filename from full path
const displayFileName = computed(() => {
  if (!toolFileName.value) return null
  const parts = toolFileName.value.split('/')
  return parts[parts.length - 1]
})

// Copy message content
async function copyContent() {
  if (!props.message.content) return
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

// Handle file click
function handleFileClick() {
  const filePath = toolFileName.value || planFilePath.value
  if (filePath) {
    emit('openFile', filePath)
  }
}

// Permission decision state — derived from store-persisted message fields
const permissionDecision = computed(() => props.message.resolvedDecision ?? null)
const submittedAnswer = computed(() => props.message.resolvedAnswer ?? null)

// Check if this is an AskUserQuestion tool
const isAskUserQuestion = computed(() => {
  const tn = props.message.toolName?.toLowerCase() || ''
  return ['askuserquestion', 'ask_user', 'askuser', 'ask_user_question', 'prompt', 'input_request'].includes(tn)
})

// Parse AskUserQuestion input into structured data
interface AskUserQuestionItem {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

const askUserQuestions = computed<AskUserQuestionItem[] | null>(() => {
  if (!isAskUserQuestion.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // If input is just a string, wrap it
  if (typeof input === 'string') {
    return [{ question: input }]
  }

  // If it's the standard structured format from claudecodeui or Gemini
  if (input.questions && Array.isArray(input.questions)) {
    return input.questions
  }

  // Single question format variants
  const question = input.question || input.message || input.prompt || input.text || input.content
  if (question) {
    return [{
      question: typeof question === 'string' ? question : JSON.stringify(question),
      header: input.header || input.title,
      options: input.options || input.choices,
      multiSelect: input.multiSelect || input.multiple || false,
    }]
  }

  // Fallback: if it's an object but we don't recognize the fields, use the first string field or stringify
  const firstStringField = Object.values(input).find(v => typeof v === 'string')
  if (firstStringField) {
    return [{ question: firstStringField as string }]
  }

  return [{ question: JSON.stringify(input) }]
})

// Track selected answers for AskUserQuestion (per question index -> selected option labels)
const selectedAnswers = ref<Map<number, Set<string>>>(new Map())

function toggleAnswer(questionIndex: number, optionLabel: string, multiSelect: boolean) {
  const current = selectedAnswers.value.get(questionIndex) ?? new Set<string>()
  if (multiSelect) {
    if (current.has(optionLabel)) {
      current.delete(optionLabel)
    } else {
      current.add(optionLabel)
    }
  } else {
    current.clear()
    current.add(optionLabel)
  }
  selectedAnswers.value.set(questionIndex, current)
  // Force reactivity
  selectedAnswers.value = new Map(selectedAnswers.value)

  // For single-select with only one question, auto-submit on selection
  if (!multiSelect && askUserQuestions.value && askUserQuestions.value.length === 1) {
    handlePermissionAllow(false)
  }
}

function isAnswerSelected(questionIndex: number, optionLabel: string): boolean {
  return selectedAnswers.value.get(questionIndex)?.has(optionLabel) ?? false
}

// Check if a specific option label is part of the submittedAnswer string
function isOptionSubmitted(optionLabel: string): boolean {
  if (!submittedAnswer.value) return false
  const labels = submittedAnswer.value.split(',').map(s => s.trim())
  return labels.includes(optionLabel)
}

// Check if any answer has been selected
const hasSelectedAnswer = computed(() => {
  if (!askUserQuestions.value) return false
  for (let i = 0; i < askUserQuestions.value.length; i++) {
    const selected = selectedAnswers.value.get(i)
    if (selected && selected.size > 0) return true
  }
  return false
})

// Build updatedInput with answers for AskUserQuestion
// The SDK expects `answers` as { [questionText]: "selected label" } (comma-separated for multi-select)
function buildUpdatedInput(): any {
  if (!isAskUserQuestion.value || !askUserQuestions.value) return undefined
  const questions = askUserQuestions.value
  const answers: Record<string, string> = {}
  for (let i = 0; i < questions.length; i++) {
    const selected = selectedAnswers.value.get(i)
    if (selected && selected.size > 0) {
      answers[questions[i].question] = Array.from(selected).join(', ')
    }
  }

  // Handle both object and string input
  const baseInput = typeof props.message.toolInput === 'object'
    ? JSON.parse(JSON.stringify(props.message.toolInput))
    : { question: props.message.toolInput }

  return {
    ...baseInput,
    answers,
  }
}

// Handle permission response
// Decision state is persisted by useChatV2Handler.respondToPermission -> sessionStore.updateMessageDecision
function handlePermissionAllow(remember = false) {
  const permId = props.message.requestId || props.message.id
  if (permId) {
    const updatedInput = buildUpdatedInput()
    emit('permissionRespond', permId, 'allow', remember, updatedInput)
  }
}

function handlePermissionDeny() {
  const permId = props.message.requestId || props.message.id
  if (permId) {
    emit('permissionRespond', permId, 'deny', false)
  }
}

// Get tool icon based on tool name
function getToolIcon(toolName: string): string {
  const tn = toolName.toLowerCase()
  if (tn.includes('read')) return 'i-lucide-file-text'
  if (tn.includes('write')) return 'i-lucide-file-plus'
  if (tn.includes('edit') || tn.includes('replace')) return 'i-lucide-file-edit'
  if (tn.includes('bash') || tn.includes('shell')) return 'i-lucide-terminal'
  if (tn.includes('glob')) return 'i-lucide-search'
  if (tn.includes('grep')) return 'i-lucide-search-code'
  if (tn.includes('fetch')) return 'i-lucide-globe'
  if (tn.includes('search')) return 'i-lucide-search'
  if (tn.includes('task')) return 'i-lucide-list-todo'
  
  return 'i-lucide-wrench'
}

// Get tool color
function getToolColor(toolName: string): string {
  const tn = toolName.toLowerCase()
  if (tn.includes('read')) return '#3b82f6'
  if (tn.includes('write')) return '#22c55e'
  if (tn.includes('edit') || tn.includes('replace')) return '#f59e0b'
  if (tn.includes('bash') || tn.includes('shell')) return '#8b5cf6'
  if (tn.includes('glob') || tn.includes('grep')) return '#06b6d4'
  if (tn.includes('todo')) return '#22c55e'
  
  return 'var(--accent)'
}

// Check if this is a TodoWrite tool
const isTodoWrite = computed(() => (props.message.toolName || '').toLowerCase() === 'todowrite')

// Check if this is a Skill tool
const isSkill = computed(() => (props.message.toolName || '').toLowerCase() === 'skill')

// Get skill name from input
const skillName = computed(() => {
  if (!isSkill.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const skillMatch = raw.match(/"skill"\s*:\s*"([^"]*)"/)
    if (skillMatch) return skillMatch[1]
    return null
  }

  return input.skill || null
})

// Check if this is an Agent tool
const isAgent = computed(() => (props.message.toolName || '').toLowerCase() === 'agent')

// Get agent details from input
const agentSubtype = computed(() => {
  if (!isAgent.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"subagent_type"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.subagent_type || null
})

const agentDescription = computed(() => {
  if (!isAgent.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"description"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.description || null
})

const agentPrompt = computed(() => {
  if (!isAgent.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"prompt"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.prompt || null
})

// Render agent prompt as markdown
const renderedAgentPrompt = ref('')
const showAgentPrompt = ref(false)

watchEffect(async () => {
  if (!agentPrompt.value) {
    renderedAgentPrompt.value = ''
    return
  }
  renderedAgentPrompt.value = await renderMarkdownWithHighlighting(agentPrompt.value)
})

// Check if this is a Task tool (TaskCreate, TaskUpdate, TaskGet, TaskList)
const isTask = computed(() => {
  const name = (props.message.toolName || '').toLowerCase()
  return name.startsWith('task')
})

// Get task action (Create, Update, Get, List)
const taskAction = computed(() => {
  if (!isTask.value) return null
  const name = props.message.toolName || ''
  if (name.toLowerCase().startsWith('task')) {
    return name.slice(4) // Keep original casing for the action part (e.g. Create)
  }
  return name
})

// Get task details from input
const taskSubject = computed(() => {
  if (!isTask.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"subject"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.subject || null
})

const taskDescription = computed(() => {
  if (!isTask.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"description"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.description || null
})

const taskActiveForm = computed(() => {
  if (!isTask.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"activeForm"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.activeForm || null
})

const taskStatus = computed(() => {
  if (!isTask.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"status"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.status || null
})

const taskId = computed(() => {
  if (!isTask.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const match = raw.match(/"taskId"\s*:\s*"([^"]*)"/)
    if (match) return match[1]
    return null
  }

  return input.taskId || null
})

// Task status styling
function getTaskStatusStyle(status: string): { bg: string; color: string; icon: string } {
  const s = status.toLowerCase()
  switch (s) {
    case 'completed':
      return { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', icon: 'i-lucide-check-circle-2' }
    case 'in_progress':
      return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', icon: 'i-lucide-loader-2' }
    case 'cancelled':
      return { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', icon: 'i-lucide-x-circle' }
    default:
      return { bg: 'var(--surface-raised)', color: 'var(--text-tertiary)', icon: 'i-lucide-circle' }
  }
}

// Task action color
function getTaskActionColor(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('create')) return '#22c55e'
  if (a.includes('update')) return '#3b82f6'
  if (a.includes('get')) return '#06b6d4'
  if (a.includes('list')) return '#8b5cf6'
  return 'var(--accent)'
}

// Check if this is a Bash tool
const isBash = computed(() => (props.message.toolName || '').toLowerCase() === 'bash')

// Get bash command and description
const bashCommand = computed(() => {
  if (!isBash.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const commandMatch = raw.match(/"command"\s*:\s*"([^"]*)"/)
    if (commandMatch) return commandMatch[1]
    return null
  }

  return input.command || null
})

const bashDescription = computed(() => {
  if (!isBash.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const descMatch = raw.match(/"description"\s*:\s*"([^"]*)"/)
    if (descMatch) return descMatch[1]
    return null
  }

  return input.description || null
})

// Check if this is a ToolSearch tool
const isToolSearch = computed(() => (props.message.toolName || '').toLowerCase() === 'toolsearch')

// Get tool search query
const toolSearchQuery = computed(() => {
  if (!isToolSearch.value || !props.message.toolInput) return null
  const input = props.message.toolInput

  // Handle partial JSON from streaming
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const queryMatch = raw.match(/"query"\s*:\s*"([^"]*)"/)
    if (queryMatch) return queryMatch[1]
    return null
  }

  return input.query || null
})

// Check if this is an ExitPlanMode tool
const isExitPlanMode = computed(() => (props.message.toolName || '').toLowerCase() === 'exitplanmode')

// Get plan content and path
const planContent = computed(() => props.message.toolInput?.plan || '')
const planFilePath = computed(() => props.message.toolInput?.planFilePath || '')
const planFileName = computed(() => {
  const p = planFilePath.value
  return p ? p.split('/').pop() || p : ''
})

// Render plan as markdown
const renderedPlan = ref('')
const showPlan = ref(false)

watchEffect(async () => {
  if (!planContent.value) {
    renderedPlan.value = ''
    return
  }
  renderedPlan.value = await renderMarkdownWithHighlighting(planContent.value)
})

// Parse todo items from TodoWrite input
interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

const todoItems = computed<TodoItem[]>(() => {
  if (!isTodoWrite.value || !props.message.toolInput) return []

  const input = props.message.toolInput
  if (input.todos && Array.isArray(input.todos)) {
    return input.todos
  }
  return []
})

// Get status icon for todo item
function getTodoStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return 'i-lucide-check-circle-2'
    case 'in_progress': return 'i-lucide-clock'
    default: return 'i-lucide-circle'
  }
}

// Get status color for todo item
function getTodoStatusColor(status: string): string {
  switch (status) {
    case 'completed': return '#22c55e'
    case 'in_progress': return '#3b82f6'
    default: return 'var(--text-tertiary)'
  }
}

// Get status badge style
function getTodoStatusBadge(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', label: 'completed' }
    case 'in_progress':
      return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'in progress' }
    default:
      return { bg: 'var(--surface-raised)', color: 'var(--text-tertiary)', label: 'pending' }
  }
}
</script>

<template>
  <div class="message-item max-w-full min-w-0">
    <!-- User Message - shouldn't appear here since handled by parent, but just in case -->
    <template v-if="message.role === 'user'">
      <div v-if="message.images && message.images.length > 0" class="flex flex-wrap gap-2 mb-2">
        <img v-for="(img, i) in message.images" :key="i" :src="img" class="max-w-[200px] max-h-[200px] rounded object-contain border" style="border-color: var(--border-subtle);" />
      </div>
      <div v-if="message.content" class="text-[13px] whitespace-pre-wrap break-words" style="color: var(--text-primary);">
        {{ message.content }}
      </div>
    </template>

    <!-- Assistant Text Message -->
    <template v-else-if="message.kind === 'text' && message.content">
      <div class="group relative">
        <div
          class="prose prose-sm max-w-none text-[13px] leading-relaxed break-words"
          style="color: var(--text-primary);"
          v-html="renderedContent"
        />

        <!-- Streaming cursor -->
        <span
          v-if="message.isStreaming"
          class="inline-block w-0.5 h-4 ml-0.5 animate-pulse rounded-full"
          style="background: var(--accent);"
        />

        <!-- Copy button - appears on hover -->
        <button
          v-if="message.content && !message.isStreaming"
          class="absolute -top-1 right-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style="background: var(--surface-raised);"
          title="Copy to clipboard"
          @click="copyContent"
        >
          <UIcon
            :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            class="size-3.5"
            :style="{ color: copied ? '#22c55e' : 'var(--text-tertiary)' }"
          />
        </button>
      </div>
    </template>

    <!-- Thinking Block - Compact inline style -->
    <template v-else-if="message.kind === 'thinking'">
      <button
        class="inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1 rounded-lg text-[11px] md:text-[12px] transition-all"
        style="background: var(--surface-raised); color: var(--text-secondary);"
        @click="showThinking = !showThinking"
      >
        <UIcon
          :name="showThinking ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3"
        />
        <UIcon name="i-lucide-sparkles" class="size-3" style="color: #8b5cf6;" />
        <span>Thinking...</span>
      </button>

      <div
        v-if="showThinking"
        class="mt-2 p-2 md:p-3 rounded-lg text-[11px] md:text-[12px] whitespace-pre-wrap break-words"
        style="background: var(--surface-raised); color: var(--text-tertiary); border-left: 2px solid #8b5cf6;"
      >
        {{ message.thinking || message.content }}
      </div>
    </template>

    <!-- Bash - Terminal style command display -->
    <template v-else-if="message.kind === 'tool_use' && isBash && bashCommand">
      <div class="space-y-1">
        <!-- Terminal box -->
        <div
          class="relative rounded-lg overflow-hidden"
          style="background: #1a1b26;"
        >
          <!-- Terminal icon -->
          <div
            class="absolute top-2 left-2 size-3.5 md:size-4 rounded flex items-center justify-center"
            style="background: #3b82f6;"
          >
            <UIcon name="i-lucide-terminal" class="size-2 md:size-2.5" style="color: white;" />
          </div>

          <!-- Command -->
          <div class="px-3 md:px-4 py-2 md:py-3 pl-8 md:pl-9 font-mono text-[11px] md:text-[12px] break-all" style="color: #9ece6a;">
            <span style="color: #7aa2f7;">$</span> {{ bashCommand }}
          </div>
        </div>

        <!-- Description -->
        <p v-if="bashDescription" class="text-[11px] px-1 italic break-words" style="color: var(--text-tertiary);">
          {{ bashDescription }}
        </p>

        <!-- Expandable output (if there's a result) -->
        <button
          v-if="message.toolResult"
          class="inline-flex items-center gap-1.5 text-[11px] px-1"
          style="color: var(--text-tertiary);"
          @click="showToolDetails = !showToolDetails"
        >
          <UIcon
            :name="showToolDetails ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-3"
          />
          <span>{{ showToolDetails ? 'Hide output' : 'Show output' }}</span>
        </button>

        <!-- Output -->
        <div
          v-if="showToolDetails && message.toolResult"
          class="rounded-lg overflow-x-auto max-h-48 max-w-full font-mono text-[11px] p-3"
          style="background: #1a1b26; color: #a9b1d6;"
        >
          <pre class="whitespace-pre-wrap break-all">{{ typeof message.toolResult === 'string' ? message.toolResult : JSON.stringify(message.toolResult, null, 2) }}</pre>
        </div>
      </div>
    </template>

    <!-- TodoWrite - Collapsible formatted todo list -->
    <template v-else-if="message.kind === 'tool_use' && isTodoWrite && todoItems.length > 0">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          style="background: #22c55e;"
        />

        <div class="flex-1 min-w-0">
          <!-- Header (clickable to expand/collapse) -->
          <button
            class="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style="color: var(--text-secondary);"
            @click="showToolDetails = !showToolDetails"
          >
            <UIcon
              :name="showToolDetails ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <span>TodoWrite</span>
            <span style="color: var(--text-tertiary);">/</span>
            <span style="color: #22c55e;">Updating todo list</span>
            <span class="text-[10px] ml-1" style="color: var(--text-tertiary);">
              ({{ todoItems.length }} items)
            </span>
          </button>

          <!-- Todo Items List (collapsible) -->
          <div v-if="showToolDetails" class="mt-2 space-y-1">
            <div
              v-for="(todo, index) in todoItems"
              :key="index"
              class="flex items-center gap-2 px-3 py-2 rounded-lg"
              style="background: var(--surface-raised);"
            >
              <!-- Status Icon -->
              <UIcon
                :name="getTodoStatusIcon(todo.status)"
                class="size-4 shrink-0"
                :style="{ color: getTodoStatusColor(todo.status) }"
              />

              <!-- Todo Content -->
              <span
                class="flex-1 text-[12px] break-words"
                :style="{
                  color: todo.status === 'completed' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                }"
              >
                {{ todo.content }}
              </span>

              <!-- Status Badge -->
              <span
                class="px-2 py-0.5 rounded text-[10px] font-medium"
                :style="{
                  background: getTodoStatusBadge(todo.status).bg,
                  color: getTodoStatusBadge(todo.status).color,
                }"
              >
                {{ getTodoStatusBadge(todo.status).label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Tool Use - Read show filename only, Glob shows pattern, ToolSearch shows query (non-clickable) -->
    <template v-else-if="message.kind === 'tool_use' && ['read', 'glob', 'toolsearch', 'read_file', 'glob_search'].includes((message.toolName || '').toLowerCase())">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          :style="{ background: getToolColor(message.toolName || 'unknown') }"
        />

        <div class="flex-1 min-w-0">
          <div class="text-[12px] flex items-center gap-2 flex-wrap">
            <span style="color: var(--text-secondary);">{{ message.toolName }}</span>

            <!-- Clickable filename for Read -->
            <template v-if="['read', 'read_file'].includes((message.toolName || '').toLowerCase()) && displayFileName">
              <span style="color: var(--text-tertiary);">/</span>
              <span
                class="font-medium cursor-pointer hover:underline break-all"
                :style="{ color: getToolColor(message.toolName || 'unknown') }"
                @click.stop="handleFileClick"
                :title="toolFileName"
              >
                {{ displayFileName }}
              </span>
            </template>

            <!-- Non-clickable pattern for Glob -->
            <template v-else-if="['glob', 'glob_search'].includes((message.toolName || '').toLowerCase()) && toolFileName">
              <span style="color: var(--text-tertiary);">:</span>
              <span class="font-mono text-[11px] text-meta break-all" :title="toolFileName">
                {{ toolFileName }}
              </span>
            </template>

            <!-- Non-clickable query for ToolSearch -->
            <template v-else-if="['toolsearch', 'tool_search'].includes((message.toolName || '').toLowerCase()) && toolSearchQuery">
              <span style="color: var(--text-tertiary);">/</span>
              <span class="font-medium break-all" style="color: var(--text-accent);">
                {{ toolSearchQuery }}
              </span>
            </template>

            <!-- Error badge -->
            <span
              v-if="message.isError"
              class="px-1.5 py-0.5 rounded text-[10px]"
              style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
            >
              Error
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Agent - Show subagent_type / description with expandable prompt -->
    <template v-else-if="message.kind === 'tool_use' && isAgent">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          style="background: #f59e0b;"
        />

        <div class="flex-1 min-w-0">
          <!-- Header (clickable to expand/collapse prompt) -->
          <button
            class="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style="color: var(--text-secondary);"
            @click="showAgentPrompt = !showAgentPrompt"
          >
            <UIcon
              :name="showAgentPrompt ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <span>Agent</span>
            <template v-if="agentSubtype">
              <span style="color: var(--text-tertiary);">/</span>
              <span style="color: #f59e0b;">{{ agentSubtype }}</span>
            </template>
            <template v-if="agentDescription">
              <span style="color: var(--text-tertiary);">/</span>
              <span class="break-all" style="color: var(--text-secondary);">{{ agentDescription }}</span>
            </template>
          </button>

          <!-- Expandable prompt rendered as markdown -->
          <div
            v-if="showAgentPrompt && renderedAgentPrompt"
            class="mt-2 p-3 rounded-lg text-[12px] break-words"
            style="background: var(--surface-raised); border-left: 2px solid #f59e0b;"
          >
            <div
              class="prose prose-sm max-w-none leading-relaxed"
              style="color: var(--text-secondary);"
              v-html="renderedAgentPrompt"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- ExitPlanMode - Show plan path with collapsible plan content -->
    <template v-else-if="message.kind === 'tool_use' && isExitPlanMode">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          style="background: var(--accent-secondary);"
        />

        <div class="flex-1 min-w-0">
          <!-- Header (clickable to expand/collapse plan) -->
          <button
            class="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style="color: var(--text-secondary);"
            @click="showPlan = !showPlan"
          >
            <UIcon
              :name="showPlan ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <span>ExitPlanMode</span>
            <template v-if="planFilePath">
              <span style="color: var(--text-tertiary);">/</span>
              <span
                class="truncate cursor-pointer hover:underline"
                style="color: var(--text-indigo);"
                :title="planFilePath"
                @click.stop="handleFileClick"
              >{{ planFileName }}</span>
            </template>
          </button>

          <!-- Expandable plan rendered as markdown -->
          <div
            v-if="showPlan && renderedPlan"
            class="mt-2 p-3 rounded-lg text-[12px] break-words border border-dashed"
            style="background: var(--surface-raised); border-color: var(--accent);"
          >
            <div
              class="prose prose-sm max-w-none leading-relaxed"
              style="color: var(--text-primary);"
              v-html="renderedPlan"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- Skill - Show skill name -->
    <template v-else-if="message.kind === 'tool_use' && isSkill">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          style="background: #a78bfa;"
        />

        <div class="flex-1 min-w-0">
          <div class="text-[12px] flex items-center gap-2 flex-wrap">
            <span style="color: var(--text-secondary);">Skill</span>
            <template v-if="skillName">
              <span style="color: var(--text-tertiary);">/</span>
              <span class="font-medium break-all" style="color: #a78bfa;">
                {{ skillName }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- Task tools - TaskCreate, TaskUpdate, TaskGet, TaskList -->
    <template v-else-if="message.kind === 'tool_use' && isTask">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          :style="{ background: getTaskActionColor(taskAction || '') }"
        />

        <div class="flex-1 min-w-0">
          <!-- TaskCreate: show subject + description -->
          <template v-if="taskAction === 'Create'">
            <div class="space-y-1">
              <div class="text-[12px] flex items-center gap-1.5 flex-wrap">
                <UIcon name="i-lucide-circle-plus" class="size-3.5" style="color: #22c55e;" />
                <span class="font-medium" style="color: var(--text-secondary);">New Task</span>
                <template v-if="taskSubject">
                  <span style="color: var(--text-tertiary);">&mdash;</span>
                  <span class="break-all" style="color: var(--text-primary);">{{ taskSubject }}</span>
                </template>
              </div>
              <div v-if="taskDescription" class="text-[11px] pl-5 break-words" style="color: var(--text-tertiary);">
                {{ taskDescription }}
              </div>
              <div
                v-if="taskActiveForm"
                class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ml-5"
                style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;"
              >
                <UIcon name="i-lucide-loader-2" class="size-2.5 animate-spin" />
                {{ taskActiveForm }}
              </div>
            </div>
          </template>

          <!-- TaskUpdate: show taskId + status change -->
          <template v-else-if="taskAction === 'Update'">
            <div class="text-[12px] flex items-center gap-1.5 flex-wrap">
              <UIcon
                :name="taskStatus ? getTaskStatusStyle(taskStatus).icon : 'i-lucide-refresh-cw'"
                class="size-3.5"
                :class="{ 'animate-spin': taskStatus === 'in_progress' }"
                :style="{ color: taskStatus ? getTaskStatusStyle(taskStatus).color : '#3b82f6' }"
              />
              <span class="font-medium" style="color: var(--text-secondary);">Task {{ taskId }}</span>
              <template v-if="taskStatus">
                <span
                  class="px-2 py-0.5 rounded-full text-[10px] font-medium"
                  :style="{
                    background: getTaskStatusStyle(taskStatus).bg,
                    color: getTaskStatusStyle(taskStatus).color,
                  }"
                >
                  {{ taskStatus.replace('_', ' ') }}
                </span>
              </template>
            </div>
          </template>

          <!-- TaskGet / TaskList: simple display -->
          <template v-else>
            <div class="text-[12px] flex items-center gap-1.5">
              <UIcon
                :name="taskAction === 'List' ? 'i-lucide-list' : 'i-lucide-search'"
                class="size-3.5"
                :style="{ color: getTaskActionColor(taskAction || '') }"
              />
              <span style="color: var(--text-secondary);">{{ message.toolName }}</span>
              <template v-if="taskId">
                <span style="color: var(--text-tertiary);">/</span>
                <span style="color: var(--text-primary);">Task {{ taskId }}</span>
              </template>
            </div>
          </template>
        </div>
      </div>
    </template>

    <template v-else-if="message.kind === 'tool_use'">
      <div class="flex items-start gap-2 min-w-0 overflow-hidden">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          :style="{ background: getToolColor(message.toolName || 'unknown') }"
        />

        <div class="flex-1 min-w-0">
          <!-- Tool header (clickable only if not Edit/Write or if Error) -->
          <component
            :is="(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError) ? 'div' : 'button'"
            class="inline-flex items-center gap-1.5 text-[12px] font-medium w-full text-left"
            :class="{ 'cursor-default': (['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError) }"
            style="color: var(--text-secondary);"
            @click="(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError) ? null : showToolDetails = !showToolDetails"
          >
            <UIcon
              v-if="!(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError)"
              :name="showToolDetails ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <span>{{ message.toolName }}</span>

            <!-- Clickable filename -->
            <template v-if="displayFileName">
              <span style="color: var(--text-tertiary);">/</span>
              <span
                class="font-medium cursor-pointer hover:underline break-all"
                :style="{ color: getToolColor(message.toolName || 'unknown') }"
                @click.stop="handleFileClick"
              >
                {{ displayFileName }}
              </span>
            </template>

            <!-- Error badge -->
            <span
              v-if="message.isError"
              class="px-1.5 py-0.5 rounded text-[10px] ml-1"
              style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
            >
              Error
            </span>
          </component>

          <!-- Diff viewer for Edit/Write tools (only when diff data exists) -->
          <div v-if="['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError && toolFileName && (message.toolInput?.old_string !== undefined || message.toolInput?.new_string !== undefined)" class="mt-1">
            <ToolDiffViewer
              :file-path="toolFileName"
              :old-content="message.toolInput?.old_string"
              :new-content="message.toolInput?.new_string"
              @file-click="handleFileClick"
            />
          </div>

          <!-- Expanded details (only for non-Edit/Write or errors) -->
          <div v-if="showToolDetails && !(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'].includes((message.toolName || '').toLowerCase()) && !message.isError)" class="mt-2 space-y-2 max-w-full overflow-hidden">
            <!-- Input -->
            <div v-if="message.toolInput">
              <div class="text-[10px] font-medium mb-1" style="color: var(--text-tertiary);">Input</div>
              <pre
                class="text-[11px] p-2 rounded-lg overflow-x-auto max-h-48 max-w-full font-mono whitespace-pre-wrap break-all"
                style="background: var(--surface-base); color: var(--text-secondary);"
              >{{ JSON.stringify(message.toolInput, null, 2) }}</pre>
            </div>

            <!-- Result -->
            <div v-if="message.toolResult">
              <div class="text-[10px] font-medium mb-1" style="color: var(--text-tertiary);">Result</div>
              <pre
                class="text-[11px] p-2 rounded-lg overflow-x-auto max-h-48 max-w-full font-mono whitespace-pre-wrap break-all"
                :style="{
                  background: 'var(--surface-base)',
                  color: message.isError ? '#ef4444' : 'var(--text-secondary)',
                }"
              >{{ typeof message.toolResult === 'string' ? message.toolResult : JSON.stringify(message.toolResult, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Permission Request -->
    <template v-else-if="message.kind === 'permission_request'">
      <!-- After decision: show compact result -->
      <div v-if="permissionDecision" class="flex flex-col gap-1.5 py-1">
        <!-- Collapsible AskUserQuestion History -->
        <template v-if="isAskUserQuestion && askUserQuestions">
          <button
            class="flex items-start gap-1.5 text-[11px] md:text-[12px] w-full text-left"
            style="color: var(--text-secondary);"
            @click="showAskUserHistory = !showAskUserHistory"
          >
            <UIcon
              :name="showAskUserHistory ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3 mt-0.5 shrink-0"
            />
            <span class="font-medium flex-1 whitespace-normal">{{ askUserQuestions[0].question }}</span>
            <span v-if="askUserQuestions.length > 1" class="text-[10px] shrink-0" style="color: var(--text-tertiary);">
              (+{{ askUserQuestions.length - 1 }} more)
            </span>
          </button>

          <!-- Expanded View: Questions + Options -->
          <div v-if="showAskUserHistory" class="mt-1 space-y-3 pl-4 border-l-2 border-accent/20">
            <div v-for="(q, qi) in askUserQuestions" :key="qi">
              <p v-if="q.header" class="text-[11px] font-bold mb-0.5 whitespace-normal" style="color: var(--text-primary);">
                {{ q.header }}
              </p>
              <p class="text-[11px] md:text-[12px] mb-1.5 whitespace-normal" style="color: var(--text-secondary);">
                {{ q.question }}
              </p>
              
              <!-- Show original options if available -->
              <div v-if="q.options && q.options.length" class="space-y-1">
                <div
                  v-for="(opt, oi) in q.options"
                  :key="oi"
                  class="flex items-start gap-2 px-2 py-1 rounded text-[11px]"
                  :style="{
                    background: isOptionSubmitted(opt.label) ? 'rgba(229, 169, 62, 0.1)' : 'var(--surface-raised)',
                    border: isOptionSubmitted(opt.label) ? '1px solid var(--accent)' : '1px solid transparent',
                  }"
                >
                  <UIcon
                    :name="isOptionSubmitted(opt.label) ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
                    class="size-3 mt-0.5 shrink-0"
                    :style="{ color: isOptionSubmitted(opt.label) ? 'var(--accent)' : 'var(--text-tertiary)' }"
                  />
                  <div class="min-w-0 flex-1">
                    <span class="whitespace-normal" :style="{ color: isOptionSubmitted(opt.label) ? 'var(--text-primary)' : 'var(--text-secondary)' }">
                      {{ opt.label }}
                    </span>
                    <p v-if="opt.description" class="text-[10px] opacity-70 whitespace-normal" style="color: var(--text-tertiary);">
                      {{ opt.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Status Line -->
        <div class="flex items-start gap-2" :class="{ 'mt-1': showAskUserHistory }">
          <!-- AskUserQuestion Allow: show "Submitted: <answer>" -->
          <template v-if="isAskUserQuestion && permissionDecision === 'allow' && submittedAnswer !== null">
            <UIcon name="i-lucide-message-square-reply" class="size-3.5 mt-0.5 shrink-0" style="color: #3b82f6;" />
            <span class="text-[11px] md:text-[12px] flex-1 whitespace-normal" style="color: var(--text-secondary);">
              <span class="font-medium" style="color: #3b82f6;">Submitted:</span>
              <span class="ml-1" style="color: var(--text-primary);">{{ submittedAnswer }}</span>
            </span>
          </template>
          <!-- Other tools or Denied AskUserQuestion: show Allowed/Denied -->
          <template v-else>
            <UIcon
              :name="permissionDecision === 'allow' ? 'i-lucide-shield-check' : 'i-lucide-shield-x'"
              class="size-3.5"
              :style="{ color: permissionDecision === 'allow' ? '#22c55e' : '#ef4444' }"
            />
            <span class="text-[11px] md:text-[12px]" style="color: var(--text-secondary);">
              <span class="font-medium" :style="{ color: permissionDecision === 'allow' ? '#22c55e' : '#ef4444' }">
                {{ permissionDecision === 'allow' ? 'Allowed' : 'Denied' }}
              </span>
              <span class="font-mono ml-1" style="color: var(--text-tertiary);">{{ message.toolName || 'Tool' }}</span>
            </span>
          </template>
        </div>
      </div>

      <!-- Pending: show permission request -->
      <div
        v-else
        class="px-3 py-2 md:px-4 md:py-3 rounded-xl border-2"
        style="background: rgba(229, 169, 62, 0.05); border-color: var(--accent);"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-shield-question" class="size-3.5 md:size-4" style="color: var(--accent);" />
          <span class="text-[11px] md:text-[12px] font-semibold" style="color: var(--text-primary);">
            Action Required
          </span>
        </div>

        <!-- AskUserQuestion: render as formatted text -->
        <template v-if="isAskUserQuestion && askUserQuestions">
          <div v-for="(q, qi) in askUserQuestions" :key="qi" class="mb-3">
            <p v-if="q.header" class="text-[11px] md:text-[12px] font-semibold mb-1 whitespace-normal" style="color: var(--text-primary);">
              {{ q.header }}
            </p>
            <p class="text-[11px] md:text-[12px] mb-2 whitespace-normal" style="color: var(--text-secondary);">
              {{ q.question }}
            </p>
            <div v-if="q.options && q.options.length" class="space-y-1.5">
              <button
                v-for="(opt, oi) in q.options"
                :key="oi"
                class="flex items-start gap-2 px-2.5 py-1.5 rounded-lg w-full text-left transition-all"
                :style="{
                  background: isAnswerSelected(qi, opt.label) ? 'rgba(229, 169, 62, 0.15)' : 'var(--surface-raised)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: isAnswerSelected(qi, opt.label) ? 'var(--accent)' : 'transparent',
                }"
                @click="toggleAnswer(qi, opt.label, !!q.multiSelect)"
              >
                <UIcon
                  :name="isAnswerSelected(qi, opt.label)
                    ? (q.multiSelect ? 'i-lucide-check-square' : 'i-lucide-circle-dot')
                    : (q.multiSelect ? 'i-lucide-square' : 'i-lucide-circle')"
                  class="size-3.5 mt-0.5 shrink-0"
                  :style="{ color: isAnswerSelected(qi, opt.label) ? 'var(--accent)' : 'var(--text-tertiary)' }"
                />
                <div class="min-w-0 flex-1">
                  <span class="text-[11px] md:text-[12px] font-medium whitespace-normal" style="color: var(--text-primary);">
                    {{ opt.label }}
                  </span>
                  <p v-if="opt.description" class="text-[10px] md:text-[11px] mt-0.5 whitespace-normal" style="color: var(--text-tertiary);">
                    {{ opt.description }}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </template>

        <!-- Other tools: show tool name and raw input -->
        <template v-else>
          <p class="text-[11px] md:text-[12px] mb-3 whitespace-normal" style="color: var(--text-secondary);">
            <span class="font-mono font-semibold" style="color: var(--text-primary);">{{ message.toolName || 'Tool' }}</span> wants to perform an action:
          </p>

          <pre
            v-if="message.toolInput"
            class="text-[10px] md:text-[11px] p-2 rounded-lg mb-3 overflow-auto max-h-24 font-mono"
            style="background: var(--surface-raised); color: var(--text-tertiary);"
          >{{ typeof message.toolInput === 'string' ? message.toolInput : JSON.stringify(message.toolInput, null, 2) }}</pre>
        </template>

        <!-- AskUserQuestion: Submit/Deny for multi-select, just Deny for single-select (auto-submits on click) -->
        <div v-if="isAskUserQuestion && askUserQuestions" class="flex flex-wrap items-center gap-2">
          <!-- Multi-select or multi-question: show explicit Submit -->
          <button
            v-if="askUserQuestions.some(q => q.multiSelect) || askUserQuestions.length > 1"
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all"
            :style="{
              background: hasSelectedAnswer ? 'var(--accent)' : 'var(--surface-raised)',
              color: hasSelectedAnswer ? 'white' : 'var(--text-tertiary)',
              cursor: hasSelectedAnswer ? 'pointer' : 'not-allowed',
              opacity: hasSelectedAnswer ? '1' : '0.6',
            }"
            :disabled="!hasSelectedAnswer"
            @click="handlePermissionAllow(false)"
          >
            Submit
          </button>
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
            @click="handlePermissionDeny"
          >
            Cancel
          </button>
        </div>

        <!-- Regular tools: Submit / Cancel -->
        <div v-else class="flex flex-wrap items-center gap-2">
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: var(--accent); color: white;"
            @click="handlePermissionAllow(false)"
          >
            Submit
          </button>
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
            @click="handlePermissionDeny"
          >
            Cancel
          </button>
        </div>
      </div>
    </template>

    <!-- Task Notification -->
    <template v-else-if="message.kind === 'task_notification' && message.taskProgress">
      <div class="flex items-center gap-2 py-1">
        <UIcon
          :name="message.taskProgress.status === 'running' ? 'i-lucide-loader-2' : message.taskProgress.status === 'completed' ? 'i-lucide-check-circle' : message.taskProgress.status === 'failed' ? 'i-lucide-x-circle' : 'i-lucide-circle'"
          class="size-4"
          :class="{ 'animate-spin': message.taskProgress.status === 'running' }"
          :style="{
            color: message.taskProgress.status === 'completed' ? '#22c55e' : message.taskProgress.status === 'failed' ? '#ef4444' : 'var(--accent)',
          }"
        />
        <span class="text-[12px]" style="color: var(--text-secondary);">
          {{ message.taskProgress.label }}
        </span>

        <div
          v-if="message.taskProgress.progress !== undefined"
          class="flex-1 h-1 rounded-full overflow-hidden max-w-[120px]"
          style="background: var(--surface-raised);"
        >
          <div
            class="h-full rounded-full transition-all"
            :style="{
              width: `${message.taskProgress.progress}%`,
              background: 'var(--accent)',
            }"
          />
        </div>
      </div>
    </template>

    <!-- Interactive Prompt -->
    <template v-else-if="message.kind === 'interactive_prompt' && message.interactivePrompt">
      <div
        class="px-4 py-3 rounded-xl border"
        style="background: var(--surface-overlay); border-color: var(--accent);"
      >
        <p class="text-[12px] font-medium mb-2" style="color: var(--text-primary);">
          {{ message.interactivePrompt.question }}
        </p>

        <div v-if="message.interactivePrompt.options" class="space-y-1">
          <button
            v-for="option in message.interactivePrompt.options"
            :key="option"
            class="w-full px-3 py-1.5 rounded-lg text-[12px] text-left hover:opacity-80 transition-all"
            style="background: var(--surface-raised); color: var(--text-secondary);"
          >
            {{ option }}
          </button>
        </div>

        <div v-else>
          <textarea
            class="w-full px-3 py-2 rounded-lg text-[12px] resize-none focus:outline-none"
            :rows="message.interactivePrompt.multiline ? 3 : 1"
            :placeholder="message.interactivePrompt.placeholder || 'Type your answer...'"
            style="background: var(--surface-raised); color: var(--text-primary); border: 1px solid var(--border-subtle);"
          />
        </div>
      </div>
    </template>

    <!-- Error Message -->
    <template v-else-if="message.kind === 'error'">
      <div
        class="flex items-start gap-2 px-3 py-2 rounded-lg"
        style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
      >
        <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0 mt-0.5" />
        <div class="text-[12px]">{{ message.content }}</div>
      </div>
    </template>

    <!-- Timestamp (if shown) -->
    <ClientOnly>
      <div
        v-if="showTimestamp"
        class="text-[10px] mt-1.5"
        style="color: var(--text-tertiary);"
      >
        {{ new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.message-item {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.prose {
  max-width: 100%;
}

/* ============================================
   PROSE STYLING - Using App CSS Variables
   Synced with main.css design system
   ============================================ */

/* ----------------------------------------
   Base Text (Paragraphs)
   ---------------------------------------- */
.prose :deep(p) {
  margin: 0.5rem 0;
  color: var(--text-primary);
  line-height: 1.65;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.prose :deep(p:first-child) {
  margin-top: 0;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

/* ----------------------------------------
   Headings
   ---------------------------------------- */
.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4) {
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.prose :deep(h1) { font-size: 1.375rem; }
.prose :deep(h2) { font-size: 1.25rem; }
.prose :deep(h3) { font-size: 1.125rem; }
.prose :deep(h4) { font-size: 1rem; }

/* ----------------------------------------
   Bold/Strong Text
   ---------------------------------------- */
.prose :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}

.prose :deep(em) {
  font-style: italic;
}

.prose :deep(del) {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

/* ----------------------------------------
   Links
   ---------------------------------------- */
.prose :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.prose :deep(a:hover) {
  color: var(--accent-hover);
  text-decoration: underline;
}

/* ----------------------------------------
   Lists
   ---------------------------------------- */
.prose :deep(ul) {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style-type: disc;
}

.prose :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style-type: decimal;
}

.prose :deep(ul ul) {
  list-style-type: circle;
  margin: 0.25rem 0;
}

.prose :deep(ul ul ul) {
  list-style-type: square;
}

.prose :deep(li) {
  margin: 0.25rem 0;
  display: list-item;
  padding-left: 0.25rem;
  color: var(--text-primary);
}

.prose :deep(li::marker) {
  color: var(--text-tertiary);
}

/* ----------------------------------------
   Tables
   ---------------------------------------- */
.prose :deep(table) {
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9em;
  display: block;
  overflow-x: auto;
  max-width: 100%;
}

.prose :deep(th),
.prose :deep(td) {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-default);
  text-align: left;
  color: var(--text-primary);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.prose :deep(th) {
  background: var(--surface-hover);
  font-weight: 600;
  color: var(--text-primary);
}

.prose :deep(tr:nth-child(even)) {
  background: var(--surface-hover);
}

.prose :deep(tr:nth-child(odd)) {
  background: transparent;
}

/* ----------------------------------------
   Inline Code
   ---------------------------------------- */
.prose :deep(code) {
  font-size: 0.85em;
  background: var(--surface-hover);
  padding: 0.2em 0.4em;
  border-radius: 0.25rem;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace);
  word-break: break-word;
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

/* ----------------------------------------
   Code Blocks
   Light mode: dark editor background
   Dark mode: lighter surface background
   ---------------------------------------- */
.prose :deep(pre) {
  background: #1e1e2e;
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 1rem 0;
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

.prose :deep(pre code) {
  background: none;
  color: #cdd6f4;
  padding: 0;
  font-size: 0.875em;
  line-height: 1.7;
  display: block;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: break-word;
  border: none;
}

/* Dark mode: lighter surface background */
:global(.dark) .prose :deep(pre) {
  background: #1a1a1f !important;
  border-color: rgba(255, 255, 255, 0.09) !important;
}

:global(.dark) .prose :deep(pre code) {
  color: #f0f0f5 !important;
}

/* ----------------------------------------
   Blockquotes
   ---------------------------------------- */
.prose :deep(blockquote) {
  border-left: 4px solid var(--border-default);
  padding-left: 1rem;
  margin: 0.75rem 0;
  color: var(--text-secondary);
  font-style: italic;
}

/* ----------------------------------------
   Horizontal Rules
   ---------------------------------------- */
.prose :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 1.25rem 0;
}

/* ----------------------------------------
   Images
   ---------------------------------------- */
.prose :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
}

/* ----------------------------------------
   Shiki syntax-highlighted code blocks
   ---------------------------------------- */

/* Strip the default prose <pre> styles when Shiki is rendering */
.prose :deep(.shiki-wrapper) {
  position: relative;
  margin: 1rem 0;
  border-radius: 0.5rem;
  overflow: hidden;
  max-width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

/* Language badge */
.prose :deep(.shiki-wrapper[data-lang]:not([data-lang=''])::before) {
  content: attr(data-lang);
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  font-size: 0.65rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: rgba(205, 214, 244, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
  z-index: 1;
}

/* The shiki <pre> itself */
.prose :deep(.shiki-wrapper pre) {
  margin: 0;
  padding: 1rem;
  border-radius: 0;
  border: none;
  overflow-x: auto;
  background: #1e1e2e !important; /* tokyo-night */
  white-space: pre-wrap; /* allow wrapping in code blocks if needed */
  word-break: break-all;
}

/* Code inside shiki pre */
.prose :deep(.shiki-wrapper pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875em;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: break-word;
}

/* Shiki inline spans carry their own color — don't override */
.prose :deep(.shiki-wrapper pre code span) {
  background: none !important;
  border: none !important;
  padding: 0 !important;
}
</style>
