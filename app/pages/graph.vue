<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import type { Relationship } from '~/types'
import { getAgentColor } from '~/utils/colors'
import { getModelBadgeStyle } from '~/utils/models'

const { agents } = useAgents()
const { commands } = useCommands()
const { skills } = useSkills()
const { plugins } = usePlugins()
const { servers: mcpServers } = useMCP()
const router = useRouter()

const relationships = ref<Relationship[]>([])
const loading = ref(true)
const showLegend = ref(true)

const { workingDir } = useWorkingDir()

onMounted(async () => {
  try {
    relationships.value = await $fetch<Relationship[]>('/api/relationships', {
      query: { workingDir: workingDir.value }
    })
  } finally {
    loading.value = false
  }
})

// --- Layout constants ---
const NODE_WIDTH = 220
const COL_GAP = NODE_WIDTH + 60
const Y_GAP = 80
const HEADER_Y = -20

// --- Column labels ---
const columnLabels: Record<string, { label: string; icon: string }> = {
  command: { label: 'Commands', icon: '>_' },
  skill: { label: 'Skills', icon: 'zap' },
  agent: { label: 'Agents', icon: 'cpu' },
  plugin: { label: 'Plugins', icon: 'puzzle' },
  mcp: { label: 'MCP Servers', icon: 'server' },
}

// --- Connected node IDs (for orphan detection) ---
const connectedNodeIds = computed(() => {
  const ids = new Set<string>()
  for (const r of relationships.value) {
    ids.add(`${r.sourceType}-${r.sourceSlug}`)
    ids.add(`${r.targetType}-${r.targetSlug}`)
  }
  return ids
})

// --- Build columns dynamically ---
const columns = computed(() => {
  const cols: { type: string; items: any[] }[] = []
  if (agents.value.length > 0) cols.push({ type: 'agent', items: agents.value })
  if (skills.value.length > 0) cols.push({ type: 'skill', items: skills.value })
  if (plugins.value.length > 0) cols.push({ type: 'plugin', items: plugins.value })
  if (mcpServers.value.length > 0) cols.push({ type: 'mcp', items: mcpServers.value })
  if (commands.value.length > 0) cols.push({ type: 'command', items: commands.value })
  return cols
})

const nodes = computed(() => {
  const result: any[] = []

  columns.value.forEach((col, colIndex) => {
    const x = colIndex * COL_GAP + 40

    // Column header node (non-interactive)
    result.push({
      id: `header-${col.type}`,
      type: 'columnHeader',
      position: { x, y: HEADER_Y },
      data: { label: columnLabels[col.type]?.label ?? col.type },
      selectable: false,
      draggable: false,
      connectable: false,
    })

    col.items.forEach((item, i) => {
      const y = i * Y_GAP + 40
      const nodeId = col.type === 'plugin' ? `plugin-${item.id}` : (col.type === 'mcp' ? `mcp-${item.name}` : `${col.type}-${item.slug}`)
      const isOrphan = !connectedNodeIds.value.has(nodeId)

      if (col.type === 'agent') {
        result.push({
          id: nodeId,
          type: 'agent',
          position: { x, y },
          class: isOrphan ? 'graph-orphan' : '',
          data: {
            label: item.frontmatter.name,
            description: item.frontmatter.description,
            color: getAgentColor(item.frontmatter.color),
            model: item.frontmatter.model,
            slug: item.slug,
            orphan: isOrphan,
          },
        })
      } else if (col.type === 'command') {
        result.push({
          id: nodeId,
          type: 'command',
          position: { x, y },
          class: isOrphan ? 'graph-orphan' : '',
          data: {
            label: item.frontmatter.name,
            slug: item.slug,
            directory: item.directory,
            description: item.frontmatter.description,
            orphan: isOrphan,
          },
        })
      } else if (col.type === 'skill') {
        result.push({
          id: nodeId,
          type: 'skill',
          position: { x, y },
          class: isOrphan ? 'graph-orphan' : '',
          data: {
            label: item.frontmatter.name,
            description: item.frontmatter.description,
            slug: item.slug,
            orphan: isOrphan,
          },
        })
      } else if (col.type === 'plugin') {
        result.push({
          id: nodeId,
          type: 'plugin',
          position: { x, y },
          class: isOrphan ? 'graph-orphan' : '',
          data: {
            label: item.name,
            description: item.description,
            id: item.id,
            enabled: item.enabled,
            skillCount: item.skills.length,
            orphan: isOrphan,
          },
        })
      } else if (col.type === 'mcp') {
        result.push({
          id: nodeId,
          type: 'mcp',
          position: { x, y },
          class: isOrphan ? 'graph-orphan' : '',
          data: {
            label: item.name,
            name: item.name,
            scope: item.scope,
            orphan: isOrphan,
          },
        })
      }
    })
  })

  return result
})

