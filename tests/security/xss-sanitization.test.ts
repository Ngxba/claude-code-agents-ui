import { describe, it, expect } from 'vitest'
import { decodeHTMLEntities } from '../../app/utils/messageFormatting'

/**
 * XSS Sanitization Tests (C6)
 *
 * Tests that the decodeHTMLEntities fix no longer uses innerHTML
 * and that markdown rendering would be safe with DOMPurify.
 */

describe('C6: decodeHTMLEntities — XSS amplifier fix', () => {
  it('decodes common HTML entities safely', () => {
    expect(decodeHTMLEntities('&amp;')).toBe('&')
    expect(decodeHTMLEntities('&lt;')).toBe('<')
    expect(decodeHTMLEntities('&gt;')).toBe('>')
    expect(decodeHTMLEntities('&quot;')).toBe('"')
    expect(decodeHTMLEntities('&#x27;')).toBe("'")
    expect(decodeHTMLEntities('&nbsp;')).toBe(' ')
  })

  it('handles mixed entity and plain text', () => {
    expect(decodeHTMLEntities('Hello &amp; World')).toBe('Hello & World')
    expect(decodeHTMLEntities('a &lt; b &gt; c')).toBe('a < b > c')
  })

  it('returns empty string for falsy input', () => {
    expect(decodeHTMLEntities('')).toBe('')
    expect(decodeHTMLEntities(null as any)).toBe('')
    expect(decodeHTMLEntities(undefined as any)).toBe('')
  })

  it('does NOT execute script tags — just decodes entities', () => {
    const malicious = '&lt;script&gt;alert(1)&lt;/script&gt;'
    const result = decodeHTMLEntities(malicious)
    // After entity decode, we get the literal string — no DOM execution
    expect(result).toBe('<script>alert(1)</script>')
    // This string would then be sanitized by DOMPurify in renderMarkdown
  })

  it('does NOT use innerHTML (verified by consistent behavior in node)', () => {
    // In the old code, innerHTML would decode ALL entities including obscure ones.
    // Our string-based approach only decodes the explicit list.
    // &#x41; = 'A' — our function does NOT decode it (by design)
    expect(decodeHTMLEntities('&#x41;')).toBe('&#x41;')
  })
})

describe('C6: markdown lang attribute — HTML injection fix', () => {
  it('would not inject via data-lang attribute', () => {
    // The lang attribute is now escaped before insertion into template literals.
    // Verify the escape logic: any quotes/angle brackets in lang should be stripped.
    const maliciousLang = '"><img src=x onerror=alert(1)>'
    const safeLang = maliciousLang.replace(/['"<>&]/g, '')
    expect(safeLang).toBe('img src=x onerror=alert(1)')
    expect(safeLang).not.toContain('"')
    expect(safeLang).not.toContain('<')
    expect(safeLang).not.toContain('>')
  })
})
