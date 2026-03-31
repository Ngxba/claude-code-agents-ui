<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'
import { renderMarkdownWithHighlighting } from '~/utils/markdown'
import { formatContent } from '~/utils/messageFormatting'

const props = defineProps<{
  message: DisplayChatMessage
  showTimestamp?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean): void
  (e: 'openFile', filePath: string): void
}>()

// Collapsible states
const showThinking = ref(false)
const showToolDetails = ref(false)
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
  if (typeof input === 'string') return input
  if (input.file_path) return input.file_path
  if (input.path) return input.path
  if (input.filePath) return input.filePath
  if (input.filename) return input.filename
  // Glob uses 'pattern' field
  if (input.pattern) return input.pattern

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
  if (toolFileName.value) {
    emit('openFile', toolFileName.value)
  }
}

// Handle permission response
function handlePermissionAllow(remember = false) {
  if (props.message.permissionRequest) {
    emit('permissionRespond', props.message.permissionRequest.id, 'allow', remember)
  }
}

function handlePermissionDeny() {
  if (props.message.permissionRequest) {
    emit('permissionRespond', props.message.permissionRequest.id, 'deny', false)
  }
}

// Get tool icon based on tool name
function getToolIcon(toolName: string): string {
  const toolIcons: Record<string, string> = {
    'Read': 'i-lucide-file-text',
    'Write': 'i-lucide-file-plus',
    'Edit': 'i-lucide-file-edit',
    'Bash': 'i-lucide-terminal',
    'Glob': 'i-lucide-search',
    'Grep': 'i-lucide-search-code',
    'WebFetch': 'i-lucide-globe',
    'WebSearch': 'i-lucide-search',
    'Task': 'i-lucide-list-todo',
  }
  return toolIcons[toolName] || 'i-lucide-wrench'
}

// Get tool color
function getToolColor(toolName: string): string {
  const toolColors: Record<string, string> = {
    'Read': '#3b82f6',
    'Write': '#22c55e',
    'Edit': '#f59e0b',
    'Bash': '#8b5cf6',
    'Glob': '#06b6d4',
    'Grep': '#06b6d4',
    'TodoWrite': '#22c55e',
  }
  return toolColors[toolName] || 'var(--accent)'
}

// Check if this is a TodoWrite tool
const isTodoWrite = computed(() => props.message.toolName === 'TodoWrite')

// Check if this is a Bash tool
const isBash = computed(() => props.message.toolName === 'Bash')

// Get bash command and description
const bashCommand = computed(() => {
  if (!isBash.value || !props.message.toolInput) return null
  const input = props.message.toolInput
  return input.command || null
})