const edgeRelationshipLabels: Record<string, string> = {
  spawns: 'spawns',
  'agent-frontmatter': 'uses agent',
  'spawned-by': 'invokes',
}

const edges = computed(() => {
  return relationships.value.map((r, i) => ({
    id: `edge-${i}`,
    source: `${r.sourceType}-${r.sourceSlug}`,
    target: `${r.targetType}-${r.targetSlug}`,
    type: 'smoothstep',
    animated: r.type === 'spawns',
    label: edgeRelationshipLabels[r.type] ?? r.type,
    labelStyle: { opacity: 0 },
    labelBgStyle: { opacity: 0 },
    data: { relType: r.type },
    style: {
      stroke: r.type === 'spawns' ? 'var(--accent)' : r.type === 'agent-frontmatter' ? 'var(--success)' : 'var(--text-disabled)',
      strokeWidth: r.type === 'spawns' ? 2 : 1,
      opacity: r.type === 'spawns' ? 0.7 : 0.4,
    },
  }))
})

// --- Hover highlighting ---
const hoveredNodeId = ref<string | null>(null)
const graphCanvasRef = ref<HTMLElement | null>(null)

const neighborMap = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const r of relationships.value) {
    const src = `${r.sourceType}-${r.sourceSlug}`
    const tgt = `${r.targetType}-${r.targetSlug}`
    if (!map.has(src)) map.set(src, new Set())
    if (!map.has(tgt)) map.set(tgt, new Set())
    map.get(src)!.add(tgt)
    map.get(tgt)!.add(src)
  }
  return map
})

const highlightedNodeIds = computed(() => {
  if (!hoveredNodeId.value) return new Set<string>()
  const neighbors = neighborMap.value.get(hoveredNodeId.value)
  const set = new Set<string>([hoveredNodeId.value])
  if (neighbors) neighbors.forEach(n => set.add(n))
  return set
})

const highlightedEdgeIds = computed(() => {
  if (!hoveredNodeId.value) return new Set<string>()
  const set = new Set<string>()
  relationships.value.forEach((r, i) => {
    const src = `${r.sourceType}-${r.sourceSlug}`
    const tgt = `${r.targetType}-${r.targetSlug}`
    if (src === hoveredNodeId.value || tgt === hoveredNodeId.value) {
      set.add(`edge-${i}`)
    }
  })
  return set
})

function hasClientXY(e: unknown): e is { clientX: number; clientY: number } {
  return (
    typeof e === 'object'
    && e != null
    && 'clientX' in e
    && 'clientY' in e
    && typeof (e as { clientX: unknown }).clientX === 'number'
    && typeof (e as { clientY: unknown }).clientY === 'number'
  )
}

/**
 * @vue-flow/core may call handlers as either (event, node) or a single payload { event, node }.
 */
