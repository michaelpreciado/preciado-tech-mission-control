/**
 * Tick a markdown task checkbox so a handled task leaves the board.
 *
 * This writes to the user's notes vault, so it is deliberately paranoid:
 *   - same auth posture as /api/setup (trusted IP, or bearer when set)
 *   - the target must resolve inside a directory collectTasks() actually scans
 *   - the line must still be a checkbox whose title matches what the client saw
 * Any mismatch returns an error and leaves the file untouched.
 */
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { getConfig } from '@/lib/config'
import { taskScanRoots } from '@/lib/mission-data'
import { resolveTaskFile, tickCheckbox } from '@/lib/task-write'
import { getClientIpFromHeaders, isTrustedIp, trustedRangesFromEnv, checkRateLimit } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const rateBucket = new Map<string, { count: number; resetAt: number }>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isTrustedIp(ip === 'unknown' ? '127.0.0.1' : ip, trustedRangesFromEnv())
}

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateBucket, ip, Date.now(), 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { source?: unknown; line?: unknown; title?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const source = typeof body.source === 'string' ? body.source : ''
  const title = typeof body.title === 'string' ? body.title : ''
  const line = typeof body.line === 'number' ? body.line : NaN
  if (!source || !title || !Number.isInteger(line)) {
    return NextResponse.json({ error: 'source, title and integer line are required' }, { status: 400 })
  }

  const file = resolveTaskFile(source, getConfig().homeDir, taskScanRoots())
  if (!file) {
    // Don't echo the resolved path — it would confirm filesystem layout.
    return NextResponse.json({ error: 'task file is outside the scanned note roots' }, { status: 403 })
  }

  try {
    const original = await fs.readFile(file, 'utf8')
    // Preserve the file's existing line ending instead of normalizing it.
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    const result = tickCheckbox(original.split(/\r?\n/), line, title)
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })

    const next = result.lines.join(eol)
    if (next !== original) await fs.writeFile(file, next, 'utf8')
    return NextResponse.json({ ok: true, changed: next !== original })
  } catch (err) {
    logger.error('tasks/complete', err)
    return NextResponse.json({ error: 'could not update the task file' }, { status: 500 })
  }
}
