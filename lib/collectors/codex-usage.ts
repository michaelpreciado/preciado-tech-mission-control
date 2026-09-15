// Collects recent Codex CLI rollout usage from the local session tree. The
// collector is deliberately bounded and forgiving because rollout logs are
// append-only and may contain partial lines while a session is active.

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { CostDashboard } from '../types'
import { calendarWindow, DAILY_WINDOW_DAYS } from './costs-aggregate'

type TokenUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

type Session = {
  model: string
  date: string
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  totalTokens: number
  lastActivityAt: string | null
}

const MAX_FILES = 500
const WINDOW_MS = 35 * 86_400_000

type CodexRateLimits = NonNullable<NonNullable<CostDashboard['codexUsage']>['rateLimits']>

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resetIso(value: unknown): string | null {
  const seconds = finiteNumber(value)
  if (seconds === null) return null
  const date = new Date(seconds * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Parse provider values without inferring a limit from logged token volume. */
export function parseCodexRateLimits(payload: unknown, timestamp: unknown = null): CodexRateLimits | null {
  const limits = record(record(payload)?.rate_limits)
  if (!limits) return null
  const primary = record(limits.primary)
  const secondary = record(limits.secondary)
  const used = finiteNumber(primary?.used_percent)
  const capturedMs = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
  return {
    planType: typeof limits.plan_type === 'string' ? limits.plan_type : null,
    weeklyUsedPercent: used,
    weeklyRemainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
    weeklyWindowMinutes: finiteNumber(primary?.window_minutes),
    weeklyResetsAt: resetIso(primary?.resets_at),
    capturedAt: Number.isFinite(capturedMs) ? new Date(capturedMs).toISOString() : null,
    ...(secondary ? {
      secondaryUsedPercent: finiteNumber(secondary.used_percent),
      secondaryResetsAt: resetIso(secondary.resets_at),
      secondaryWindowMinutes: finiteNumber(secondary.window_minutes),
    } : {}),
  }
}

function number(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

async function rolloutFiles(root: string, cutoff: number): Promise<{ file: string; mtimeMs: number }[]> {
  const out: { file: string; mtimeMs: number }[] = []
  async function visit(dir: string): Promise<void> {
    if (out.length >= MAX_FILES) return
    let entries: import('node:fs').Dirent[]
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = await fs.stat(file)
          if (stat.mtimeMs >= cutoff) out.push({ file, mtimeMs: stat.mtimeMs })
        } catch { /* a rotated file can disappear between readdir and stat */ }
      }
    }
  }
  await visit(root)
  return out
}

