# Chat Interface Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ChatV2Interface` and its sub-components responsive across mobile, tablet, and desktop — fixing sidebar overflow, header cramping, message width, and code block overflow.

**Architecture:** All changes are Tailwind class additions and small template restructures in three existing files. No new files or components are created. The sidebar gains a mobile drawer mode driven by existing `isMobileScreen` / `mobileSidebarOpen` refs. The header splits into two rows below `sm:` (640px). Messages get a centered `max-w-[800px]` wrapper.

**Tech Stack:** Nuxt 3, Vue 3, Tailwind CSS (utility-first, responsive prefixes `sm:` / `md:` / `lg:`)

---

## File Map

| File | Changes |
|---|---|
| `app/components/cli/chatv2/ChatV2Interface.vue` | Sidebar drawer, sidebarWidth tiers, header two-row split, messages centered wrapper |
| `app/components/cli/chatv2/ChatV2MessageItem.vue` | Scoped CSS for prose code block overflow |
| `app/components/cli/chatv2/ChatV2Input.vue` | Responsive outer padding, responsive textarea max-height |

---

## Task 1: Sidebar — responsive width tiers + remove auto-collapse

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2Interface.vue`

- [ ] **Step 1: Update `sidebarWidth` computed**

In `ChatV2Interface.vue`, find the `sidebarWidth` computed (around line 83) and replace it:

```ts
// Before
const sidebarWidth = computed(() => {
  if (sidebarCollapsed.value) return '56px'
  if (windowWidth.value < 1280) return '260px' // Smaller sidebar for laptops
  return '320px' // Standard width for desktops
})

// After
const sidebarWidth = computed(() => {
  if (sidebarCollapsed.value) return '56px'
  if (windowWidth.value < 1024) return '220px'
  if (windowWidth.value < 1280) return '260px'
  return '320px'
})
```

- [ ] **Step 2: Remove auto-collapse on mount**

Find the `onMounted` block (around line 71) and remove the auto-collapse condition. Replace the whole block:

```ts
// Before
onMounted(() => {
  window.addEventListener('resize', updateWidth)
  // Auto-collapse sidebar on small laptop screens
  if (windowWidth.value < 1100) {
    sidebarCollapsed.value = true
  }
})

// After
onMounted(() => {
  window.addEventListener('resize', updateWidth)
})
```

- [ ] **Step 3: Add watcher to close mobile drawer on resize to desktop**

Add this watch after the existing `onUnmounted` block:

```ts
watch(isMobileScreen, (isMobile) => {
  if (!isMobile) {
    mobileSidebarOpen.value = false
  }
})
```

- [ ] **Step 4: Verify in browser**

Run `bun run dev`. Open http://localhost:3000/cli. At 1280px+ the sidebar should be 320px. At 1024–1279px it should be 260px. At 768–1023px it should be 220px. No auto-collapse on load.

- [ ] **Step 5: Commit**

```bash
git add app/components/cli/chatv2/ChatV2Interface.vue
git commit -m "feat: responsive sidebar width tiers, remove auto-collapse"
```

---

## Task 2: Sidebar — mobile drawer overlay

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2Interface.vue`

- [ ] **Step 1: Replace sidebar div with drawer-aware version**

Find the sidebar section in the template (around line 601). It currently looks like:

```html
<!-- Left Sidebar - Claude Code History -->
<div
  class="shrink-0 flex flex-col border-r transition-all duration-300"
  :style="{
    width: sidebarWidth,
    borderColor: 'var(--border-subtle)',
    background: 'var(--surface-base)',
  }"
>
```

Replace the entire opening `<div>` tag with this (keep the inner `<ChatV2ProjectsSidebar>` and closing `</div>` unchanged):

```html
<!-- Mobile backdrop -->
<Transition name="fade">
  <div
    v-if="isMobileScreen && mobileSidebarOpen"
    class="fixed inset-0 bg-black/40 z-40"
    @click="mobileSidebarOpen = false"
  />
</Transition>

<!-- Left Sidebar - Claude Code History -->
<div
  :class="[
    'flex flex-col border-r transition-all duration-300',
    isMobileScreen ? 'fixed inset-y-0 left-0 z-50' : 'shrink-0',
  ]"
  :style="{
    width: isMobileScreen ? '280px' : sidebarWidth,
    transform: isMobileScreen
      ? (mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)')
      : undefined,
    borderColor: 'var(--border-subtle)',
    background: 'var(--surface-base)',
  }"
>
```

- [ ] **Step 2: Verify drawer behaviour**

Resize browser to < 768px (use DevTools responsive mode). The sidebar should be off-screen. Clicking the hamburger (not yet added — note it will be wired in Task 3) should bring it in. For now, toggle `mobileSidebarOpen` manually in Vue DevTools to verify the slide animation and backdrop appear. Resize back to > 768px — drawer should auto-close.

