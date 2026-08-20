/**
 * Pure aggregation pipeline for the costs view: log text in, numbers out.
 *
 * Split out of costs.ts so it can be exercised directly by node --test. Every
 * bug the costs audit turned up lived in exactly this layer — duplicate
 * records being summed instead of collapsed, a sparse window masquerading as a
 * calendar one, subscription list-rate dollars counted as spend — while the
 * surrounding module walked a 500MB directory and called the OpenRouter API,
 * which made the interesting part effectively untestable.
 *
 * Nothing here touches the filesystem, the network, the clock or the config.
 * `calendarWindow` takes `now` as an argument for that reason.
 */
import type { ModelUsage, BillingMode } from '../types'
import { usageFromObject, usageIdentity, throughputIdentity, billableOf, billingMode } from './costs-usage'
import { extractThroughputSamples, type ThroughputSample } from './ollama-throughput'

/* ── Incremental parse cache + duplicate collapsing ─────────────────────
 * The session log tree is ~500MB of append-only JSONL, of which >99% has not
 * been touched in weeks. Re-reading and re-parsing all of it on every refresh
 * cost ~7s and dominated the whole dashboard aggregate, so each file's parse
 * is cached against its mtime+size.
 *
 * What a file yields is a list of NORMALIZED RECORDS keyed by call identity,
 * not a pre-summed aggregate. That matters: OpenClaw replays a whole session
 * into every checkpoint file it writes, so the same API call appears in
 * several files at once and summing per-file partials counted it once per
 * file. Records let the merge collapse on `usageIdentity` first and sum after,
 * which is the only order that gets the totals right.
 * ──────────────────────────────────────────────────────────────────────── */

export type UsageRecord = {
  model: string; provider: string
  input: number; output: number; cacheRead: number; cacheWrite: number
  total: number; billableTokens: number
  cost: number; costInput: number; costOutput: number; costCacheRead: number; costCacheWrite: number
  failed: boolean; timestamp: string
}
export type DayAgg = { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; billable: number; cost: number; requests: number }> }
export type FileAggregate = { records: Map<string, UsageRecord>; samples: Map<string, ThroughputSample> }

export function emptyModel(model: string, provider: string): ModelUsage {
  return {
    model, provider, mode: billingMode(provider, model),
    requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    totalTokens: 0, billableTokens: 0, estimatedCostUsd: 0,
    costInputUsd: 0, costOutputUsd: 0, costCacheReadUsd: 0, costCacheWriteUsd: 0,
    failedRequests: 0, lastUsedAt: undefined, tokenShare: 0, costShare: 0,
  }
}

/** Parse one session file into its own identity-keyed record set. */
export function aggregateFile(text: string): FileAggregate {
  const records = new Map<string, UsageRecord>()
  const samples = new Map<string, ThroughputSample>()

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || !line.includes('usage')) continue
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) } catch { continue }
    if (obj.type === 'model.completed') {
      for (const s of extractThroughputSamples(obj)) samples.set(throughputIdentity(s), s)
    }
    const u = usageFromObject(obj)
    if (!u) continue
    records.set(usageIdentity(obj, u), {
      model: u.model, provider: u.provider,
      input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite,
      total: u.total, billableTokens: billableOf(u),
      cost: u.cost, costInput: u.costInput, costOutput: u.costOutput,
      costCacheRead: u.costCacheRead, costCacheWrite: u.costCacheWrite,
      failed: u.failed, timestamp: u.timestamp,
    })
  }

  return { records, samples }
}