export async function collectCodexUsage(now = Date.now()): Promise<NonNullable<CostDashboard['codexUsage']>> {
  const empty = (): NonNullable<CostDashboard['codexUsage']> => ({
    models: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheTokens: 0,
    totalTokens: 0, daily: calendarWindow([], DAILY_WINDOW_DAYS, now), monthlyTokens: {},
    planType: null, sessionsCount: 0, lastActivityAt: null, rateLimits: null,
  })

  try {
    const files = await rolloutFiles(path.join(os.homedir(), '.codex', 'sessions'), now - WINDOW_MS)
    const sessions = new Map<string, Session>()
    let rateLimits: CodexRateLimits | null = null
    let rateLimitsAt = -Infinity
    for (const { file, mtimeMs } of files) {
      const fallbackId = file
      let sessionId = fallbackId
      let session: Session | null = null
      let text = ''
      try { text = await fs.readFile(file, 'utf8') } catch { continue }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        let obj: Record<string, unknown>
        try { obj = JSON.parse(line) } catch { continue }
        const payload = obj.payload as Record<string, unknown> | undefined
        if (obj.type === 'session_meta' && payload) {
          sessionId = String(payload.session_id || payload.id || fallbackId)
          const provenance = (payload.base_instructions as Record<string, unknown> | undefined)?.provenance as Record<string, unknown> | undefined
          const model = String(provenance?.model || obj.model || payload.model || 'codex')
          const timestamp = String(payload.timestamp || obj.timestamp || new Date(mtimeMs).toISOString())
          session = sessions.get(sessionId) ?? { model, date: timestamp.slice(0, 10), inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, lastActivityAt: null }
          session.model = model
          session.date = timestamp.slice(0, 10)
          sessions.set(sessionId, session)
        }
        if (obj.type !== 'event_msg' || payload?.type !== 'token_count') continue
        const info = payload.info as Record<string, unknown> | undefined
        const usage = (info?.last_token_usage || {}) as TokenUsage
        const input = number(usage.input_tokens)
        const cached = number(usage.cached_input_tokens)
        const cacheWrite = number(usage.cache_write_input_tokens)
        const output = number(usage.output_tokens)
        const total = input + cached + cacheWrite + output
        if (!session) session = sessions.get(sessionId) ?? { model: 'codex', date: new Date(mtimeMs).toISOString().slice(0, 10), inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, lastActivityAt: null }
        session.inputTokens += input
        session.outputTokens += output
        session.cacheTokens += cached + cacheWrite
        session.totalTokens += total
        const activity = String(obj.timestamp || '')
        if (activity && (!session.lastActivityAt || activity > session.lastActivityAt)) session.lastActivityAt = activity
        sessions.set(sessionId, session)
        const snapshot = parseCodexRateLimits(payload, obj.timestamp || session.lastActivityAt)
        if (snapshot) {
          const capturedAt = snapshot.capturedAt ? Date.parse(snapshot.capturedAt) : -Infinity
          // File traversal/mtime order is not event order. Prefer the newest
          // timestamp; ties (including undated snapshots) use last write wins.
          if (capturedAt >= rateLimitsAt) {
            rateLimits = snapshot
            rateLimitsAt = capturedAt
          }
        }
      }
    }
    const byModel = new Map<string, { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }>()
    const byDay = new Map<string, { tokens: number; byModel: Record<string, number> }>()
    let lastActivityAt: string | null = null
    for (const session of sessions.values()) {
      if (session.totalTokens <= 0) continue
      const model = session.model || 'codex'
      const modelAgg = byModel.get(model) ?? { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }
      modelAgg.inputTokens += session.inputTokens; modelAgg.outputTokens += session.outputTokens
      modelAgg.cacheTokens += session.cacheTokens; modelAgg.totalTokens += session.totalTokens
      byModel.set(model, modelAgg)
      const day = byDay.get(session.date) ?? { tokens: 0, byModel: {} }
      day.tokens += session.totalTokens; day.byModel[model] = (day.byModel[model] ?? 0) + session.totalTokens
      byDay.set(session.date, day)
      if (session.lastActivityAt && (!lastActivityAt || session.lastActivityAt > lastActivityAt)) lastActivityAt = session.lastActivityAt
    }
    const models = [...byModel.entries()].map(([model, values]) => ({ model, ...values })).sort((a, b) => b.totalTokens - a.totalTokens)
    const monthlyTokens: Record<string, number> = {}
    for (const [date, value] of byDay) monthlyTokens[date.slice(0, 7)] = (monthlyTokens[date.slice(0, 7)] ?? 0) + value.tokens
    return {
      models,
      totalInputTokens: models.reduce((sum, model) => sum + model.inputTokens, 0),
      totalOutputTokens: models.reduce((sum, model) => sum + model.outputTokens, 0),
      totalCacheTokens: models.reduce((sum, model) => sum + model.cacheTokens, 0),
      totalTokens: models.reduce((sum, model) => sum + model.totalTokens, 0),
      daily: calendarWindow([...byDay.entries()].map(([date, value]) => ({ date, ...value })), DAILY_WINDOW_DAYS, now),
      monthlyTokens, planType: rateLimits?.planType ?? null, sessionsCount: sessions.size, lastActivityAt, rateLimits,
    }
  } catch { return empty() }
}
