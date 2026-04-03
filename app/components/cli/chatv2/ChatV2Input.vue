<script setup lang="ts">
import type { Command } from '~/types'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  isStreaming?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send', images: string[]): void
  (e: 'abort'): void
  (e: 'focus'): void
  (e: 'blur'): void
}>()

const { commands: allCommands, fetchAll: fetchCommands } = useCommands()
const { skills: allSkills, fetchAll: fetchSkills } = useSkills()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isFocused = ref(false)

// Built-in Claude Code slash commands
const builtinCommands = [
  { name: 'help', description: 'Show help and available commands' },
  { name: 'clear', description: 'Clear conversation history and free up context' },
  { name: 'compact', description: 'Compact conversation with optional focus instructions', argumentHint: '[instructions]' },
  { name: 'config', description: 'Open settings interface' },
  { name: 'cost', description: 'Show token usage statistics' },
  { name: 'model', description: 'Select or change the AI model', argumentHint: '[model]' },
  { name: 'memory', description: 'Edit CLAUDE.md memory files' },
  { name: 'permissions', description: 'Manage tool permission rules' },
  { name: 'resume', description: 'Resume a previous conversation', argumentHint: '[session]' },
  { name: 'exit', description: 'Exit the CLI' },
  { name: 'init', description: 'Initialize project with CLAUDE.md guide' },
  { name: 'plan', description: 'Enter plan mode', argumentHint: '[description]' },
  { name: 'mcp', description: 'Manage MCP server connections' },
  { name: 'diff', description: 'Open an interactive diff viewer' },
  { name: 'rewind', description: 'Rewind conversation to a previous point' },
  { name: 'doctor', description: 'Diagnose and verify installation' },
  { name: 'vim', description: 'Toggle Vim editing mode' },
  { name: 'theme', description: 'Change the color theme' },
  { name: 'login', description: 'Sign in to Anthropic account' },
  { name: 'logout', description: 'Sign out from account' },
  { name: 'status', description: 'Show current session status' },
  { name: 'debug', description: 'Enable debug logging for the current session', argumentHint: '[description]' },
  { name: 'copy', description: 'Copy the last assistant response to clipboard', argumentHint: '[N]' },
  { name: 'export', description: 'Export the current conversation as plain text', argumentHint: '[filename]' },
  { name: 'context', description: 'Visualize current context usage' },
  { name: 'effort', description: 'Set the model effort level', argumentHint: '[level]' },
  { name: 'fast', description: 'Toggle fast mode', argumentHint: '[on|off]' },
  { name: 'hooks', description: 'View hook configurations' },
  { name: 'tasks', description: 'List and manage background tasks' },
  { name: 'add-dir', description: 'Add a working directory for file access', argumentHint: '<path>' },
  { name: 'rename', description: 'Rename the current session', argumentHint: '[name]' },
  { name: 'sandbox', description: 'Toggle sandbox mode' },
  { name: 'usage', description: 'Show plan usage limits' },
  { name: 'feedback', description: 'Submit feedback about Claude Code', argumentHint: '[report]' },
  { name: 'release-notes', description: 'View the changelog' },
  { name: 'ide', description: 'Manage IDE integrations' },
  { name: 'skills', description: 'List available skills' },
  { name: 'pr-comments', description: 'Fetch and display GitHub PR comments', argumentHint: '[PR]' },
  { name: 'voice', description: 'Toggle push-to-talk voice dictation' },
  { name: 'terminal-setup', description: 'Configure terminal keybindings' },
  { name: 'upgrade', description: 'Open upgrade page' },
  { name: 'stats', description: 'Visualize daily usage and session history' },
  { name: 'branch', description: 'Create a branch of the current conversation', argumentHint: '[name]' },
  { name: 'color', description: 'Set the prompt bar color', argumentHint: '[color|default]' },
  { name: 'keybindings', description: 'Open keybindings configuration' },
  { name: 'statusline', description: 'Configure status line display' },
  { name: 'privacy-settings', description: 'View and update privacy settings' },
]

