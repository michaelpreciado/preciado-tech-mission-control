import type { MissionData } from './types'

const STREAM_ALIASES = new Map<string, keyof MissionData | 'invalid'>([
  ['tasks', 'tasks'],
  ['calendar', 'cron'],
  ['cron', 'cron'],
  ['projects', 'projects'],
  ['crew', 'crew'],
  ['memory', 'memory'],
  ['github', 'github'],
  ['costs', 'costs'],
  ['operations', 'operations'],
  ['activity', 'operations'],
  ['kanban', 'kanban'],
])

export const VALID_STREAMS = [...STREAM_ALIASES.keys()]
export const RATE_LIMIT = 30
export const RATE_WINDOW_MS = 60 * 1000

export function normalizeStream(stream: string | null | undefined): keyof MissionData | 'invalid' | null {
  if (stream == null || stream === '') return null
  const normalized = String(stream).trim().toLowerCase()
  return STREAM_ALIASES.get(normalized) ?? 'invalid'
}

type StreamResult = {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

export function streamPayload(data: MissionData, stream: string | null | undefined): StreamResult {
  const normalized = normalizeStream(stream)
  if (normalized === 'invalid') {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Unknown mission-control stream "${String(stream).slice(0, 40)}".`,
        hint: `Use one of: ${VALID_STREAMS.join(', ')}.`,
      },
    }
  }

  if (!normalized) return { ok: true, status: 200, body: data as unknown as Record<string, unknown> }

  return {
    ok: true,
    status: 200,
    body: { [normalized]: data[normalized], generatedAt: data.generatedAt },
  }
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  const firstForwarded = forwarded?.split(',')[0]?.trim()
  const realIp = headers.get('x-real-ip')?.trim()
  return firstForwarded || realIp || 'unknown'
}

export function isLoopbackIp(ip: string): boolean {
  return ip === '::1' || ip === 'localhost' || ip === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(ip)
}

type RateLimitRecord = { count: number; resetAt: number }

const MAX_BUCKET_SIZE = 10_000

export function checkRateLimit(
  bucket: Map<string, RateLimitRecord>,
  ip: string,
  now = Date.now(),
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
): { allowed: boolean; retryAfter: number } {
  const key = ip || 'unknown'
  const record = bucket.get(key)
  if (!record || now > record.resetAt) {
    // Evict expired entries when the bucket grows too large to prevent unbounded memory use
    if (bucket.size > MAX_BUCKET_SIZE) {
      for (const [k, v] of bucket) {
        if (now > v.resetAt) bucket.delete(k)
      }
    }
    bucket.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  if (record.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) }
  }
  record.count += 1
  return { allowed: true, retryAfter: 0 }
}