- [ ] **Step 3: Commit**

```bash
git add app/components/cli/chatv2/ChatV2Interface.vue
git commit -m "feat: mobile sidebar drawer overlay with backdrop"
```

---

## Task 3: Header — hamburger button + two-row on mobile

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2Interface.vue`

- [ ] **Step 1: Restructure header container**

Find the header `<div>` (around line 629). It currently starts:

```html
<div
  class="shrink-0 flex items-center justify-between px-3 md:px-4 h-14 border-b relative z-20"
  style="border-color: var(--border-subtle); background: var(--surface-base);"
>
```

Replace this opening tag (keep inner content for now):

```html
<div
  class="shrink-0 border-b relative z-20"
  style="border-color: var(--border-subtle); background: var(--surface-base);"
>
  <div class="flex items-center justify-between px-3 md:px-4 h-14">
```

And close it with an extra `</div>` after the existing closing `</div>` of the header (around line 719):

```html
  </div><!-- closes inner h-14 row -->
</div><!-- closes outer header container -->
```

- [ ] **Step 2: Add hamburger button inside the left group**

Inside the left `<div class="flex items-center gap-2 min-w-0 flex-1">` (around line 632), add the hamburger as the first child:

```html
<!-- Hamburger - mobile only -->
<button
  v-if="isMobileScreen"
  class="shrink-0 p-1.5 rounded-lg mr-0.5"
  style="color: var(--text-secondary);"
  @click="mobileSidebarOpen = true"
>
  <UIcon name="i-lucide-menu" class="size-5" />
</button>
```

- [ ] **Step 3: Hide right-side controls on mobile**

Find the right-side `<div class="flex items-center gap-2 shrink-0">` (around line 698). Add `hidden sm:flex` to it so it only shows on `sm:` and above:

```html
<div class="hidden sm:flex items-center gap-2 shrink-0">
```

Also hide the session ID span on mobile — find it (around line 715) and add `hidden sm:inline`:

```html
<span v-if="viewMode === 'live' && currentSessionId" class="hidden sm:inline text-[10px] font-mono" style="color: var(--text-tertiary);">
  {{ currentSessionId.slice(0, 8) }}
</span>
```

- [ ] **Step 4: Add Row 2 for mobile controls**

After the closing `</div>` of the inner `h-14` row (from Step 1), add the second row before the outer closing `</div>`:

```html
  <!-- Row 2: model + permission controls — mobile only -->
  <div
    v-if="isMobileScreen && ((viewMode === 'history' && urlSessionId) || (viewMode === 'live' && isLiveChat) || (viewMode === 'live' && currentSessionId))"
    class="flex items-center gap-2 px-3 pb-2"
  >
    <ChatV2ModelSelector
      v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && isLiveChat)"
      v-model="selectedModel"
      :options="MODEL_OPTIONS_CHAT"
    />
    <ChatV2PermissionModeSelector
      v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && currentSessionId)"
      v-model="selectedPermissionMode"
      :options="permissionModeOptions"
    />
  </div>
```

- [ ] **Step 5: Verify header at all breakpoints**

- < 640px: Hamburger appears, single row with session name + status indicators only. When a session is active, a second row appears below with model selector + permission mode.
- 640px+: Single `h-14` row with all controls visible, no hamburger.
- Tapping hamburger on mobile should open the sidebar drawer (wired in Task 2).

- [ ] **Step 6: Commit**

```bash
git add app/components/cli/chatv2/ChatV2Interface.vue
git commit -m "feat: two-row header on mobile, hamburger wires sidebar drawer"
```

---

## Task 4: Messages — centered `max-w-[800px]` column

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2Interface.vue`

- [ ] **Step 1: Strip padding from the scroll container**

Find the `messagesContainerRef` div (around line 731):

```html
<div
  ref="messagesContainerRef"
  class="h-full overflow-y-auto px-2 py-3 md:p-4 space-y-4 transition-opacity duration-200"
  ...
>
```

Remove `px-2 py-3 md:p-4 space-y-4` from its class list:

```html
<div
  ref="messagesContainerRef"
  class="h-full overflow-y-auto transition-opacity duration-200"
  :style="{
    background: 'var(--surface-base)',
    opacity: isInitialScroll ? 0 : 1
  }"
  @scroll="handleMessagesScroll"
>
```

- [ ] **Step 2: Wrap all content states in a centered column**

Immediately after the opening tag of `messagesContainerRef`, add the wrapper opening tag. The wrapper must close **before** the floating controls `<div>` (the `absolute bottom-0` div around line 832):

