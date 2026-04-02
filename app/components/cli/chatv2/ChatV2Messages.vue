<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'

const props = defineProps<{
  messages: DisplayChatMessage[]
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean): void
  (e: 'openFile', filePath: string): void
}>()

// Group consecutive assistant messages together
interface MessageGroup {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  messages: DisplayChatMessage[]
}

const messageGroups = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const message of props.messages) {
    const messageRole = message.role || (message.kind === 'text' && message.content ? 'assistant' : 'assistant')

    // Check if we should continue the current group or start a new one
    if (currentGroup && currentGroup.role === messageRole) {
      // Same role - add to current group
      currentGroup.messages.push(message)
    } else {
      // Different role - push current group and start a new one
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = {
        id: message.id,
        role: messageRole,
        timestamp: message.timestamp,
        messages: [message]
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
})

function handlePermissionRespond(permissionId: string, decision: 'allow' | 'deny', remember = false) {
  emit('permissionRespond', permissionId, decision, remember)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Message Groups -->
    <div
      v-for="group in messageGroups"
      :key="group.id"
      class="message-group min-w-0"
    >
      <!-- User Message Group -->
      <div v-if="group.role === 'user'" class="flex justify-end min-w-0">
        <div class="flex items-start gap-2 md:gap-3 max-w-[95%] md:max-w-[85%] min-w-0">
          <div class="flex flex-col items-end gap-1.5 min-w-0">
            <!-- All user messages in this group -->
            <div
              v-for="(msg, idx) in group.messages"
              :key="msg.id"
              class="px-3 md:px-4 py-2 md:py-2.5 min-w-0"
              :class="idx === 0 ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-r-md'"
              style="background: var(--accent); color: white;"
            >
              <div v-if="msg.images && msg.images.length > 0" class="flex flex-wrap gap-2 mb-2">
                <img v-for="(img, i) in msg.images" :key="i" :src="img" class="max-w-[160px] md:max-w-[200px] max-h-[160px] md:max-h-[200px] rounded-lg object-contain bg-white/10" />
              </div>
              <div v-if="msg.content" class="text-[12px] md:text-[13px] whitespace-pre-wrap break-words overflow-wrap-anywhere max-w-full">{{ msg.content }}</div>
            </div>
            <!-- Single timestamp for the group -->
            <div class="text-[9px] md:text-[10px] px-1" style="color: var(--text-tertiary);">
              {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </div>
          </div>
          <!-- User Avatar -->
          <div
            class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center text-[11px] md:text-[12px] font-semibold"
            style="background: var(--accent); color: white;"
          >
            U
          </div>
        </div>
      </div>

      <!-- Assistant Message Group -->
      <div v-else class="flex items-start gap-2 md:gap-3 min-w-0">
        <!-- Claude Avatar -->
        <div
          class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center"
          style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
        >
          <svg class="size-3.5 md:size-4" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
          </svg>
        </div>

        <div class="flex-1 min-w-0 overflow-wrap-anywhere">
          <!-- Claude Header -->
          <div class="flex items-center gap-2 mb-1.5 md:mb-2">
            <span class="text-[12px] md:text-[13px] font-semibold" style="color: var(--text-primary);">Claude</span>
            <span class="text-[9px] md:text-[10px]" style="color: var(--text-tertiary);">
              {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </div>

          <!-- Messages in this group -->
          <div class="space-y-2">
            <ChatV2MessageItem
              v-for="message in group.messages"
              :key="message.id"
              :message="message"
              :show-timestamp="false"
              @permission-respond="handlePermissionRespond"
              @open-file="handleOpenFile"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Streaming indicator when streaming but no text yet -->
    <div
      v-if="isStreaming && messageGroups.length > 0 && !messageGroups[messageGroups.length - 1]?.messages.some(m => m.isStreaming)"
      class="flex items-start gap-3"
    >
      <!-- Claude Avatar -->
      <div
        class="size-8 rounded-full shrink-0 flex items-center justify-center"
        style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
        </svg>
      </div>

      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[13px] font-semibold" style="color: var(--text-primary);">Claude</span>
        </div>
        <div class="flex items-center gap-2 text-[13px]" style="color: var(--text-secondary);">
          <span class="thinking-dots">
            <span>●</span><span>●</span><span>●</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overflow-wrap-anywhere {
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}

/* Force content to respect container width */
.max-w-full {
  max-width: 100%;
}

.thinking-dots {
  display: inline-flex;
  gap: 3px;
}

.thinking-dots span {
  animation: thinking-bounce 1.4s infinite ease-in-out both;
  font-size: 8px;
}

.thinking-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.thinking-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0s;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
