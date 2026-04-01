<script setup lang="ts">
const props = defineProps<{
  oldContent?: string
  newContent?: string
  filePath: string
  badge?: string
  badgeColor?: 'gray' | 'green'
}>()

const emit = defineEmits<{
  fileClick: [path: string]
}>()

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

// Improved diff logic using prefix/suffix matching for better block replacement visualization
const diffLines = computed(() => {
  if (props.oldContent === undefined || props.newContent === undefined) return []
  
  const oldLines = props.oldContent.split('\n')
  const newLines = props.newContent.split('\n')
  
  // 1. Find common prefix
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++
  }
  
  // 2. Find common suffix
  let suffix = 0
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && 
         oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) {
    suffix++
  }
  
  const result: DiffLine[] = []
  
  // Show a couple of context lines before the change if possible
  const contextBefore = Math.max(0, prefix - 2)
  for (let k = contextBefore; k < prefix; k++) {
    result.push({ type: 'unchanged', content: oldLines[k] as string })
  }
  
  // Add removed lines
  for (let k = prefix; k < oldLines.length - suffix; k++) {
    result.push({ type: 'removed', content: oldLines[k] as string })
  }
  
  // Add added lines
  for (let k = prefix; k < newLines.length - suffix; k++) {
    result.push({ type: 'added', content: newLines[k] as string })
  }
  
  // Show a couple of context lines after the change if possible
  const contextAfter = Math.min(oldLines.length, oldLines.length - suffix + 2)
  for (let k = oldLines.length - suffix; k < contextAfter; k++) {
    result.push({ type: 'unchanged', content: oldLines[k] as string })
  }
  
  return result
})

const badgeClasses = computed(() => {
  return props.badgeColor === 'green'
    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
})
</script>

<template>
  <div class="overflow-hidden rounded border border-gray-200/60 dark:border-gray-700/50 my-2">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-200/60 bg-gray-50/80 px-2.5 py-1 dark:border-gray-700/50 dark:bg-gray-800/40">
      <button
        class="cursor-pointer truncate font-mono text-[11px] text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-left"
        @click="emit('fileClick', filePath)"
      >
        {{ filePath }}
      </button>
      <span :class="['rounded px-1.5 py-px text-[10px] font-medium flex-shrink-0', badgeClasses]">
        {{ badge || 'Diff' }}
      </span>
    </div>

    <!-- Diff lines -->
    <div class="font-mono text-[11px] leading-[18px] max-h-40 overflow-y-auto overflow-x-auto">
      <div v-for="(line, i) in diffLines" :key="i" class="flex min-w-0">
        <span
          :class="[
            'w-6 flex-shrink-0 select-none text-center',
            line.type === 'removed'
              ? 'bg-red-50 text-red-400 dark:bg-red-950/30 dark:text-red-500'
              : line.type === 'added'
                ? 'bg-green-50 text-green-400 dark:bg-green-950/30 dark:text-green-500'
                : 'bg-gray-50/50 text-gray-400 dark:bg-gray-900/30 dark:text-gray-600'
          ]"
        >
          {{ line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' ' }}
        </span>
        <span
          :class="[
            'flex-1 whitespace-pre-wrap px-2',
            line.type === 'removed'
              ? 'bg-red-50/50 text-red-800 dark:bg-red-950/20 dark:text-red-200'
              : line.type === 'added'
                ? 'bg-green-50/50 text-green-800 dark:bg-green-950/20 dark:text-green-200'
                : 'text-gray-600 dark:text-gray-400'
          ]"
        >
          {{ line.content }}
        </span>
      </div>
      <div v-if="diffLines.length === 0" class="p-2 text-meta text-[10px]">
        No changes detected or binary file.
      </div>
    </div>
  </div>
</template>
