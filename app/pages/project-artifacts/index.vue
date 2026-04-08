<script setup lang="ts">
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'

const history = useClaudeCodeHistory()
const { projects, isLoadingProjects, fetchProjects } = history

const searchQuery = ref('')

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projects.value
  const q = searchQuery.value.toLowerCase()
  return projects.value.filter(p => 
    p.displayName.toLowerCase().includes(q) || 
    p.path.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q)
  )
})

onMounted(async () => {
  await fetchProjects()
})

useHead({
  title: 'Project Artifacts | Agent Manager',
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <PageHeader title="Project Artifacts">
      <template #trailing>
        <span class="text-[12px] text-meta">
          {{ projects.length }} projects detected
        </span>
      </template>
      <template #right>
        <div class="flex items-center gap-3">
          <input
            v-model="searchQuery"
            placeholder="Search projects..."
            class="field-search w-64"
          />
          <button
            class="p-2 rounded-lg transition-all hover-bg flex items-center justify-center shrink-0"
            style="background: var(--surface-raised); color: var(--text-secondary);"
            title="Refresh projects"
            :disabled="isLoadingProjects"
            @click="fetchProjects"
          >
            <UIcon 
              name="i-lucide-refresh-cw" 
              class="size-4" 
              :class="{ 'animate-spin': isLoadingProjects }"
            />
          </button>
          <NuxtLink
            to="/cli"
            class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2"
            style="background: var(--accent); color: white;"
          >
            <UIcon name="i-lucide-plus" class="size-4" />
            New Chat
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div v-if="isLoadingProjects && projects.length === 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div v-for="i in 8" :key="i" class="h-[140px] rounded-xl animate-pulse" style="background: var(--surface-raised);" />
      </div>

      <div v-else-if="filteredProjects.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.name"
          :project="project"
        />
      </div>

      <div v-else class="flex flex-col items-center justify-center py-20 text-center">
        <div class="size-20 rounded-3xl flex items-center justify-center mb-6" style="background: var(--surface-raised);">
          <UIcon name="i-lucide-folder-x" class="size-10 text-meta" />
        </div>
        <h2 class="text-[18px] font-semibold mb-2" style="color: var(--text-primary);">
          {{ searchQuery ? 'No projects match your search' : 'No Claude projects found' }}
        </h2>
        <p class="text-[14px] text-meta max-w-sm mx-auto mb-8">
          {{ searchQuery ? 'Try adjusting your search query or refresh the list.' : 'Projects will appear here after you start a chat in a specific directory using Claude Code CLI.' }}
        </p>
        <UButton
          v-if="!searchQuery"
          label="Refresh List"
          icon="i-lucide-refresh-cw"
          size="sm"
          @click="fetchProjects"
        />
      </div>
    </div>
  </div>
</template>