/** Fold deduplicated records into per-model and per-day totals. */
export function foldRecords(records: Map<string, UsageRecord>): { byModel: Map<string, ModelUsage>; byDay: Map<string, DayAgg> } {
  const byModel = new Map<string, ModelUsage>()
  const byDay = new Map<string, DayAgg>()
  for (const u of records.values()) {
    const key = `${u.provider}::${u.model}`
    const cur = byModel.get(key) || emptyModel(u.model, u.provider)
    cur.requests += 1
    cur.inputTokens += u.input
    cur.outputTokens += u.output
    cur.cacheReadTokens += u.cacheRead
    cur.cacheWriteTokens += u.cacheWrite
    cur.totalTokens += u.total
    cur.billableTokens += u.billableTokens
    cur.estimatedCostUsd += u.cost
    cur.costInputUsd += u.costInput
    cur.costOutputUsd += u.costOutput
    cur.costCacheReadUsd += u.costCacheRead
    cur.costCacheWriteUsd += u.costCacheWrite
    cur.failedRequests += u.failed ? 1 : 0
    if (u.timestamp && (!cur.lastUsedAt || u.timestamp > cur.lastUsedAt)) cur.lastUsedAt = u.timestamp
    byModel.set(key, cur)

    const date = u.timestamp.slice(0, 10) || 'unknown'
    const day = byDay.get(date) || { date, requests: 0, tokens: 0, billableTokens: 0, cost: 0, byModel: {} }
    day.requests += 1; day.tokens += u.total; day.billableTokens += u.billableTokens; day.cost += u.cost
    const modelKey = u.model || 'unknown'
    if (!day.byModel[modelKey]) day.byModel[modelKey] = { tokens: 0, billable: 0, cost: 0, requests: 0 }
    day.byModel[modelKey].tokens += u.total
    day.byModel[modelKey].billable += u.billableTokens
    day.byModel[modelKey].cost += u.cost
    day.byModel[modelKey].requests += 1
    byDay.set(date, day)
  }
  return { byModel, byDay }
}

/**
 * Rows for the trailing `days`-day CALENDAR window ending today.
 *
 * Not `slice(-days)`: taking the last N rows of a sparse series takes the last
 * N days that happened to have activity, which here reached back 76 calendar
 * days while every label on the page said "last 30 days". Filtering by date
 * makes the window mean what it says; quiet days are simply absent.
 */
/** Trailing window used by every "last N days" figure on the costs view. */
export const DAILY_WINDOW_DAYS = 30
/* The local-AI heatmap asks for 14 weeks, then snaps its first column back to
   the preceding Sunday, so it can draw up to 15 columns = 105 days. Sizing the
   data window any smaller leaves the leading columns outside the data and
   permanently blank, where a real quiet week and a rendering artifact look
   exactly alike. Keep this >= the widest grid the component can draw. */
export const HEATMAP_WINDOW_DAYS = 105

export function calendarWindow<T extends { date: string }>(rows: T[], days: number, now: number = Date.now()): T[] {
  const cutoff = new Date(now - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  return rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Entries that are transport plumbing rather than a model: routers, mirrors and
 * gateway shims that log a usage envelope with no tokens behind it. They add
 * rows to every leaderboard and inflate the model count without representing
 * any inference. Anything that actually moved tokens is kept regardless.
 */
export function isRealModelRow(m: ModelUsage): boolean {
  return m.totalTokens > 0 || m.estimatedCostUsd > 0
}

/**
 * Per-billing-mode rollup.
 *
 * Subscription providers still log a per-token price — the client values the
 * call at list rate even though a flat plan already paid for it. Summing those
 * with real metered spend produced a "logged spend" figure of which 63% had
 * never been invoiced, and inflated the blended rate used to value local
 * inference by 85%. Their dollars go to `notionalCostUsd`, which is counted
 * nowhere.
 */
export const MODE_ORDER: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']

export function rollupModes(models: ModelUsage[]) {
  return MODE_ORDER.map(mode => {
    const rows = models.filter(m => m.mode === mode)
    const cost = rows.reduce((s, m) => s + m.estimatedCostUsd, 0)
    return {
      mode,
      models: rows.length,
      requests: rows.reduce((s, m) => s + m.requests, 0),
      billableTokens: rows.reduce((s, m) => s + m.billableTokens, 0),
      cacheReadTokens: rows.reduce((s, m) => s + m.cacheReadTokens, 0),
      totalTokens: rows.reduce((s, m) => s + m.totalTokens, 0),
      inputTokens: rows.reduce((s, m) => s + m.inputTokens, 0),
      outputTokens: rows.reduce((s, m) => s + m.outputTokens, 0),
      costUsd: mode === 'metered' ? cost : 0,
      notionalCostUsd: mode === 'metered' ? 0 : cost,
    }
  }).filter(m => m.requests > 0)
}
