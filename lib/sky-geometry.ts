/**
 * Pure geometry behind the Home agent-activity sky (components/aurora/AuroraSky.tsx).
 *
 * The sky draws every lane's strands as a handful of multi-subpath <path>s — one
 * per (intensity level × stroke layer) — so the node count is bounded by lanes,
 * not by how busy the agents were. Everything here is data in, numbers out.
 */
import type { SkyRow, SkySpan } from './agent-timeline'

/** Intensity buckets a span can fall in: quiet, steady, hot. */
export const LEVELS = 3
/** Most spans a lane draws; beyond this the closest neighbours merge. */
export const MAX_SPANS_PER_LANE = 48
/** Failures closer together than this (hours) share one marker. */
export const FAIL_BUCKET_H = 0.25

export type LaneStats = {
  /** Work bursts (clustered message spans) today. */
  bursts: number
  /** Hours with an agent working, failures excluded. */
  busyHours: number
  /** busyHours as a share (0..1) of the day elapsed so far. */
  share: number
  /** Failed runs today. */
  fails: number
  /** True when the latest burst reaches "now" — the agent is working right now. */
  live: boolean
}

const work = (spans: SkySpan[]) => spans.filter(s => !s.failed && s.end > s.start)

export function laneStats(row: SkyRow, nowHour: number, liveWindowH = 0.25): LaneStats {
  const spans = work(row.spans)
  const busyHours = spans.reduce((n, s) => n + (s.end - s.start), 0)
  const elapsed = Math.max(nowHour, 1 / 60)
  return {
    bursts: spans.length,
    busyHours,
    share: Math.min(1, busyHours / elapsed),
    fails: row.spans.filter(s => s.failed).length,
    live: spans.some(s => s.end >= nowHour - liveWindowH),
  }
}

/** Messages per minute inside a span; null when the span carries no count. */
function rate(s: SkySpan): number | null {
  if (typeof s.n !== 'number' || !(s.n > 0)) return null
  return s.n / Math.max(5, (s.end - s.start) * 60)
}

/**
 * Bucket every span into 0..LEVELS-1 by message density, relative to the busiest
 * span on the whole sky (sqrt, so one hot burst does not flatten the rest).
 * Spans without a message count sit in the middle bucket rather than pretending
 * to be quiet or hot.
 */
export function spanLevels(rows: SkyRow[]): (s: SkySpan) => number {
  const max = Math.max(0, ...rows.flatMap(r => work(r.spans).map(s => rate(s) ?? 0)))
  return s => {
    const r = rate(s)
    if (r === null || max <= 0) return 1
    return Math.min(LEVELS - 1, Math.floor(Math.sqrt(r / max) * LEVELS))
  }
}

/** Merge the closest neighbours until at most `cap` spans remain. Counts add up. */
export function capSpans(spans: SkySpan[], cap = MAX_SPANS_PER_LANE): SkySpan[] {
  const out = work(spans).sort((a, b) => a.start - b.start).map(s => ({ ...s }))
  while (out.length > cap) {
    let at = 0
    for (let i = 1; i < out.length - 1; i++) if (out[i + 1].start - out[i].end < out[at + 1].start - out[at].end) at = i
    const [a, b] = [out[at], out[at + 1]]
    const n = typeof a.n === 'number' || typeof b.n === 'number' ? (a.n ?? 0) + (b.n ?? 0) : undefined
    out.splice(at, 2, { start: a.start, end: Math.max(a.end, b.end), ...(n === undefined ? {} : { n }) })
  }
  return out
}

/** Failure markers for a lane: nearby failures fold into one marker with a count. */
export function failMarks(spans: SkySpan[], bucketH = FAIL_BUCKET_H): { at: number; count: number }[] {
  const times = spans.filter(s => s.failed).map(s => s.end).filter(Number.isFinite).sort((a, b) => a - b)
  const out: { at: number; count: number }[] = []
  for (const t of times) {
    const last = out[out.length - 1]
    if (last && t - last.at <= bucketH) last.count++
    else out.push({ at: t, count: 1 })
  }
  return out
}

/**
 * One path `d` per intensity level for a lane's strands: "M x0 y H x1" subpaths,
 * so a stroke with round caps draws every span of that level in a single node.
 * `minW` keeps a one-message burst visible as a tick.
 */
export function strandPaths(spans: SkySpan[], level: (s: SkySpan) => number, x: (h: number) => number, y: number, minW: number): string[] {
  const d = Array.from({ length: LEVELS }, () => '')
  for (const s of spans) {
    const x0 = x(s.start)
    const x1 = Math.max(x0 + minW, x(s.end))
    d[level(s)] += `M${x0.toFixed(2)} ${y}H${x1.toFixed(2)}`
  }
  return d
}

/** "13:41" for a fractional hour of the day. Truncates, like the server's clock label. */
export function clock(h: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(h * 60 + 1e-6)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "2h 05m" / "35m" for a duration in hours. */
export function span(h: number): string {
  const m = Math.round(h * 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}
