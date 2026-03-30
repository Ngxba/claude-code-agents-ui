<script setup lang="ts">
import type { MarketplaceSource } from '~/types'

defineProps<{
  source: MarketplaceSource
}>()

const emit = defineEmits<{
  update: [name: string]
  remove: [name: string]
  clickName: [name: string]
}>()

const updating = ref(false)
const showConfirm = ref(false)
let confirmTimer: any = null

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function onRemove() {
  if (!showConfirm.value) {
    showConfirm.value = true
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      showConfirm.value = false
    }, 4000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  emit('remove', props.source.name)
  showConfirm.value = false
}

function cancelRemove() {
  showConfirm.value = false
  if (confirmTimer) clearTimeout(confirmTimer)
}
</script>

<template>
  <div
    class="flex items-center justify-between py-2 px-3 rounded-lg group/row"
    style="background: var(--input-bg);"
  >
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <UIcon name="i-lucide-store" class="size-3.5 shrink-0 text-meta" />
      <button 
        class="font-mono text-[12px] font-medium text-body hover:text-accent transition-colors truncate"
        @click="emit('clickName', source.name)"
      >
        {{ source.name }}
      </button>
      <span class="text-[10px] font-mono px-1.5 py-px rounded-full shrink-0 badge badge-subtle">
        {{ source.sourceType }}
      </span>
      <span class="text-[11px] text-meta truncate flex-1">{{ source.sourceUrl }}</span>
      <span class="font-mono text-[10px] text-meta shrink-0">{{ formatDate(source.lastUpdated) }}</span>
    </div>
    <div class="flex items-center gap-2 ml-3">
      <template v-if="showConfirm">
        <div class="flex items-center gap-1.5 bg-surface-base rounded-md p-0.5 border border-error/20">
          <button
            class="flex items-center gap-1.5 px-2 py-1 rounded bg-error text-white focus-ring shadow-sm active:scale-95 transition-transform"
            @click="onRemove"
          >
            <UIcon name="i-lucide-alert-circle" class="size-3.5" />
            <span class="text-[10px] font-bold uppercase tracking-wider">Confirm?</span>
          </button>
          <button
            class="p-1 rounded hover:bg-surface-raised text-meta hover:text-label transition-colors focus-ring"
            title="Cancel"
            @click="cancelRemove"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>
      </template>
      
      <template v-else>
        <UButton
          label="Update"
          icon="i-lucide-refresh-cw"
          size="xs"
          variant="ghost"
          color="neutral"
          :loading="updating"
          @click="updating = true; emit('update', source.name)"
        />
        <button
          class="p-1.5 rounded text-meta hover:text-error hover:bg-error/5 transition-all focus-ring"
          title="Remove marketplace"
          @click="onRemove"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>
      </template>
    </div>
  </div>
</template>
