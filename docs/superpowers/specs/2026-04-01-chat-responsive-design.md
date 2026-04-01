# Chat Interface Responsive Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Goal

Make the `ChatV2Interface` responsive across small, medium-small, medium, and large screen sizes. Fix component overflow so chat text is always readable and code blocks never break the layout.

---

## Breakpoints

Uses Tailwind's standard breakpoints throughout — no custom values.

| Label | Width | Tailwind prefix |
|---|---|---|
| Small (mobile) | < 640px | *(default)* |
| Medium-small | 640–768px | `sm:` |
| Medium (tablet) | 768–1024px | `md:` |
| Large (desktop) | 1024px+ | `lg:` |

---

## Section 1 — Sidebar

### Behavior by breakpoint

- **< 768px (mobile):** Sidebar is removed from the document flow entirely. A hamburger `☰` button in the header opens it as a `fixed` overlay drawer (full height, 280px wide, `z-50`) that slides in from the left via `translateX`. A dark backdrop (`bg-black/40`, `z-40`) covers the chat area behind the drawer; clicking it closes the drawer.
- **768px–1024px (tablet):** Sidebar is in-flow and **open by default** at **220px**.
- **1024px–1280px (laptop):** Sidebar open by default at **260px**.
- **1280px+ (desktop):** Sidebar open by default at **320px** (current behavior).

### Collapse toggle

The collapse-to-56px toggle remains available at all non-mobile sizes. It is user-initiated only — the sidebar no longer auto-collapses on mount for any breakpoint.

### Implementation — `ChatV2Interface.vue`

- `sidebarWidth` computed updated with the four-tier values above.
- Auto-collapse on mount removed (or threshold lowered to `< 768` so it only applies on mobile where the drawer is used instead).
- `isMobileScreen` (`windowWidth < 768`) gates drawer mode vs. in-flow rendering.
- Mobile sidebar `div` gets `fixed inset-y-0 left-0 z-50 transition-transform` toggled between `translate-x-0` and `-translate-x-full` via `mobileSidebarOpen`.
- Backdrop `div`: `fixed inset-0 bg-black/40 z-40`, rendered with `v-if="isMobileScreen && mobileSidebarOpen"`, closes drawer on click.
- Hamburger button added to the header left side, visible only when `isMobileScreen`.

---

## Section 2 — Header

### Behavior by breakpoint

- **< 640px (mobile):** Header becomes two rows (`h-auto`, roughly `h-20` total):
  - **Row 1 (top):** Hamburger button + session name / status indicators (connection dot, streaming badge, working dir pill).
  - **Row 2 (bottom):** Model selector + permission mode selector, rendered compact.
  - Session ID text (`currentSessionId.slice(0,8)`) hidden entirely on mobile — not useful on small screens.
- **640px+ (sm and above):** Single `h-14` row, current layout unchanged.

### Implementation — `ChatV2Interface.vue`

- Header container: `flex-col sm:flex-row h-auto sm:h-14` replaces `flex items-center justify-between h-14`.
- Controls (model selector, permission mode) move into a second inner `div` with `flex sm:hidden` / `hidden sm:flex` classes to split across rows.
- Session ID span gets `hidden sm:inline` so it disappears on mobile.

---

## Section 3 — Messages (centered column)

### Behavior

- All content inside the scroll area (messages list, welcome state, empty state, loading states) is wrapped in a centered inner container: `max-w-[800px] mx-auto w-full px-4 py-4`.
- On screens narrower than 800px the wrapper fills full width naturally — no visible change on mobile.
- Padding is moved from the scroll container to this inner wrapper (scroll container retains only `h-full overflow-y-auto`).
- The floating controls bar (thinking toggle + context circle) stays full-width and pinned to the bottom of the scroll container — it is **not** constrained by the 800px wrapper.

### Implementation — `ChatV2Interface.vue`

One `div` wrapper added inside `messagesContainerRef`:

```html
<div ref="messagesContainerRef" class="h-full overflow-y-auto" ...>
  <div class="max-w-[800px] mx-auto w-full px-4 py-4 space-y-4">
    <!-- all existing content states go here -->
  </div>
  <!-- floating controls stay outside the wrapper, absolute positioned -->
</div>
```

No changes to `ChatV2Messages.vue` or `ChatV2MessageItem.vue` for this section.

---

## Section 4 — Overflow & Polish Fixes

### Code blocks — `ChatV2MessageItem.vue`

Add scoped CSS so rendered markdown code blocks scroll horizontally instead of overflowing:

```css
.prose :deep(pre) {
  overflow-x: auto;
  max-width: 100%;
}
```

### Tool result content — `ChatV2MessageItem.vue`

Any `div` rendering raw tool result or tool input text gets `overflow-x-auto break-words` to prevent horizontal blowout.

### Input padding — `ChatV2Input.vue`

Tighten outer container padding on mobile for more vertical breathing room:

- Default (mobile): `px-2 py-1.5`
- `sm:`: `px-3 sm:py-2`

### Textarea max-height — `ChatV2Input.vue`

Reduce max-height on mobile so the input doesn't eat too much screen height:

- Mobile: `120px`
- `sm:`: `160px`
- `md:`: `200px` (current)

Implemented via a computed style binding or inline responsive logic.

---

## Files Changed

| File | Change |
|---|---|
| `app/components/cli/chatv2/ChatV2Interface.vue` | Sidebar drawer, header two-row, messages wrapper |
| `app/components/cli/chatv2/ChatV2MessageItem.vue` | Code block overflow CSS, tool result overflow classes |
| `app/components/cli/chatv2/ChatV2Input.vue` | Responsive padding, responsive max-height |

No new files or components created.

---

## Non-Goals

- No changes to the Terminal tab or ContextPanel.
- No changes to any other page or component outside the chat interface.
- No pixel-perfect polish — this spec covers structure and overflow, not visual refinement.
