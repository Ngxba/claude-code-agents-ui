<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div
    class="min-h-16 flex items-center gap-3 px-6 py-3 shrink-0 sticky top-0 z-100"
    style="border-bottom: 1px solid var(--border-subtle); background: var(--surface-base); backdrop-filter: blur(12px);"
  >
    <slot name="leading" />
    <div class="flex-1 min-w-0">
      <h1 class="text-page-title flex items-center gap-2.5">
        {{ title }}
        <slot name="trailing" />
      </h1>
      <div v-if="subtitle || $slots.subtitle" class="mt-0.5">
        <slot name="subtitle">
          <p class="text-[11px] font-mono text-meta truncate">{{ subtitle }}</p>
        </slot>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>
