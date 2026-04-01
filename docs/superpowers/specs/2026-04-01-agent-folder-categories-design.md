# Agent Folder Categories — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Goal

Redesign the agents list page so users can visually understand which agents belong to the same category. Categories are determined by the agent's filesystem folder under `~/.claude/agents/`.

## Background

Currently agents are stored as flat files in `~/.claude/agents/*.md` and displayed in an ungrouped grid. Commands already support subdirectories (`~/.claude/commands/{folder}/*.md`) with a `directory` field on the `Command` type. This spec mirrors that pattern for agents.

---

## Data Model

### `Agent` type (`app/types/index.ts`)

Add `directory: string` field:

```ts
export interface Agent {
  slug: string
  filename: string
  directory: string        // '' for root, 'engineering' for agents/engineering/
  frontmatter: AgentFrontmatter
  body: string
  hasMemory: boolean
  filePath: string
}
```

### `AgentPayload` type

Add optional `directory` for create/update operations:

```ts
export interface AgentPayload {
  frontmatter: AgentFrontmatter
  body: string
  directory?: string       // '' or undefined = root
}
```

---

## Backend Changes

### `server/api/agents/index.get.ts`

Replace flat `readdir` scan with a recursive `scanDir` function (mirrors `server/api/commands/index.get.ts`):

- Recursively walks `~/.claude/agents/`
- `directory` = relative path from `agents/` root (e.g. `'engineering'`, `'writing'`, `''` for root)
- `slug` = filename without `.md` (unchanged — no directory prefix in slug)
- Returns all agents sorted alphabetically by slug

### `server/api/agents/index.post.ts`

- Accept `directory` from payload body
- Write file to `agents/{directory}/{slug}.md` (create subdirectory if needed)
- Return `directory` in response

### `server/api/agents/[slug].put.ts`

- Accept optional `directory` in payload
- If `directory` changes, move file to new location (rename + write)
- Return updated `directory` in response

---

## Frontend Changes

### `app/pages/agents/index.vue`

**Grouping computed property:**

```ts
const groupedAgents = computed(() => {
  const groups: Record<string, Agent[]> = {}
  for (const agent of filteredAgents.value) {
    const key = agent.directory || ''
    ;(groups[key] ??= []).push(agent)
  }
  // Named groups alphabetically, uncategorized ('') last
  return Object.entries(groups).sort(([a], [b]) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })
})
```

**Template structure:**

- Replace the single flat grid with `v-for` over `groupedAgents`
- Each group renders:
  1. **Section header** (only when `directory !== ''`): folder icon + title-cased directory name + agent count badge + full-width divider
  2. **Card grid**: same responsive `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3` with existing `AgentCard` components
- Root agents (`directory === ''`) render with no section header if they are the only group; render with a subtle "General" label if mixed with named groups

**Search behavior:**

- Filter logic unchanged (searches name + description)
- Groups with zero matching agents are hidden entirely

**Graceful degradation:**

- If all agents are in root (no subdirectories used), the page looks identical to today — no headers, single flat grid

---

## Non-Goals

- No drag-and-drop reordering between folders
- No folder create/rename UI in this spec (folders are managed via filesystem or agent create/edit form)
- No nested subdirectories beyond one level deep (e.g. `agents/engineering/backend/` is ignored or treated as `engineering/backend`)

---

## File Checklist

| File | Change |
|------|--------|
| `app/types/index.ts` | Add `directory: string` to `Agent`, `directory?: string` to `AgentPayload` |
| `server/api/agents/index.get.ts` | Replace flat scan with recursive `scanDir` |
| `server/api/agents/index.post.ts` | Support `directory` in payload, write to subdirectory |
| `server/api/agents/[slug].put.ts` | Support `directory` change, move file if needed |
| `app/pages/agents/index.vue` | Add `groupedAgents` computed, render section headers per group |
