<script setup lang="ts">
import type { PendingPermission } from '~/types'

const props = defineProps<{
  permissions: PendingPermission[]
}>()

const emit = defineEmits<{
  (e: 'respond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean): void
}>()

// Show first permission (could expand to show list)
const firstPermission = computed(() => props.permissions[0])

function handleAllow() {
  if (firstPermission.value) {
    emit('respond', firstPermission.value.id, 'allow', false)
  }
}

function handleAllowRemember() {
  if (firstPermission.value) {
    emit('respond', firstPermission.value.id, 'allow', true)
  }
}

function handleDeny() {
  if (firstPermission.value) {
    emit('respond', firstPermission.value.id, 'deny', false)
  }
}
</script>

<template>
  <div
    v-if="permissions.length > 0"
    class="shrink-0 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-4"
    style="background: rgba(229, 169, 62, 0.1); border-color: var(--accent);"
  >
    <div class="flex items-center gap-3 min-w-0">
      <UIcon name="i-lucide-shield-question" class="size-5 shrink-0" style="color: var(--accent);" />
      <div class="min-w-0">
        <div class="text-[12px] font-semibold break-words" style="color: var(--text-primary);">
          Permission Required
          <span
            v-if="permissions.length > 1"
            class="ml-2 px-1.5 py-0.5 rounded text-[10px] inline-block"
            style="background: var(--accent); color: white;"
          >
            +{{ permissions.length - 1 }} more
          </span>
        </div>
        <div class="text-[11px] break-words" style="color: var(--text-secondary);">
          <strong class="break-all">{{ firstPermission?.toolName }}</strong> wants to perform an action
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
        style="background: var(--accent); color: white;"
        @click="handleAllow"
      >
        Allow
      </button>
      <button
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
        style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
        @click="handleAllowRemember"
      >
        Allow & Remember
      </button>
      <button
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
        style="background: rgba(205, 49, 49, 0.1); color: #cd3131;"
        @click="handleDeny"
      >
        Deny
      </button>
    </div>
  </div>
</template>
