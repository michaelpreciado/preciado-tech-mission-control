/**
 * Demo-mode trigger — runs scripts/seed-demo.mjs from the /setup page.
 * Same auth + rate-limit posture as /api/setup. No user input reaches the
 * child process besides a validated boolean flag.
 */
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { resetConfigCache } from '@/lib/config'
import { getClientIpFromHeaders, isLoopbackIp, checkRateLimit } from '@/lib/mission-api'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const rateBucket = new Map<string, { count: number; resetAt: number }>()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (secret) return req.headers.get('authorization') === `Bearer ${secret}`
  const ip = getClientIpFromHeaders(req.headers)
  return isLoopbackIp(ip === 'unknown' ? '127.0.0.1' : ip)
}

export async function POST(req: NextRequest) {
  const ip = getClientIpFromHeaders(req.headers)
  const limit = checkRateLimit(rateBucket, ip, Date.now(), 4, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } })
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'
  const script = path.join(process.cwd(), 'scripts', 'seed-demo.mjs')
  const args = force ? [script, '--force'] : [script]
  try {
    const { stdout } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 30_000 })
    resetConfigCache()
    return NextResponse.json({ ok: true, log: stdout.trim().split('\n') })
  } catch (err) {
    logger.error('setup/demo', err)
    return NextResponse.json({ error: 'demo seeding failed — check server logs' }, { status: 500 })
  }
}
