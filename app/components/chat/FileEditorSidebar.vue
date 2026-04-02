<script setup lang="ts">
import { highlightCode } from '~/utils/markdown'

const { state, closeEditor } = useFileEditor()
const { workingDir } = useWorkingDir()

const content = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const fileName = computed(() => state.value.filePath?.split('/').pop() || '')
const displayPath = computed(() => state.value.filePath || '')

async function fetchFileContent() {
  if (!state.value.filePath) return
  
  loading.value = true
  error.value = null
  
  try {
    const data = await $fetch<{ content: string }>('/api/files', {
      query: { 
        path: state.value.filePath,
        projectDir: workingDir.value
      }
    })
    content.value = data.content
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to read file'
  } finally {
    loading.value = false
  }
}

watch(() => state.value.filePath, (newPath) => {
  if (newPath && !state.value.diffInfo) {
    fetchFileContent()
  } else if (state.value.diffInfo) {
    // If we have diff info, we can construct a diff view
    const diff = `--- a/${fileName.value}\n+++ b/${fileName.value}\n` + 
                 generateDiff(state.value.diffInfo.oldContent, state.value.diffInfo.newContent)
    content.value = diff
  }
}, { immediate: true })

function generateDiff(oldStr: string, newStr: string) {
  // Simple diff generator if needed, but for now let's just show them side by side or combined
  // Actually, we can just show the new content if it's a "Write" tool.
  // If it's an "Edit" tool, Claude usually provides the search/replace blocks.
  return newStr
}

const highlightedHtml = ref('')

async function updateHighlighting() {
  if (!content.value) {
    highlightedHtml.value = ''
    return
  }
  
  const lang = state.value.diffInfo ? 'diff' : (fileName.value.split('.').pop() || 'text')
  highlightedHtml.value = await highlightCode(content.value, lang)
}

watch(content, updateHighlighting, { immediate: true })

const isExpanded = ref(false)

// Drag-to-resize
const sidebarWidth = ref(Math.max(window?.innerWidth ? window.innerWidth * 0.5 : 600, 400))
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

function onDragStart(e: MouseEvent) {
  if (isExpanded.value) return
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartWidth.value = sidebarWidth.value
  document.body.classList.add('dragging-file-sidebar')
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return
  const delta = dragStartX.value - e.clientX
  sidebarWidth.value = Math.min(window.innerWidth * 0.95, Math.max(300, dragStartWidth.value + delta))
}

function onDragEnd() {
  isDragging.value = false
  document.body.classList.remove('dragging-file-sidebar')
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<template>
  <div class="fixed inset-0 z-[60] pointer-events-none">
    <!-- Backdrop -->
    <Transition name="fade">
      <div 
        v-if="state.isOpen" 
        class="absolute inset-0 bg-black/5 pointer-events-auto" 
        @click="closeEditor" 
      />
    </Transition>

    <!-- Sidebar Panel -->
    <Transition name="slide">
      <div
        v-if="state.isOpen"
        class="absolute inset-y-0 right-0 flex flex-col shadow-2xl bg-card border-l border-border-subtle pointer-events-auto"
        :style="{
          width: isExpanded ? '100%' : `${sidebarWidth}px`,
          userSelect: isDragging ? 'none' : undefined,
        }"
      >
        <!-- Drag handle -->
        <div
          v-if="!isExpanded"
          class="absolute left-0 inset-y-0 w-1 cursor-col-resize z-10"
          :class="isDragging ? 'bg-accent/40' : 'hover:bg-accent/30'"
          @mousedown="onDragStart"
        />
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon name="i-lucide-file-code" class="size-4 text-accent shrink-0" />
            <div class="flex flex-col min-w-0">
              <span class="text-[13px] font-semibold truncate">{{ fileName }}</span>
              <span class="text-[10px] text-meta truncate">{{ displayPath }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button 
              class="p-1.5 rounded-lg hover-bg text-meta transition-colors"
              @click="isExpanded = !isExpanded"
              :title="isExpanded ? 'Collapse' : 'Expand'"
            >
              <UIcon :name="isExpanded ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="size-3.5" />
            </button>
            <button 
              class="p-1.5 rounded-lg hover-bg text-meta transition-colors"
              @click="closeEditor"
              title="Close"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-hidden relative">
          <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-accent" />
          </div>
          
          <div v-if="error" class="p-8 text-center space-y-3">
            <UIcon name="i-lucide-alert-circle" class="size-8 text-error mx-auto" />
            <p class="text-sm text-error">{{ error }}</p>
            <UButton label="Retry" size="sm" variant="soft" @click="fetchFileContent" />
          </div>

          <div v-else class="h-full overflow-auto p-4 custom-scrollbar">
            <div v-if="highlightedHtml" class="shiki-editor" v-html="highlightedHtml" />
            <pre v-else class="text-[12px] font-mono whitespace-pre-wrap">{{ content }}</pre>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-4 py-2 border-t border-border-subtle shrink-0 flex items-center justify-between">
          <span class="text-[10px] text-meta font-mono">{{ content.split('\n').length }} lines</span>
          <div v-if="state.diffInfo" class="text-[10px] px-2 py-0.5 rounded-full bg-accent-muted text-accent font-medium">
            Viewing Changes
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
:global(body.dragging-file-sidebar) {
  cursor: col-resize !important;
  user-select: none !important;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0.8;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.shiki-editor :deep(pre) {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-size: 12px;
  line-height: 1.6;
}

.shiki-editor :deep(.shiki-wrapper) {
  background: transparent !important;
}

.shiki-editor :deep(code) {
  background: transparent !important;
  padding: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
}
</style>
