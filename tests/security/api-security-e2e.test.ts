import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { type ChildProcess, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * E2E Security Tests
 *
 * Spins up the actual Nuxt dev server, then sends real HTTP requests
 * to verify security fixes for CRITICAL and HIGH findings.
 */

const PORT = 3099
const BASE = `http://localhost:${PORT}`
let serverProcess: ChildProcess | null = null

async function waitForServer(url: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) return
    } catch {
      // server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`)
}

beforeAll(async () => {
  serverProcess = spawn('npx', ['nuxi', 'dev', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'development' },
  })

  // Log server output for debugging
  serverProcess.stderr?.on('data', (d) => {
    const msg = d.toString()
    if (msg.includes('ERROR')) console.error('[server]', msg)
  })

  await waitForServer(`${BASE}/api/config`)
}, 90000)

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
})

// ─── C2: Command Injection via reveal.post.ts ────────────────────────────────

describe('C2: reveal.post.ts — command injection', () => {
  it('rejects paths outside allowed directories', async () => {
    const res = await fetch(`${BASE}/api/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/etc/passwd' }),
    })
    expect(res.status).toBe(403)
  })

  it('rejects paths with shell metacharacters', async () => {
    const res = await fetch(`${BASE}/api/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/tmp"; rm -rf / #' }),
    })
    // Should be 403 (outside allowed) or 404 (path not found) — NOT 200
    expect([403, 404]).toContain(res.status)
  })

  it('rejects traversal attempts', async () => {
    const claudeDir = join(homedir(), '.claude')
    const res = await fetch(`${BASE}/api/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${claudeDir}/../../etc/passwd` }),
    })
    // 403 (access denied) or 404 (resolved path not found) — NOT 200
    expect([403, 404]).toContain(res.status)
  })
})

// ─── C3: Arbitrary file read via files.get.ts ────────────────────────────────

describe('C3: files.get.ts — arbitrary file read', () => {
  it('blocks reading /etc/passwd', async () => {
    const res = await fetch(`${BASE}/api/files?path=/etc/passwd`)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.message || body.statusMessage).toContain('Access denied')
  })

  it('blocks reading ~/.ssh/id_rsa', async () => {
    const res = await fetch(`${BASE}/api/files?path=${homedir()}/.ssh/id_rsa`)
    expect(res.status).toBe(403)
  })

  it('blocks path traversal via relative path', async () => {
    const res = await fetch(`${BASE}/api/files?path=../../etc/passwd`)
    expect(res.status).toBe(403)
  })

  it('allows reading files inside ~/.claude', async () => {
    // This should return 200 or 404 (file may not exist) — NOT 403
    const claudeFile = join(homedir(), '.claude', 'settings.json')
    const res = await fetch(`${BASE}/api/files?path=${encodeURIComponent(claudeFile)}`)
    expect(res.status).not.toBe(403)
  })
})

// ─── C4: Arbitrary directory listing via directories.get.ts ──────────────────

describe('C4: directories.get.ts — arbitrary directory listing', () => {
  it('redirects filesystem root / to home — does not list root', async () => {
    const res = await fetch(`${BASE}/api/directories?path=/`)
    // The server redirects '/' to homedir() for safety — returns 200 with home contents
    // The key assertion: it must NOT return root-level directories like /etc, /var, /usr
    expect(res.status).toBe(200)
    const body = await res.json()
    const dirNames = body.directories.map((d: any) => d.name)
    expect(dirNames).not.toContain('etc')
    expect(dirNames).not.toContain('var')
    expect(dirNames).not.toContain('usr')
  })

  it('blocks listing /etc', async () => {
    const res = await fetch(`${BASE}/api/directories?path=/etc/`)
    expect(res.status).toBe(403)
  })

  it('blocks listing /var/log', async () => {
    const res = await fetch(`${BASE}/api/directories?path=/var/log/`)
    expect(res.status).toBe(403)
  })

  it('allows listing directories under home', async () => {
    const res = await fetch(`${BASE}/api/directories?path=${encodeURIComponent(homedir() + '/')}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.directories).toBeDefined()
  })
})

// ─── H1: Path traversal via agent slugs ──────────────────────────────────────

describe('H1: agent slug path traversal', () => {
  it('blocks slug with .. in GET', async () => {
    const res = await fetch(`${BASE}/api/agents/..%2F..%2Fetc%2Fpasswd`)
    // Should be 400 (invalid slug) or 403 — NOT 200 with file contents
    expect([400, 403, 404]).toContain(res.status)
  })

  it('blocks slug with forward slashes', async () => {
    const res = await fetch(`${BASE}/api/agents/..%2F..%2F.ssh%2Fid_rsa`)
    expect([400, 403, 404]).toContain(res.status)
  })

  it('allows normal agent slug', async () => {
    // Should return 404 (agent doesn't exist) — NOT 400/403
    const res = await fetch(`${BASE}/api/agents/test-agent`)
    expect([200, 404]).toContain(res.status)
  })
})

// ─── C7: MCP import config injection ───��─────────────────────────────────────

describe('C7: mcp/import.post.ts — config injection', () => {
  it('rejects server config without command or url', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            evil: { malicious: 'payload' },
          },
        }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects server name with special characters', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            '../evil': { command: 'node', args: ['server.js'] },
          },
        }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-http/https URLs', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            evil: { url: 'file:///etc/passwd' },
          },
        }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects args that are not string arrays', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            test: { command: 'node', args: [123, { inject: true }] },
          },
        }),
      }),
    })
    expect(res.status).toBe(400)
  })

  it('strips unknown fields from valid config', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            'test-safe': {
              command: 'node',
              args: ['server.js'],
              evil_field: 'should be stripped',
              another_bad: 42,
            },
          },
        }),
      }),
    })
    // Should succeed — unknown fields are stripped, not rejected
    expect(res.status).toBe(200)
  })

  it('accepts valid config with HTTPS url', async () => {
    const res = await fetch(`${BASE}/api/mcp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify({
          mcpServers: {
            'test-valid-url': { url: 'https://example.com/mcp' },
          },
        }),
      }),
    })
    expect(res.status).toBe(200)
  })
})

// ─── Debug endpoint — PATH leak ──────────────────────────────────────────────

describe('H3: debug endpoint — PATH leak', () => {
  it('does not expose process.env.PATH', async () => {
    const res = await fetch(`${BASE}/api/debug/claude-cli`)
    if (res.status === 200) {
      const body = await res.json()
      expect(body.pathEnvironment).toBeUndefined()
      expect(body).not.toHaveProperty('pathEnvironment')
    }
  })
})