function parseVueFlowNodeArgs(first: unknown, second?: unknown): {
  event: { clientX: number; clientY: number } | undefined
  node: any
} {
  if (second != null && second !== undefined) {
    return {
      event: hasClientXY(first) ? first : undefined,
      node: second,
    }
  }
  const p = first as Record<string, unknown> | undefined
  if (p && typeof p === 'object' && p.node != null) {
    return {
      event: hasClientXY(p.event) ? p.event : undefined,
      node: p.node,
    }
  }
  if (p && typeof p === 'object' && typeof p.id === 'string' && (p.data != null || p.type != null)) {
    return { event: undefined, node: p }
  }
  return { event: undefined, node: undefined }
}

function onNodeMouseEnter(first: unknown, second?: unknown) {
  const { node } = parseVueFlowNodeArgs(first, second)
  if (!node?.id) return
  if (node.id.startsWith('header-')) return
  hoveredNodeId.value = node.id
  applyHighlightClasses()
}

function onNodeMouseLeave() {
  hoveredNodeId.value = null
  clearHighlightClasses()
}

function applyHighlightClasses() {
  const el = graphCanvasRef.value
  if (!el) return

  el.classList.add('graph-dimmed')

  nextTick(() => {
    // Highlight nodes
    el.querySelectorAll('.vue-flow__node').forEach((nodeEl) => {
      const id = nodeEl.getAttribute('data-id')
      if (id && highlightedNodeIds.value.has(id)) {
        nodeEl.classList.add('graph-highlighted')
      } else {
        nodeEl.classList.remove('graph-highlighted')
      }
    })

    // Highlight edges + show labels
    el.querySelectorAll('.vue-flow__edge').forEach((edgeEl) => {
      const id = edgeEl.getAttribute('data-id')
      if (id && highlightedEdgeIds.value.has(id)) {
        edgeEl.classList.add('graph-edge-highlighted')
        const labelEl = edgeEl.querySelector('.vue-flow__edge-text') as HTMLElement | null
        const labelBgEl = edgeEl.querySelector('.vue-flow__edge-textbg') as HTMLElement | null
        if (labelEl) labelEl.style.opacity = '1'
        if (labelBgEl) labelBgEl.style.opacity = '1'
      } else {
        edgeEl.classList.remove('graph-edge-highlighted')
        const labelEl = edgeEl.querySelector('.vue-flow__edge-text') as HTMLElement | null
        const labelBgEl = edgeEl.querySelector('.vue-flow__edge-textbg') as HTMLElement | null
        if (labelEl) labelEl.style.opacity = '0'
        if (labelBgEl) labelBgEl.style.opacity = '0'
      }
    })
  })
}

function clearHighlightClasses() {
  const el = graphCanvasRef.value
  if (!el) return

  el.classList.remove('graph-dimmed')
  el.querySelectorAll('.graph-highlighted').forEach(e => e.classList.remove('graph-highlighted'))
  el.querySelectorAll('.graph-edge-highlighted').forEach(e => e.classList.remove('graph-edge-highlighted'))

  // Hide all edge labels
  el.querySelectorAll('.vue-flow__edge-text').forEach((e) => {
    ;(e as HTMLElement).style.opacity = '0'
  })
  el.querySelectorAll('.vue-flow__edge-textbg').forEach((e) => {
    ;(e as HTMLElement).style.opacity = '0'
  })
}

// --- Tooltip ---
const tooltip = ref<{ text: string; x: number; y: number } | null>(null)

function showTooltip(event: { clientX: number; clientY: number }, description: string | undefined) {
  if (!description) return
  tooltip.value = {
    text: description,
    x: event.clientX + 12,
    y: event.clientY + 12,
  }
}

function hideTooltip() {
  tooltip.value = null
}

// Combined handlers
function handleNodeMouseEnter(first: unknown, second?: unknown) {
  const { event, node } = parseVueFlowNodeArgs(first, second)
  onNodeMouseEnter(first, second)
  if (node?.data?.description && event) showTooltip(event, node.data.description)
}

function handleNodeMouseLeave() {
  onNodeMouseLeave()
  hideTooltip()
}

