<script setup lang="ts">
import type { ContextMetrics } from '~/types'

const props = defineProps<{
  metrics: ContextMetrics
}>()

const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num)
}

const contextPercentage = computed(() => {
  return Math.round(props.metrics.contextWindow.percentage)
})

const getStatusColor = () => {
  const p = contextPercentage.value
  if (p < 50) return '#22c55e' // Green
  if (p < 75) return '#eab308' // Yellow
  if (p < 90) return '#f97316' // Orange
  return '#ef4444' // Red
}
</script>

<template>
  <div class="p-4 space-y-6">
    <!-- Summary Section -->
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-[11px] font-bold uppercase tracking-wider text-tertiary" style="color: var(--text-tertiary);">Current Usage</h4>
        <span class="text-[11px] font-mono" :style="{ color: getStatusColor() }">{{ contextPercentage }}%</span>
      </div>
      
      <!-- Big Progress Bar -->
      <div class="h-2 w-full rounded-full overflow-hidden" style="background: var(--surface-raised);">
        <div 
          class="h-full transition-all duration-500 rounded-full"
          :style="{ 
            width: `${contextPercentage}%`,
            background: getStatusColor()
          }"
        />
      </div>

      <div class="flex flex-wrap justify-between text-[12px] gap-2">
        <span class="min-w-0 break-words" style="color: var(--text-secondary);">{{ formatNumber(metrics.contextWindow.used) }} tokens used</span>
        <span style="color: var(--text-tertiary);">{{ formatNumber(metrics.contextWindow.total) }} total</span>
      </div>
    </div>

    <!-- Breakdown Section -->
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-[11px] font-bold uppercase tracking-wider" style="color: var(--text-tertiary);">Token Breakdown</h4>
        <UTooltip text="Input + Cache Write + Cache Read = Context Used" :popper="{ placement: 'left' }">
          <UIcon name="i-lucide-help-circle" class="size-3.5" style="color: var(--text-disabled);" />
        </UTooltip>
      </div>
      
      <div class="space-y-3">
        <!-- Input Tokens -->
        <div class="flex flex-wrap items-center justify-between p-2.5 rounded-lg gap-2" style="background: var(--surface-raised);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-2 rounded-full shrink-0" style="background: #3b82f6;" />
            <span class="text-[12px] break-words" style="color: var(--text-primary);">Input</span>
          </div>
          <span class="text-[12px] font-mono" style="color: var(--text-secondary);">{{ formatNumber(metrics.tokens.input) }}</span>
        </div>

        <!-- Cache Write (Creation) -->
        <div class="flex flex-wrap items-center justify-between p-2.5 rounded-lg gap-2" style="background: var(--surface-raised);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-2 rounded-full shrink-0" style="background: #f59e0b;" />
            <span class="text-[12px] break-words" style="color: var(--text-primary);">Cache Write</span>
          </div>
          <span class="text-[12px] font-mono" style="color: var(--text-secondary);">{{ formatNumber(metrics.tokens.cacheCreation || 0) }}</span>
        </div>

        <!-- Cache Read (Cached) -->
        <div class="flex flex-wrap items-center justify-between p-2.5 rounded-lg gap-2" style="background: var(--surface-raised);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-2 rounded-full shrink-0" style="background: #8b5cf6;" />
            <span class="text-[12px] break-words" style="color: var(--text-primary);">Cache Read</span>
          </div>
          <span class="text-[12px] font-mono" style="color: var(--text-secondary);">{{ formatNumber(metrics.tokens.cached || 0) }}</span>
        </div>

        <!-- Output Tokens -->
        <div class="flex flex-wrap items-center justify-between p-2.5 rounded-lg border-t border-dashed mt-2 pt-3 gap-2" style="border-color: var(--border-subtle);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-2 rounded-full shrink-0" style="background: #22c55e;" />
            <span class="text-[12px] break-words" style="color: var(--text-primary);">Output (Next turn)</span>
          </div>
          <span class="text-[12px] font-mono" style="color: var(--text-secondary);">{{ formatNumber(metrics.tokens.output) }}</span>
        </div>
      </div>
    </div>

    <!-- Information Box -->
    <div class="p-3 rounded-xl border space-y-2" style="background: rgba(229, 169, 62, 0.05); border-color: rgba(229, 169, 62, 0.15);">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-info" class="size-3.5" style="color: var(--accent);" />
        <span class="text-[11px] font-bold" style="color: var(--accent);">About Context Window</span>
      </div>
      <p class="text-[11px] leading-relaxed" style="color: var(--text-secondary);">
        The context window includes all messages, files, and tool results currently visible to Claude. When this fills up, Claude may forget older parts of the conversation.
      </p>
    </div>
  </div>
</template>
