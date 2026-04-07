/**
 * Message content formatting utilities for Chat v2.
 * Handles HTML entity decoding, math block protection, and inline code normalization.
 */

/**
 * Decode HTML entities in text.
 * Handles common entities like &amp;, &lt;, &gt;, &quot;, &#x27;, etc.
 */
export function decodeHTMLEntities(text: string): string {
  if (!text) return ''

  // Decode common HTML entities without using innerHTML (avoids XSS amplification)
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
}

/**
 * Protect math blocks from markdown processing.
 * Wraps $...$ and $$...$$ in special markers that won't be parsed as markdown.
 */
export function protectMathBlocks(text: string): { text: string; blocks: string[] } {
  if (!text) return { text: '', blocks: [] }

  const blocks: string[] = []
  let result = text

  // Protect display math ($$...$$) first
  result = result.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    const index = blocks.length
    blocks.push(`$$${math}$$`)
    return `%%MATH_BLOCK_${index}%%`
  })

  // Protect inline math ($...$) but not $$
  result = result.replace(/\$([^$\n]+)\$/g, (match, math) => {
    // Skip if it looks like money (e.g., $100)
    if (/^\d+(?:\.\d{2})?$/.test(math)) {
      return match
    }
    const index = blocks.length
    blocks.push(`$${math}$`)
    return `%%MATH_BLOCK_${index}%%`
  })

  return { text: result, blocks }
}

/**
 * Restore math blocks after markdown processing.
 */
export function restoreMathBlocks(text: string, blocks: string[]): string {
  if (!text || blocks.length === 0) return text

  let result = text
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(`%%MATH_BLOCK_${i}%%`, blocks[i])
  }
  return result
}

/**
 * Normalize inline code fences.
 * Fixes issues like double backticks or unclosed backticks.
 */
export function normalizeInlineCode(text: string): string {
  if (!text) return ''

  // Fix double backticks that should be single
  let result = text.replace(/``([^`]+)``/g, '`$1`')

  // Don't try to close unclosed backticks as it might break intentional formatting

  return result
}

/**
 * Escape special markdown characters in plain text sections.
 * Use this when you need to display literal characters.
 */
export function escapeMarkdown(text: string): string {
  if (!text) return ''

  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}

/**
 * Fix malformed code fences (double backticks to triple backticks).
 * Some sources produce ``language instead of ```language
 */
export function fixCodeFences(text: string): string {
  if (!text) return ''

  // Fix double backticks at start of line followed by language identifier
  // Convert ``language to ```language
  let result = text.replace(/^``(\w+)\s*$/gm, '```$1')

  // Fix standalone double backticks at start of line (closing fences)
  // Convert `` to ``` only when it looks like a fence (standalone on line)
  result = result.replace(/^``\s*$/gm, '```')

  return result
}

/**
 * Format content for display.
 * Combines all formatting utilities in the correct order.
 */
export function formatContent(text: string): string {
  if (!text) return ''

  // 1. Decode HTML entities
  let result = decodeHTMLEntities(text)

  // 2. Fix malformed code fences (common issue with some markdown sources)
  result = fixCodeFences(result)

  return result
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLength: number, ellipsis = '...'): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength - ellipsis.length) + ellipsis
}

/**
 * Extract first line of text (for previews).
 */
export function getFirstLine(text: string, maxLength = 100): string {
  if (!text) return ''

  const firstLine = text.split('\n')[0].trim()
  return truncateText(firstLine, maxLength)
}

/**
 * Check if text appears to contain markdown.
 */
export function hasMarkdown(text: string): boolean {
  if (!text) return false

  const markdownPatterns = [
    /^#+\s/m,           // Headers
    /\*\*[^*]+\*\*/,    // Bold
    /\*[^*]+\*/,        // Italic
    /`[^`]+`/,          // Inline code
    /```/,              // Code blocks
    /^\s*[-*+]\s/m,     // Lists
    /^\s*\d+\.\s/m,     // Numbered lists
    /\[.+\]\(.+\)/,     // Links
  ]

  return markdownPatterns.some(pattern => pattern.test(text))
}

/**
 * Check if text contains code blocks.
 */
export function hasCodeBlocks(text: string): boolean {
  if (!text) return false
  return /```[\s\S]*?```/.test(text)
}

/**
 * Extract code blocks from text.
 */
export function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  if (!text) return []

  const blocks: Array<{ language: string; code: string }> = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    })
  }

  return blocks
}