```html
  <!-- Centered content column -->
  <div class="max-w-[800px] mx-auto w-full px-4 py-4 space-y-4">
    <!-- All content states: isCreatingSession, isLoadingHistoryWithDelay,
         welcome state, empty state, and the message list template — all go here -->
    ...
  </div><!-- end centered column -->

  <!-- Floating Controls stay OUTSIDE the centered wrapper, uses absolute positioning -->
  <div
    v-if="..."
    class="absolute bottom-0 left-0 right-0 ..."
  >
```

- [ ] **Step 3: Verify centering**

At 1280px+ the message content should appear centered with whitespace on both sides. At 800px and below it fills full width naturally. The floating thinking toggle + context circle should still be pinned to the bottom of the full-width scroll container.

- [ ] **Step 4: Commit**

```bash
git add app/components/cli/chatv2/ChatV2Interface.vue
git commit -m "feat: centered 800px message column with full-width scroll container"
```

---

## Task 5: Message overflow — prose code block CSS

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2MessageItem.vue`

- [ ] **Step 1: Add scoped CSS for prose elements**

Find the `<style scoped>` block at the bottom of `ChatV2MessageItem.vue` (or add one if absent):

```vue
<style scoped>
.prose :deep(pre) {
  overflow-x: auto;
  max-width: 100%;
}

.prose :deep(code) {
  word-break: break-word;
}

.prose :deep(table) {
  display: block;
  overflow-x: auto;
  max-width: 100%;
}
</style>
```

- [ ] **Step 2: Verify code block overflow**

In the chat, send a message that produces a long code block response (e.g., "show me a very long bash one-liner"). The code block should scroll horizontally inside its container without the message layout breaking.

- [ ] **Step 3: Commit**

```bash
git add app/components/cli/chatv2/ChatV2MessageItem.vue
git commit -m "fix: prose code blocks scroll horizontally instead of overflowing"
```

---

## Task 6: Input — responsive padding and textarea max-height

**Files:**
- Modify: `app/components/cli/chatv2/ChatV2Input.vue`

- [ ] **Step 1: Update outer padding**

Find the outer wrapper `<div>` (around line 88):

```html
<div class="px-3 py-2" style="background: var(--surface-base);">
```

Replace with responsive padding:

```html
<div class="px-2 py-1.5 sm:px-3 sm:py-2" style="background: var(--surface-base);">
```

- [ ] **Step 2: Make textarea max-height responsive**

Find `autoResize` (around line 58):

```ts
// Before
function autoResize() {
  if (!textareaRef.value) return
  textareaRef.value.style.height = 'auto'
  const newHeight = Math.min(textareaRef.value.scrollHeight, 200)
  textareaRef.value.style.height = `${newHeight}px`
}
```

Replace with:

```ts
// After
function autoResize() {
  if (!textareaRef.value) return
  textareaRef.value.style.height = 'auto'
  const maxHeight = window.innerWidth < 640 ? 120 : window.innerWidth < 768 ? 160 : 200
  const newHeight = Math.min(textareaRef.value.scrollHeight, maxHeight)
  textareaRef.value.style.height = `${newHeight}px`
}
```

- [ ] **Step 3: Remove the hardcoded `maxHeight` inline style from the textarea**

Find the textarea element (around line 113). It has:

```html
:style="{
  color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
  maxHeight: '160px',
}"
```

Remove the `maxHeight` line (it is now managed dynamically by `autoResize`):

```html
:style="{
  color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
}"
```

- [ ] **Step 4: Verify input on small screens**

Resize to < 640px. Type multiple lines of text — the textarea should stop growing at ~120px. On sm+, it grows to 160px. On md+, 200px.

- [ ] **Step 5: Commit**

```bash
git add app/components/cli/chatv2/ChatV2Input.vue
git commit -m "feat: responsive input padding and textarea max-height by breakpoint"
```

---

## Task 7: Final integration verification

- [ ] **Step 1: Smoke test at each breakpoint**

Open http://localhost:3000/cli in a browser. Use DevTools device emulation to check:

| Breakpoint | Check |
|---|---|
| 375px (iPhone SE) | Hamburger visible, sidebar hidden, header single row with status only, second row appears when session is active, messages full-width, input compact |
| 640px | Header single row (model + permission visible), no hamburger, messages full-width |
| 768px | Sidebar visible at 220px, single-row header |
| 1024px | Sidebar at 260px |
| 1280px+ | Sidebar at 320px, messages centered with whitespace on both sides |

- [ ] **Step 2: Verify no horizontal scroll on the page**

At each breakpoint above, confirm there is no horizontal scrollbar on the page body. Trigger a long code block response and confirm it scrolls within the message bubble only.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: chat interface responsive design complete"
```
