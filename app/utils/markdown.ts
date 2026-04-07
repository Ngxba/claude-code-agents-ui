import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { protectMathBlocks, restoreMathBlocks } from './messageFormatting'

/**
 * Sanitize HTML output to prevent XSS.
 * Allows safe markdown-generated tags while stripping scripts and event handlers.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html // SSR: no DOM available
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'munderover'],
    ADD_ATTR: ['data-lang', 'class', 'style'],
  })
}

// ── Shiki syntax highlighting ──────────────────────────────────────────────

const SUPPORTED_LANGS = new Set([
  'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
  'python', 'py', 'ruby', 'rb', 'go', 'rust', 'rs',
  'java', 'kotlin', 'swift', 'c', 'cpp', 'c++', 'csharp', 'cs',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'bash', 'sh', 'zsh', 'shell', 'fish',
  'sql', 'graphql', 'markdown', 'md',
  'vue', 'svelte', 'astro',
  'diff',
  'dockerfile', 'docker',
  'php', 'perl', 'scala', 'haskell', 'elixir', 'erlang',
  'lua', 'dart', 'r', 'matlab', 'tex', 'latex',
])

const highlightedCache = new Map<string, string>()

/**
 * Highlight a code block using Shiki.
 * Falls back to plain <code> on failure / unsupported language.
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const language = (lang || 'text').toLowerCase()
  const cacheKey = `${language}:${code}`
  if (highlightedCache.has(cacheKey)) {
    return highlightedCache.get(cacheKey)!
  }

  const resolvedLang = SUPPORTED_LANGS.has(language) ? language : 'text'

  // Escape lang attribute to prevent HTML injection
  const safeLang = (lang || '').replace(/['"<>&]/g, '')

  if (import.meta.server) {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div class="shiki-wrapper" data-lang="${safeLang}"><pre><code>${escaped}</code></pre></div>`
  }

  try {
    const { codeToHtml: c2h } = await import('shiki').catch(() => ({ codeToHtml: null }))
    if (!c2h) throw new Error('Shiki not loaded')
    
    const html = await c2h(code, {
      lang: resolvedLang,
      theme: 'tokyo-night',
    })

    // Add language label and copy wrapper
    const withLabel = `<div class="shiki-wrapper" data-lang="${safeLang}">${html}</div>`
    highlightedCache.set(cacheKey, withLabel)
    return withLabel
  } catch {
    // Fallback: plain fenced block
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fallback = `<div class="shiki-wrapper" data-lang="${safeLang}"><pre style="background:#1e1e2e;border-radius:0.5rem;padding:1rem;overflow-x:auto;"><code>${escaped}</code></pre></div>`
    highlightedCache.set(cacheKey, fallback)
    return fallback
  }
}

// ── Async renderer (for full highlighting support) ─────────────────────────

/**
 * Render markdown to HTML with full Shiki syntax highlighting.
 * Returns a Promise — use this where async is acceptable.
 */
export async function renderMarkdownAsync(text: string): Promise<string> {
  if (!text) return ''
  const { text: protectedText, blocks } = protectMathBlocks(text)
  let html = await marked.parse(protectedText, { async: false }) as string
  html = restoreMathBlocks(html, blocks)
  return sanitizeHtml(html)
}

// ── Synchronous fallback renderer ──────────────────────────────────────────

marked.use({
  breaks: true,
  gfm: true,
  async: false,
})

/**
 * Render markdown to HTML (synchronous, no syntax highlighting).
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return sanitizeHtml(marked.parse(text) as string)
}

/**
 * Render markdown with math block protection (synchronous).
 */
export function renderMarkdownWithMath(text: string): string {
  if (!text) return ''
  const { text: protectedText, blocks } = protectMathBlocks(text)
  let html = marked.parse(protectedText) as string
  html = restoreMathBlocks(html, blocks)
  return sanitizeHtml(html)
}

/**
 * Render markdown with math AND Shiki syntax highlighting.
 * Async — returns a Promise<string>.
 */
export async function renderMarkdownWithHighlighting(text: string): Promise<string> {
  if (!text) return ''

  const { text: protectedText, blocks } = protectMathBlocks(text)

  // Use a custom renderer to intercept code blocks
  const renderer = new marked.Renderer()

  // Collect code blocks to highlight — defer to shiki
  const codeBlocks: Array<{ placeholder: string; lang: string; code: string }> = []

  renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push({ placeholder, lang: lang || '', code: text })
    return placeholder
  }

  let html = marked.parse(protectedText, { renderer }) as string

  // Now resolve all code blocks in parallel
  await Promise.all(
    codeBlocks.map(async ({ placeholder, lang, code }) => {
      const highlighted = await highlightCode(code, lang)
      html = html.replace(placeholder, highlighted)
    })
  )

  html = restoreMathBlocks(html, blocks)
  return sanitizeHtml(html)
}

/**
 * Render markdown inline (no paragraph wrapper).
 */
export function renderMarkdownInline(text: string): string {
  if (!text) return ''
  return sanitizeHtml(marked.parseInline(text) as string)
}

/**
 * Strip markdown formatting and return plain text.
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''

  let result = text.replace(/```[\s\S]*?```/g, '')
  result = result.replace(/`[^`]+`/g, '')
  result = result.replace(/^#+\s+/gm, '')
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1')
  result = result.replace(/\*([^*]+)\*/g, '$1')
  result = result.replace(/__([^_]+)__/g, '$1')
  result = result.replace(/_([^_]+)_/g, '$1')
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
  result = result.replace(/^[-*_]{3,}$/gm, '')
  result = result.replace(/\n{3,}/g, '\n\n')
  return result.trim()
}
