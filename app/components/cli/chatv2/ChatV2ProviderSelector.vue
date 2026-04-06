<!-- app/components/cli/chatv2/ChatV2ProviderSelector.vue -->
<script setup lang="ts">
import type { ProviderEntry } from '~/types'

const props = defineProps<{
  modelValue: string
  options: Pick<ProviderEntry, 'name' | 'displayName'>[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() => props.options.find(o => o.name === props.modelValue))

function selectOption(name: string) {
  emit('update:modelValue', name)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <!-- Only show when there are multiple providers to choose from -->
  <div v-if="options.length > 1" ref="dropdownRef" class="relative z-10">
    <button
      class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
      style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
      @click="isOpen = !isOpen"
    >
      <UIcon name="i-lucide-server" class="size-3 shrink-0" />
      <span>{{ selectedOption?.displayName ?? 'Claude' }}</span>
      <UIcon
        :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-3 shrink-0"
      />
    </button>

    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="absolute top-full left-0 mt-1 w-48 rounded-xl overflow-hidden z-50"
        style="background: var(--surface-overlay); border: 1px solid var(--border-default); box-shadow: 0 4px 20px rgba(0,0,0,0.15);"
      >
        <div class="py-1">
          <button
            v-for="option in options"
            :key="option.name"
            class="w-full px-3 py-2 text-left transition-all"
            :style="{ background: option.name === modelValue ? 'var(--accent-muted)' : 'transparent' }"
            :class="option.name !== modelValue ? 'hover:bg-[var(--surface-hover)]' : ''"
            @click="selectOption(option.name)"
          >
            <div class="flex items-center gap-2">
              <UIcon
                v-if="option.name === modelValue"
                name="i-lucide-check"
                class="size-3"
                style="color: var(--accent);"
              />
              <span v-else class="size-3" />
              <span class="text-[12px] font-medium" style="color: var(--text-primary);">
                {{ option.displayName }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>

  <!-- Single provider: plain label, no interaction -->
  <div v-else class="flex items-center gap-1.5 px-2 text-[11px]" style="color: var(--text-secondary);">
    <UIcon name="i-lucide-server" class="size-3" />
    <span>{{ options[0]?.displayName ?? 'Claude' }}</span>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