function onNodeClick(first: unknown, second?: unknown) {
  const { node } = parseVueFlowNodeArgs(first, second)
  if (!node?.type || !node.data) return
  if (node.type === 'agent') router.push(`/agents/${node.data.slug}`)
  else if (node.type === 'command') router.push(`/commands/${node.data.slug}`)
  else if (node.type === 'skill') router.push(`/skills/${node.data.slug}`)
  else if (node.type === 'plugin') router.push(`/plugins/${node.data.id}`)
  else if (node.type === 'mcp') router.push({ path: `/mcp/${encodeURIComponent(node.data.name)}`, query: { scope: node.data.scope } })
}
</script>

<template>
  <div class="relative h-screen flex flex-col">
    <!-- Floating header -->
    <div
      class="absolute top-0 left-0 right-0 z-10 h-14 flex items-center gap-3 px-6"
      style="background: color-mix(in srgb, var(--surface-base) 85%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-subtle);"
    >
      <h1 class="text-page-title flex-1">Graph</h1>
      <span class="font-mono text-[11px]" style="color: var(--text-disabled);">
        {{ nodes.filter(n => n.type !== 'columnHeader').length }} nodes
      </span>
      <span class="font-mono text-[11px]" style="color: var(--text-disabled);">
        {{ edges.length }} edges
      </span>
      <button
        class="font-mono text-[11px] px-2 py-1 rounded focus-ring"
        style="color: var(--text-tertiary); background: var(--surface-raised); border: 1px solid var(--border-default);"
        @click="showLegend = !showLegend"
      >
        {{ showLegend ? 'Hide' : 'Show' }} Legend
      </button>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center" style="background: var(--surface-base);">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" style="color: var(--text-disabled);" />
    </div>

    <div v-else ref="graphCanvasRef" class="flex-1 graph-canvas">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        fit-view-on-init
        :default-edge-options="{ type: 'smoothstep' }"
        :min-zoom="0.3"
        :max-zoom="2"
        @node-click="onNodeClick"
        @node-mouse-enter="handleNodeMouseEnter"
        @node-mouse-leave="handleNodeMouseLeave"
      >
        <!-- Column header (non-interactive label) -->
        <template #node-columnHeader="{ data }">
          <div class="graph-col-header">
            {{ data.label }}
          </div>
        </template>

        <!-- Agent node -->
        <template #node-agent="{ data }">
          <div
            class="graph-node graph-node--agent"
            :class="{ 'graph-node--orphan': data.orphan }"
            :style="{
              '--node-glow': `${data.color}25`,
              borderColor: data.orphan ? undefined : `${data.color}30`,
            }"
          >
            <div class="flex items-center gap-2">
              <div class="size-2 rounded-full shrink-0" :style="{ background: data.color }" />
              <span class="font-mono text-[11px] font-medium truncate" style="color: var(--text-primary);">
                {{ data.label }}
              </span>
              <span
                v-if="data.model"
                class="ml-auto text-[9px] font-mono font-medium px-1.5 py-px rounded-full shrink-0"
                :style="getModelBadgeStyle(data.model)"
              >
                {{ data.model }}
              </span>
            </div>
          </div>
        </template>

        <!-- Command node -->
        <template #node-command="{ data }">
          <div class="graph-node graph-node--command" :class="{ 'graph-node--orphan': data.orphan }">
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-[10px] font-medium shrink-0" style="color: var(--text-disabled);">
                &gt;_
              </span>
              <span class="font-mono text-[11px] truncate" style="color: var(--text-secondary);">
                /{{ data.label }}
              </span>
            </div>
          </div>
        </template>

        <!-- Skill node -->
        <template #node-skill="{ data }">
          <div class="graph-node graph-node--skill" :class="{ 'graph-node--orphan': data.orphan }">
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-zap" class="size-3 shrink-0" style="color: var(--model-haiku);" />
              <span class="font-mono text-[11px] font-medium truncate" style="color: var(--text-secondary);">
                {{ data.label }}
              </span>
            </div>
          </div>
        </template>

        <!-- Plugin node -->
        <template #node-plugin="{ data }">
          <div class="graph-node graph-node--plugin" :class="{ 'graph-node--orphan': data.orphan }">
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-puzzle" class="size-3 shrink-0" style="color: var(--model-sonnet);" />
              <span class="font-mono text-[11px] font-medium truncate" style="color: var(--text-secondary);">
                {{ data.label }}
              </span>
              <span
                class="ml-auto text-[9px] font-mono px-1 py-px rounded-full shrink-0"
                :style="{
                  background: data.enabled ? 'rgba(74,222,128,0.15)' : 'var(--badge-subtle-bg)',
                  color: data.enabled ? 'var(--success)' : 'var(--text-disabled)',
                }"
              >
                {{ data.enabled ? 'on' : 'off' }}
              </span>
            </div>
            <div v-if="data.skillCount" class="text-[10px] mt-0.5" style="color: var(--text-tertiary);">
              {{ data.skillCount }} skill{{ data.skillCount !== 1 ? 's' : '' }}
            </div>
          </div>
        </template>

        <!-- MCP node -->
        <template #node-mcp="{ data }">
          <div class="graph-node graph-node--mcp" :class="{ 'graph-node--orphan': data.orphan }">
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-server" class="size-3 shrink-0" style="color: var(--accent);" />
              <span class="font-mono text-[11px] font-medium truncate" style="color: var(--text-secondary);">
                {{ data.label }}
              </span>
              <span
                class="ml-auto text-[8px] font-mono px-1 py-px rounded-full shrink-0 uppercase border"
                :style="{
                  borderColor: data.scope === 'global' ? 'rgba(229,169,62,0.3)' : 'var(--border-subtle)',
                  color: data.scope === 'global' ? 'var(--accent)' : 'var(--text-disabled)',
                }"
              >
                {{ data.scope }}
              </span>
            </div>
          </div>
        </template>

        <Controls position="bottom-right" />
        <MiniMap position="top-right" :style="{ marginTop: '64px' }" />
      </VueFlow>

      <!-- Hover tooltip -->
      <div
        v-if="tooltip"
        class="graph-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        {{ tooltip.text }}
      </div>

      <!-- Legend -->
      <Transition name="page">
        <div
          v-if="showLegend"
          class="absolute bottom-4 left-4 z-10 rounded-lg p-3 text-[11px] space-y-2"
          style="background: color-mix(in srgb, var(--surface-base) 92%, transparent); backdrop-filter: blur(12px); border: 1px solid var(--border-default);"
        >
          <div class="font-mono font-semibold mb-2" style="color: var(--text-secondary);">Legend</div>
          <div class="flex items-center gap-2">
            <div class="size-2.5 rounded-full" style="background: var(--accent);" />
            <span style="color: var(--text-tertiary);">Agent</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-[9px]" style="color: var(--text-disabled);">&gt;_</span>
            <span style="color: var(--text-tertiary);">Command</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-zap" class="size-3" style="color: var(--model-haiku);" />
            <span style="color: var(--text-tertiary);">Skill</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-puzzle" class="size-3" style="color: var(--model-sonnet);" />
            <span style="color: var(--text-tertiary);">Plugin</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-server" class="size-3" style="color: var(--accent);" />
            <span style="color: var(--text-tertiary);">MCP Server</span>
          </div>
          <hr style="border-color: var(--border-subtle);" />
          <div class="flex items-center gap-2">
            <div class="w-5 h-[2px] rounded-full" style="background: var(--accent);" />
            <span style="color: var(--text-tertiary);">Spawns / provides</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-5 h-[1px] rounded-full" style="background: var(--success); opacity: 0.5;" />
            <span style="color: var(--text-tertiary);">Uses</span>
          </div>
          <hr style="border-color: var(--border-subtle);" />
          <div class="flex items-center gap-2">
            <div class="size-3 rounded" style="border: 1px dashed var(--border-default); opacity: 0.55;" />
            <span style="color: var(--text-tertiary);">No connections</span>
          </div>
          <div class="mt-1" style="color: var(--text-disabled);">
            Hover a node to highlight connections
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