// Command/Skill Menu State
const isMenuOpen = ref(false)
const selectedItemIdx = ref(0)
const menuSearchQuery = ref('')

const menuItems = computed(() => {
  const items = [
    ...allCommands.value.map(c => ({ type: 'command' as const, name: c.frontmatter.name, description: c.frontmatter.description, slug: c.slug, directory: c.directory, filePath: c.filePath })),
    ...allSkills.value.map(s => ({ type: 'skill' as const, name: s.frontmatter.name, description: s.frontmatter.description, slug: s.slug, filePath: s.filePath })),
    ...builtinCommands.map(b => ({ type: 'builtin' as const, name: b.name, description: b.description, slug: b.name, argumentHint: b.argumentHint })),
  ]

  if (!menuSearchQuery.value) return items

  const q = menuSearchQuery.value.toLowerCase()
  return items.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.description?.toLowerCase().includes(q)
  )
})

// Local value for v-model
const localValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const fileInputRef = ref<HTMLInputElement | null>(null)
const attachedImages = ref<{ url: string; file: File }[]>([])

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return

  Array.from(target.files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          attachedImages.value.push({ url: e.target.result, file })
        }
      }
      reader.readAsDataURL(file)
    }
  })
  target.value = '' // Reset input
}

function removeImage(index: number) {
  attachedImages.value.splice(index, 1)
}

function triggerSend() {
  const images = attachedImages.value.map(img => img.url)
  emit('send', images)
  attachedImages.value = []
}

// Auto-resize textarea
function autoResize() {
  if (!textareaRef.value) return

  textareaRef.value.style.height = 'auto'
  const maxHeight = window.innerWidth < 640 ? 120 : window.innerWidth < 768 ? 160 : 200
  const newHeight = Math.min(textareaRef.value.scrollHeight, maxHeight)
  textareaRef.value.style.height = `${newHeight}px`
}

function selectItem(item: { type: 'command' | 'skill' | 'builtin'; name: string }) {
  localValue.value = `/${item.name} `
  isMenuOpen.value = false
  textareaRef.value?.focus()
}

// Handle keydown
function handleKeydown(e: KeyboardEvent) {
  // Command Menu Navigation
  if (isMenuOpen.value && menuItems.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedItemIdx.value = (selectedItemIdx.value + 1) % menuItems.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedItemIdx.value = (selectedItemIdx.value - 1 + menuItems.value.length) % menuItems.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const item = menuItems.value[selectedItemIdx.value]
      if (item) selectItem(item)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      isMenuOpen.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!props.disabled && (localValue.value.trim() || attachedImages.value.length > 0)) {
      triggerSend()
    }
  }
}

// Watch value changes to resize and detect slash
watch(localValue, (newVal) => {
  nextTick(() => autoResize())

  // Detect "/" at start
  if (newVal.startsWith('/')) {
    const query = newVal.slice(1).split(' ')[0] || ''
    if (newVal.includes(' ')) {
      isMenuOpen.value = false
    } else {
      menuSearchQuery.value = query
      isMenuOpen.value = true
      selectedItemIdx.value = 0
    }
  } else {
    isMenuOpen.value = false
  }
})

// Focus on mount
onMounted(async () => {
  textareaRef.value?.focus()
  await Promise.all([
    allCommands.value.length === 0 ? fetchCommands() : Promise.resolve(),
    allSkills.value.length === 0 ? fetchSkills() : Promise.resolve()
  ])
})
</script>

