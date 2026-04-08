<script setup lang="ts">
import { formatRelativeTime } from '~/utils/messageFormatting'

interface ClaudeCodeProject {
  name: string
  path: string
  displayName: string
  lastActivity?: string
  sessionCount: number
}

defineProps<{
  project: ClaudeCodeProject
}>()
</script>

<template>
  <NuxtLink
    :to="`/project-artifacts/${encodeURIComponent(project.name)}`"
    class="block rounded-xl p-4 transition-all duration-200 focus-ring group relative overflow-hidden"
    style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
    @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; ($event.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; ($event.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px var(--card-shadow)'"
    @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; ($event.currentTarget as HTMLElement).style.transform = ''; ($event.currentTarget as HTMLElement).style.boxShadow = ''"
  >
    <!-- Color accent bar -->
    <div
      class="absolute inset-x-0 top-0 h-[4px]"
      style="background: var(--accent);"
    />

    <!-- Hover glow -->
    <div
      class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      style="background: radial-gradient(ellipse at top, var(--accent) 08 0%, transparent 60%)"
    />

    <div class="flex items-start gap-3 relative">
      <div
        class="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-105"
        style="background: var(--accent-muted); border: 1px solid var(--border-subtle);"
      >
        <UIcon name="i-lucide-box" class="size-4" style="color: var(--accent);" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[14px] font-semibold truncate" style="color: var(--text-primary);">
          {{ project.displayName }}
        </div>
        <div class="text-[11px] mt-0.5 font-mono truncate" style="color: var(--text-tertiary);" :title="project.path">
          {{ project.path }}
        </div>
      </div>
    </div>
    
    <div class="flex items-center justify-between mt-4 pt-3 relative" style="border-top: 1px solid var(--border-subtle);">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">
          {{ project.sessionCount }} sessions
        </span>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          :to="`/cli/project/${encodeURIComponent(project.name)}`"
          @click.stop
          class="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          style="background: var(--accent-muted); color: var(--accent);"
          title="Open in CLI"
        >
          <UIcon name="i-lucide-terminal-square" class="size-3" />
          CLI
        </NuxtLink>
        <span class="text-[10px]" style="color: var(--text-tertiary);">
          {{ formatRelativeTime(project.lastActivity) || 'No activity' }}
        </span>
      </div>
    </div>
  </NuxtLink>
</template>