const bashDescription = computed(() => {
  if (!isBash.value || !props.message.toolInput) return null
  const input = props.message.toolInput
  return input.description || null
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
  <div class="message-item overflow-hidden max-w-full min-w-0">
    <!-- User Message - shouldn't appear here since handled by parent, but just in case -->
    <template v-if="message.role === 'user'">
      <div v-if="message.images && message.images.length > 0" class="flex flex-wrap gap-2 mb-2">
        <img v-for="(img, i) in message.images" :key="i" :src="img" class="max-w-[200px] max-h-[200px] rounded object-contain border" style="border-color: var(--border-subtle);" />
      </div>
      <div v-if="message.content" class="text-[13px] whitespace-pre-wrap" style="color: var(--text-primary);">
        {{ message.content }}
      </div>
    </template>

    <!-- Assistant Text Message -->
    <template v-else-if="message.kind === 'text' && message.content">
      <div class="group relative">
        <div
          class="prose prose-sm text-[13px] leading-relaxed"
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
        class="mt-2 p-2 md:p-3 rounded-lg text-[11px] md:text-[12px] whitespace-pre-wrap"
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
          <div class="px-3 md:px-4 py-2 md:py-3 pl-8 md:pl-9 font-mono text-[11px] md:text-[12px]" style="color: #9ece6a;">
            <span style="color: #7aa2f7;">$</span> {{ bashCommand }}
          </div>
        </div>

        <!-- Description -->
        <p v-if="bashDescription" class="text-[11px] px-1 italic" style="color: var(--text-tertiary);">
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
                class="flex-1 text-[12px]"
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

    <!-- Tool Use - Read/Write show filename only, Glob shows pattern (non-clickable) -->
    <template v-else-if="message.kind === 'tool_use' && ['Read', 'Write', 'Glob'].includes(message.toolName || '')">
      <div class="flex items-start gap-2">
        <!-- Left border indicator -->
        <div
          class="w-0.5 self-stretch rounded-full shrink-0"
          :style="{ background: getToolColor(message.toolName || 'unknown') }"
        />

        <div class="flex-1 min-w-0">
          <div class="text-[12px] flex items-center gap-2">
            <span style="color: var(--text-secondary);">{{ message.toolName }}</span>

            <!-- Clickable filename for Read/Write -->
            <template v-if="message.toolName !== 'Glob' && displayFileName">
              <span style="color: var(--text-tertiary);">/</span>
              <span
                class="font-medium cursor-pointer hover:underline truncate"
                :style="{ color: getToolColor(message.toolName || 'unknown') }"
                @click.stop="handleFileClick"
                :title="toolFileName"
              >
                {{ displayFileName }}
              </span>
            </template>

            <!-- Non-clickable pattern for Glob -->
            <template v-else-if="message.toolName === 'Glob' && toolFileName">
              <span style="color: var(--text-tertiary);">:</span>
              <span class="font-mono text-[11px] text-meta truncate" :title="toolFileName">
                {{ toolFileName }}
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
            :is="(['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError) ? 'div' : 'button'"
            class="inline-flex items-center gap-1.5 text-[12px] font-medium w-full text-left"
            :class="{ 'cursor-default': (['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError) }"
            style="color: var(--text-secondary);"
            @click="(['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError) ? null : showToolDetails = !showToolDetails"
          >
            <UIcon
              v-if="!(['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError)"
              :name="showToolDetails ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <span>{{ message.toolName }}</span>

            <!-- Clickable filename -->
            <template v-if="displayFileName">
              <span style="color: var(--text-tertiary);">/</span>
              <span
                class="font-medium cursor-pointer hover:underline"
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

          <!-- Diff viewer for Edit/Write tools -->
          <div v-if="['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError && toolFileName" class="mt-1">
            <ToolDiffViewer
              :file-path="toolFileName"
              :old-content="message.toolInput?.old_string"
              :new-content="message.toolInput?.new_string"
              @file-click="handleFileClick"
            />
          </div>

          <!-- Expanded details (only for non-Edit/Write or errors) -->
          <div v-if="showToolDetails && !(['Edit', 'Write', 'ApplyPatch'].includes(message.toolName || '') && !message.isError)" class="mt-2 space-y-2 max-w-full overflow-hidden">
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
    <template v-else-if="message.kind === 'permission_request' && message.permissionRequest">
      <div
        class="px-3 py-2 md:px-4 md:py-3 rounded-xl border-2"
        style="background: rgba(229, 169, 62, 0.05); border-color: var(--accent);"
      >
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-lucide-shield-question" class="size-3.5 md:size-4" style="color: var(--accent);" />
          <span class="text-[11px] md:text-[12px] font-semibold" style="color: var(--text-primary);">
            Permission Required
          </span>
        </div>

        <p class="text-[11px] md:text-[12px] mb-3" style="color: var(--text-secondary);">
          {{ message.permissionRequest.toolName }} wants to perform an action:
        </p>

        <pre
          v-if="message.permissionRequest.toolInput"
          class="text-[10px] md:text-[11px] p-2 rounded-lg mb-3 overflow-auto max-h-24 font-mono"
          style="background: var(--surface-raised); color: var(--text-tertiary);"
        >{{ JSON.stringify(message.permissionRequest.toolInput, null, 2) }}</pre>

        <div class="flex flex-wrap items-center gap-2">
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: var(--accent); color: white;"
            @click="handlePermissionAllow(false)"
          >
            Allow
          </button>
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: var(--surface-raised); color: var(--text-secondary);"
            @click="handlePermissionAllow(true)"
          >
            Allow & Remember
          </button>
          <button
            class="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-[12px] font-medium transition-all hover:opacity-90"
            style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
            @click="handlePermissionDeny"
          >
            Deny
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
        style="background: var(--surface); border-color: var(--accent);"
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
    <div
      v-if="showTimestamp"
      class="text-[10px] mt-1.5"
      style="color: var(--text-tertiary);"
    >
      {{ new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
    </div>
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
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9em;
  table-layout: fixed;
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
  word-break: break-all;
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
}

/* Code inside shiki pre */
.prose :deep(.shiki-wrapper pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875em;
  line-height: 1.7;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
}

/* Shiki inline spans carry their own color — don't override */
.prose :deep(.shiki-wrapper pre code span) {
  background: none !important;
  border: none !important;
  padding: 0 !important;
}
</style>