<template>
  <div class="px-2 py-1.5 sm:px-3 sm:py-2 relative" style="background: var(--surface-base);">
    <!-- Command Menu -->
    <ChatV2CommandMenu
      :items="menuItems"
      :selected-index="selectedItemIdx"
      :is-open="isMenuOpen"
      @select="selectItem"
    />

    <!-- Image Previews -->
    <div v-if="attachedImages.length > 0" class="flex gap-2 mb-2 overflow-x-auto pb-1">
      <div v-for="(img, idx) in attachedImages" :key="idx" class="relative group shrink-0">
        <img :src="img.url" class="h-16 w-16 object-cover rounded-lg border" style="border-color: var(--border-subtle);" />
        <button
          class="absolute -top-1.5 -right-1.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style="background: #ef4444; color: white; border: 1px solid var(--surface-base);"
          @click="removeImage(idx)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>
    </div>

    <!-- Input container -->
    <div
      class="relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200"
      :style="{
        background: 'var(--surface-raised)',
        border: isFocused ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
        boxShadow: isFocused ? '0 0 0 3px rgba(229, 169, 62, 0.1)' : 'none',
      }"
    >
      <!-- Textarea -->
      <textarea
        ref="textareaRef"
        v-model="localValue"
        :disabled="disabled"
        rows="1"
        class="flex-1 bg-transparent text-[13px] resize-none focus:outline-none leading-5"
        :style="{
          color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
        }"
        :placeholder="placeholder || 'Send a message...'"
        @keydown="handleKeydown"
        @input="autoResize"
        @focus="isFocused = true; emit('focus')"
        @blur="isFocused = false; emit('blur')"
      />

      <!-- Action buttons -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- Attach button -->
        <button
          class="p-1.5 rounded-lg transition-all hover:bg-[var(--surface-hover)]"
          style="color: var(--text-secondary);"
          title="Attach image"
          @click="fileInputRef?.click()"
        >
          <UIcon name="i-lucide-paperclip" class="size-4" />
        </button>
        <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileSelect" />

        <!-- Abort button when streaming -->
        <button
          v-if="isStreaming"
          class="p-1.5 rounded-lg transition-all hover:opacity-80"
          style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
          title="Stop generating"
          @click="emit('abort')"
        >
          <UIcon name="i-lucide-square" class="size-4" />
        </button>

        <!-- Send button -->
        <button
          v-else
          class="p-1.5 rounded-lg transition-all"
          :style="{
            background: disabled || (!localValue.trim() && attachedImages.length === 0) ? 'transparent' : 'var(--accent)',
            color: disabled || (!localValue.trim() && attachedImages.length === 0) ? 'var(--text-disabled)' : 'white',
            cursor: disabled || (!localValue.trim() && attachedImages.length === 0) ? 'not-allowed' : 'pointer',
          }"
          :disabled="disabled || (!localValue.trim() && attachedImages.length === 0)"
          title="Send message"
          @click="triggerSend"
        >
          <UIcon name="i-lucide-arrow-up" class="size-4" />
        </button>
      </div>
    </div>

    <!-- Bottom hints -->
    <div class="flex flex-wrap items-center justify-between mt-1.5 px-1 gap-2">
      <div class="flex flex-wrap items-center gap-3 text-[10px]" style="color: var(--text-tertiary);">
        <span class="flex items-center gap-1">
          <kbd class="px-1 py-0.5 rounded text-[9px]" style="background: var(--surface-raised);">Enter</kbd>
          send
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1 py-0.5 rounded text-[9px]" style="background: var(--surface-raised);">Shift+Enter</kbd>
          newline
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Character counter -->
        <span
          v-if="localValue.length > 0"
          class="text-[10px] font-mono"
          :style="{
            color: localValue.length > 10000 ? '#ef4444' : 'var(--text-tertiary)',
          }"
        >
          {{ localValue.length.toLocaleString() }}
        </span>

        <!-- Streaming indicator -->
        <span
          v-if="isStreaming"
          class="text-[10px] flex items-center gap-1"
          style="color: var(--accent);"
        >
          <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
          Generating...
        </span>
      </div>
    </div>
  </div>
</template>
