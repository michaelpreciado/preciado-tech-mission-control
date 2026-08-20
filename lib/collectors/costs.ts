import path from 'node:path'
import type { CostDashboard, ModelUsage, BillingMode } from '../types'
import { getConfig } from '../config'
import { readOrMonthlyHistory, recordOrMonthly } from '../or-history'
import fs from 'node:fs/promises'
import { logger } from '../logger'
import { ROOTS, readText, walk, rel } from './shared'
import { usageFromObject, isLocalModel, isCloudRoutedModel, usageIdentity, throughputIdentity, billingMode, billableOf } from './costs-usage'
import { extractThroughputSamples, type ThroughputSample } from './ollama-throughput'

async function resolveOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  // Fallback: read from the configured provider env file (never logged/returned)
  const cfg = getConfig()
  if (cfg.keys.openrouterApiKey) return cfg.keys.openrouterApiKey
  if (!cfg.paths.providerEnvFile) return null
  const providerEnv = await readText(cfg.paths.providerEnvFile)
  const match = providerEnv.match(/OPENROUTER_API_KEY\s*=\s*(\S+)/)
  return match?.[1] ?? null
}

async function fetchOpenRouterUsage(): Promise<CostDashboard['openRouterLive'] | null> {
  const key = await resolveOpenRouterKey()
  if (!key) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}`, 'X-Title': getConfig().appName },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json() as {
      data?: {
        usage?: number; usage_monthly?: number; usage_weekly?: number; usage_daily?: number
        limit?: number; limit_remaining?: number; label?: string
      }
    }
    const d = json?.data
    if (!d) return null
    return {
      usageUsd: Number(d.usage ?? 0),
      // Lifetime spend for the key. Kept separate and NEVER used as a fallback
      // for the monthly figure — a missing usage_monthly must read as $0, not
      // as every dollar ever spent on this key.
      usageLifetime: Number(d.usage ?? 0),
      usageMonthly: Number(d.usage_monthly ?? 0),
      usageWeekly: Number(d.usage_weekly ?? 0),
      usageDaily: Number(d.usage_daily ?? 0),
      limit: d.limit != null ? Number(d.limit) : null,
      limitRemaining: d.limit_remaining != null ? Number(d.limit_remaining) : null,
      label: String(d.label || 'OpenRouter'),
    }
  } catch {
    return null
  }
}

type ClaudeModelAgg = { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }
type ClaudeFileAggregate = {
  byModel: Map<string, ClaudeModelAgg>
  byDay: Map<string, { tokens: number; byModel: Record<string, number> }>
}

/** Same append-only mtime cache as the session logs — this tree is ~88MB. */
const claudeFileCache = new Map<string, { stamp: string; agg: ClaudeFileAggregate }>()

function aggregateClaudeFile(text: string): ClaudeFileAggregate {
  const byModel = new Map<string, ClaudeModelAgg>()
  const byDay = new Map<string, { tokens: number; byModel: Record<string, number> }>()
  {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || !line.includes('tokens')) continue
      let obj: Record<string, unknown>
      try { obj = JSON.parse(line) } catch { continue }
      const msg = (obj.message || obj) as Record<string, unknown>
      const usage = (msg.usage || {}) as Record<string, unknown>
      const model = String(msg.model || obj.model || 'claude-unknown')
      if (!model.startsWith('claude')) continue
      const input = Number(usage.input_tokens ?? 0)
      const output = Number(usage.output_tokens ?? 0)
      const cache = Number(usage.cache_creation_input_tokens ?? 0) + Number(usage.cache_read_input_tokens ?? 0)
      if (!input && !output && !cache) continue
      const total = input + output + cache
      const cur = byModel.get(model) ?? { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }
      cur.inputTokens += input; cur.outputTokens += output; cur.cacheTokens += cache; cur.totalTokens += total
      byModel.set(model, cur)
      const ts = String(obj.timestamp || msg.timestamp || (obj as Record<string, unknown>).createdAt || '')
      const date = ts.slice(0, 10) || 'unknown'
      const day = byDay.get(date) ?? { tokens: 0, byModel: {} }
      day.tokens += total
      day.byModel[model] = (day.byModel[model] ?? 0) + total
      byDay.set(date, day)
    }
  }
  return { byModel, byDay }
}

async function collectClaudeUsage(): Promise<CostDashboard['claudeUsage']> {
  const claudeProjects = path.join(getConfig().homeDir, '.claude/projects')
  const files = await walk(claudeProjects, { extensions: ['.jsonl'], max: 2000, depth: 6 })
  const byModel = new Map<string, ClaudeModelAgg>()
  const byDay = new Map<string, { tokens: number; byModel: Record<string, number> }>()

  const live = new Set<string>()
  for (const file of files) {
    live.add(file)
    let stamp: string
    try {
      const st = await fs.stat(file)
      stamp = `${st.mtimeMs}:${st.size}`
    } catch { continue }
    let hit = claudeFileCache.get(file)
    if (!hit || hit.stamp !== stamp) {
      hit = { stamp, agg: aggregateClaudeFile(await readText(file)) }
      claudeFileCache.set(file, hit)
    }
    for (const [model, v] of hit.agg.byModel) {
      const cur = byModel.get(model) ?? { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }
      cur.inputTokens += v.inputTokens; cur.outputTokens += v.outputTokens
      cur.cacheTokens += v.cacheTokens; cur.totalTokens += v.totalTokens
      byModel.set(model, cur)
    }
    for (const [date, v] of hit.agg.byDay) {
      const day = byDay.get(date) ?? { tokens: 0, byModel: {} }
      day.tokens += v.tokens
      for (const [model, t] of Object.entries(v.byModel)) day.byModel[model] = (day.byModel[model] ?? 0) + t
      byDay.set(date, day)
    }
  }
  for (const key of claudeFileCache.keys()) if (!live.has(key)) claudeFileCache.delete(key)

  const models = [...byModel.entries()].map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
  const daily = calendarWindow([...byDay.entries()].map(([date, v]) => ({ date, ...v })), DAILY_WINDOW_DAYS)
  // Built from the FULL day map, not `daily`: the monthly billing table shows
  // the previous month too, which falls outside a 30-day window for most of
  // any given month and would otherwise reconcile against zero Claude tokens.
  const monthlyTokens: Record<string, number> = {}
  for (const [date, v] of byDay) {
    const month = date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    monthlyTokens[month] = (monthlyTokens[month] ?? 0) + v.tokens
  }

  return {
    models,
    totalInputTokens: models.reduce((s, m) => s + m.inputTokens, 0),
    totalOutputTokens: models.reduce((s, m) => s + m.outputTokens, 0),
    totalCacheTokens: models.reduce((s, m) => s + m.cacheTokens, 0),
    totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    daily,
    monthlyTokens,
  }
}

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

type UsageRecord = {
  model: string; provider: string
  input: number; output: number; cacheRead: number; cacheWrite: number
  total: number; billableTokens: number
  cost: number; costInput: number; costOutput: number; costCacheRead: number; costCacheWrite: number
  failed: boolean; timestamp: string
}
type DayAgg = { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; billable: number; cost: number; requests: number }> }
type FileAggregate = { records: Map<string, UsageRecord>; samples: Map<string, ThroughputSample> }

/** path → { stamp, aggregate }. Stamp changes ⇒ the file was appended to. */
const fileCache = new Map<string, { stamp: string; agg: FileAggregate }>()

function emptyModel(model: string, provider: string): ModelUsage {
  return {
    model, provider, mode: billingMode(provider, model),
    requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    totalTokens: 0, billableTokens: 0, estimatedCostUsd: 0,
    costInputUsd: 0, costOutputUsd: 0, costCacheReadUsd: 0, costCacheWriteUsd: 0,
    failedRequests: 0, lastUsedAt: undefined, tokenShare: 0, costShare: 0,
  }
}

/** Parse one session file into its own identity-keyed record set. */
function aggregateFile(text: string): FileAggregate {
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
function foldRecords(records: Map<string, UsageRecord>): { byModel: Map<string, ModelUsage>; byDay: Map<string, DayAgg> } {
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
const DAILY_WINDOW_DAYS = 30
/* The local-AI heatmap asks for 14 weeks, then snaps its first column back to
   the preceding Sunday, so it can draw up to 15 columns = 105 days. Sizing the
   data window any smaller leaves the leading columns outside the data and
   permanently blank, where a real quiet week and a rendering artifact look
   exactly alike. Keep this >= the widest grid the component can draw. */
const HEATMAP_WINDOW_DAYS = 105

function calendarWindow<T extends { date: string }>(rows: T[], days: number): T[] {
  const cutoff = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  return rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Entries that are transport plumbing rather than a model: routers, mirrors and
 * gateway shims that log a usage envelope with no tokens behind it. They add
 * rows to every leaderboard and inflate the model count without representing
 * any inference. Anything that actually moved tokens is kept regardless.
 */
function isRealModelRow(m: ModelUsage): boolean {
  return m.totalTokens > 0 || m.estimatedCostUsd > 0
}

export async function collectCosts(): Promise<CostDashboard> {
  const files = await walk(ROOTS.agentSessions, { extensions: ['.jsonl'], max: 900, depth: 5 })
  const records = new Map<string, UsageRecord>()
  const sampleMap = new Map<string, ThroughputSample>()

  const live = new Set<string>()
  let reparsed = 0
  for (const file of files) {
    live.add(file)
    let stamp: string
    try {
      const st = await fs.stat(file)
      stamp = `${st.mtimeMs}:${st.size}`
    } catch {
      continue
    }
    let hit = fileCache.get(file)
    if (!hit || hit.stamp !== stamp) {
      hit = { stamp, agg: aggregateFile(await readText(file)) }
      fileCache.set(file, hit)
      reparsed++
    }
    // Identity-keyed set union: a call replayed into several checkpoint files
    // lands on the same key and is counted exactly once.
    for (const [k, v] of hit.agg.records) records.set(k, v)
    for (const [k, v] of hit.agg.samples) sampleMap.set(k, v)
  }
  // Drop cache entries for files that were deleted or rotated away.
  for (const key of fileCache.keys()) if (!live.has(key)) fileCache.delete(key)
  if (reparsed) logger.info('costs', `parsed ${reparsed}/${files.length} session files (rest cached)`)

  const { byModel, byDay } = foldRecords(records)
  const throughputSamples = [...sampleMap.values()]
  const allModels = [...byModel.values()].filter(isRealModelRow)
  const totalTokensAll = allModels.reduce((s, m) => s + m.totalTokens, 0)
  const totalCostAll = allModels.reduce((s, m) => s + m.estimatedCostUsd, 0)
  const models = allModels
    .map(m => ({ ...m, tokenShare: totalTokensAll ? m.totalTokens / totalTokensAll : 0, costShare: totalCostAll ? m.estimatedCostUsd / totalCostAll : 0 }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 60)
  // Fetch live OpenRouter billing data
  const orUsage = await fetchOpenRouterUsage()
  const warnings: string[] = models.length ? [] : ['No model usage entries found in local session logs.']
  if (orUsage) {
    // Find if we already have any openrouter model entries from logs
    const loggedOrCost = models.filter(m => m.mode === 'metered' && /openrouter/i.test(`${m.provider} ${m.model}`)).reduce((s, m) => s + m.estimatedCostUsd, 0)
    if (orUsage.limit != null) {
      const pct = Math.round((orUsage.usageUsd / orUsage.limit) * 100)
      warnings.push(`OpenRouter live: $${orUsage.usageUsd.toFixed(4)} used of $${orUsage.limit} limit (${pct}%)`)
    }
    if (loggedOrCost > 0 && Math.abs(orUsage.usageLifetime - loggedOrCost) > 0.01) {
      // The API number is lifetime spend for the key (authoritative for billing);
      // local logs only cover sessions recorded on this machine — a gap is expected.
      // Reported side by side, never summed: the two cover different windows.
      warnings.push(`OpenRouter billed $${orUsage.usageLifetime.toFixed(2)} lifetime (authoritative); local logs captured $${loggedOrCost.toFixed(2)} — logs only see sessions run on this machine`)
    }
  }
  const claudeUsage = await collectClaudeUsage()
  // Purely log-derived. OpenRouter's live number is LIFETIME spend for the key and
  // covers a different window than these logs, so folding it in here produced a
  // total that contradicted the "this month" figure rendered beside it. Lifetime
  // stays available on openRouterLive.usageLifetime for reference instead.
  const allCostUsd = models.reduce((s, m) => s + m.estimatedCostUsd, 0)

  /* ── Per-mode rollup ──────────────────────────────────────────────────
   * Subscription providers still log a per-token price — the client values the
   * call at list rate even though a flat plan already paid for it. Summing
   * those with real metered spend produced a "logged spend" figure of which
   * 63% had never been invoiced, and inflated the blended rate that values
   * local inference by 85%. Their dollars live in `notionalCostUsd`, counted
   * nowhere. */
  const MODE_ORDER: BillingMode[] = ['metered', 'subscription', 'local', 'cloud-routed']
  const modes = MODE_ORDER.map(mode => {
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
  const meteredCostUsd = modes.find(m => m.mode === 'metered')?.costUsd ?? 0

  // ── Freshness / self-healing staleness check ────────────────────────────
  // Track the newest parsed session so the cost view can warn when it goes
  // stale (e.g. a log-format change silently stops new sessions from parsing —
  // the exact failure we hit). `freshness` gives the dashboard/data layer a
  // signal to alert on before anyone trusts outdated numbers.
  // Taken from the RAW record set, not `models`: leaderboard rows are filtered
  // to real inference, but a zero-token envelope still proves the parser is
  // reading today's log format. Sourcing freshness from the filtered set made
  // the data look days staler than it was, which is the opposite of the point.
  let lastLoggedAt: string | null = null
  for (const r of records.values()) {
    if (r.timestamp && (!lastLoggedAt || r.timestamp > lastLoggedAt)) lastLoggedAt = r.timestamp
  }
  let staleDays: number | null = null
  if (lastLoggedAt) {
    staleDays = Math.floor((Date.now() - new Date(lastLoggedAt).getTime()) / 86400000)
    if (staleDays > 3) {
      warnings.push(`⚠ cost data may be stale — no usage parsed in ${staleDays} days (newest session ${lastLoggedAt.slice(0, 10)}).`)
    }
  }

  // ── Subscription & real-billing reconciliation ─────────────────────────
  // A flat Claude plan is real money moved every month, independent of per-token
  // logging. Attach the plan (so the UI can name it) and fold its cost into that
  // month so the cost view reconciles with the actual bill. OpenRouter's billed $
  // for the CURRENT month comes from the live key API; past months have no
  // per-month API figure, so they're null (lifetime still ships on openRouterLive).
  const billCfg = getConfig().billing
  const SUBSCRIPTIONS = billCfg.subscriptions
  const DEFAULT_PLAN = billCfg.defaultPlan
  const nowD = new Date()
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const provOf = new Map(models.map(m => [m.model, m.provider]))
  const tokOf = (v: unknown) => (v && typeof v === 'object' && typeof (v as { tokens?: number }).tokens === 'number' ? (v as { tokens: number }).tokens : 0)
  // Snapshot the current month's real OR billed $ so future months accumulate a
  // genuine per-month OpenRouter history (the key API exposes no history).
  if (orUsage?.usageMonthly != null) {
    recordOrMonthly(monthKey(new Date(nowD.getFullYear(), nowD.getMonth(), 1)), orUsage.usageMonthly)
  }
  const orHistory = readOrMonthlyHistory()

  const billing: CostDashboard['billing'] = []
  for (const back of [0, 1]) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - back, 1)
    const key = monthKey(d)
    const plan = SUBSCRIPTIONS[key] ?? DEFAULT_PLAN
    let api = 0, local = 0, logCost = 0
    for (const day of byDay.values()) {
      if (day.date.slice(0, 7) !== key) continue
      for (const [model, v] of Object.entries(day.byModel ?? {})) {
        const tk = tokOf(v)
        const mode = billingMode(provOf.get(model) ?? '', model)
        // Only metered dollars are real. Rolling a subscription's list-rate
        // cost into "logged session cost" made a $20 plan month look like it
        // had also run up per-token charges it never did.
        if (mode === 'metered') logCost += (v && typeof v === 'object' ? (v as { cost?: number }).cost ?? 0 : 0)
        // Cloud-routed ollama models belong on the API side: they run remotely
        // and are not free, so counting them as `local` overstates both the
        // "free tokens" headline and the monthly cost-avoided figure.
        if (mode === 'local') local += tk
        else api += tk
      }
    }
    const claudeTk = claudeUsage?.monthlyTokens?.[key] ?? 0
    billing.push({
      month: key,
      plan: plan.plan,
      planAmount: plan.amount,
      openRouterUsd: orHistory[key] ?? (back === 0 ? (orUsage?.usageMonthly ?? null) : null),
      apiTokens: api,
      claudeTokens: claudeTk,
      localTokens: local,
      totalTokens: api + local + claudeTk,
      logCost,
    })
  }

  // ── Local (Ollama) inference analytics ──────────────────────────────────
  // Token volume reuses the log-derived day/model aggregates above; tok/s comes
  // from throughputSamples (per-turn timestamp deltas — see ollama-throughput.ts).
  // Cost avoided is priced at the blended rate this month's real PAID usage
  // implies, not a hardcoded external number, so it degrades honestly to null
  // once there's no paid usage left in the logs to blend a rate from.
  // `:cloud` models run on Ollama's hosted hardware — not this rig, and not
  // free. Counting them as local overstates both volume and cost avoided.
  const localModels = models.filter(m => isLocalModel(m.provider, m.model))
  const cloudRoutedModels = models.filter(m => m.provider === 'ollama' && isCloudRoutedModel(m.model))
  const localDaily = [...byDay.values()]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .map(day => {
      let tokens = 0, requests = 0
      for (const [model, v] of Object.entries(day.byModel ?? {})) {
        if (!isLocalModel(provOf.get(model) ?? '', model)) continue
        tokens += v.tokens; requests += v.requests
      }
      return { date: day.date, tokens, requests }
    })
    .filter(d => d.tokens > 0)
  const localDailyWindowed = calendarWindow(localDaily, HEATMAP_WINDOW_DAYS)

  const samplesByModel = new Map<string, ThroughputSample[]>()
  const samplesByDay = new Map<string, ThroughputSample[]>()
  for (const s of throughputSamples) {
    const ms = samplesByModel.get(s.model) ?? []; ms.push(s); samplesByModel.set(s.model, ms)
    const date = s.timestamp.slice(0, 10)
    const ds = samplesByDay.get(date) ?? []; ds.push(s); samplesByDay.set(date, ds)
  }
  const avgOf = (arr: ThroughputSample[]) => arr.length ? arr.reduce((s, x) => s + x.tokensPerSec, 0) / arr.length : null
  /** Percentile over tok/s. The distribution is long-tailed — a few CPU-bound
   *  turns sit near 0.2 tok/s — so a mean alone misrepresents typical speed. */
  const pctlOf = (arr: ThroughputSample[], p: number): number | null => {
    if (!arr.length) return null
    const sorted = arr.map(x => x.tokensPerSec).sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  }

  const localModelRows = localModels
    .map(m => ({
      model: m.model,
      tokens: m.totalTokens,
      requests: m.requests,
      avgTokensPerSec: avgOf(samplesByModel.get(m.model) ?? []),
    }))
    .sort((a, b) => b.tokens - a.tokens)
  const dailyThroughput = calendarWindow(
    [...samplesByDay.entries()].map(([date, arr]) => ({ date, avgTokensPerSec: avgOf(arr) ?? 0, samples: arr.length })),
    HEATMAP_WINDOW_DAYS,
  )

  /* Only METERED usage can price local inference. A subscription's list-rate
     dollars were never billed, so blending them in values the rig's output
     against money nobody spent. */
  const paidModels = models.filter(m => m.mode === 'metered' && m.estimatedCostUsd > 0)
  const paidCost = paidModels.reduce((s, m) => s + m.estimatedCostUsd, 0)
  const paidBillableTokens = paidModels.reduce((s, m) => s + m.billableTokens, 0)
  const blendedApiRatePerMTokens = paidBillableTokens > 0 ? (paidCost / paidBillableTokens) * 1_000_000 : null

  const localTotalTokens = localModels.reduce((s, m) => s + m.totalTokens, 0)
  const localTotalRequests = localModels.reduce((s, m) => s + m.requests, 0)
  const localTokensThisMonth = billing[0]?.localTokens ?? 0

  const localCompute: CostDashboard['localCompute'] = localModels.length ? {
    totalTokens: localTotalTokens,
    totalRequests: localTotalRequests,
    daily: localDailyWindowed,
    models: localModelRows,
    avgTokensPerSec: avgOf(throughputSamples),
    medianTokensPerSec: pctlOf(throughputSamples, 0.5),
    p95TokensPerSec: pctlOf(throughputSamples, 0.95),
    generationSeconds: throughputSamples.reduce((s, x) => s + x.elapsedSec, 0),
    inputTokens: localModels.reduce((s, m) => s + m.inputTokens, 0),
    outputTokens: localModels.reduce((s, m) => s + m.outputTokens, 0),
    busiestDay: localDaily.length
      ? localDaily.reduce((best, d) => (d.tokens > best.tokens ? d : best), localDaily[0])
      : null,
    sampleCount: throughputSamples.length,
    dailyThroughput,
    blendedApiRatePerMTokens,
    blendedRateBasis: paidBillableTokens > 0 ? { costUsd: paidCost, billableTokens: paidBillableTokens } : null,
    costAvoidedMonthUsd: blendedApiRatePerMTokens != null ? (localTokensThisMonth / 1_000_000) * blendedApiRatePerMTokens : 0,
    costAvoidedAllTimeUsd: blendedApiRatePerMTokens != null ? (localTotalTokens / 1_000_000) * blendedApiRatePerMTokens : 0,
    cloudRouted: {
      tokens: cloudRoutedModels.reduce((s, m) => s + m.totalTokens, 0),
      requests: cloudRoutedModels.reduce((s, m) => s + m.requests, 0),
      models: cloudRoutedModels.map(m => m.model),
    },
  } : undefined

  return {
    source: `${rel(ROOTS.agentSessions)} session usage logs`,
    totalRequests: models.reduce((s, m) => s + m.requests, 0),
    totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    totalBillableTokens: models.reduce((s, m) => s + m.billableTokens, 0),
    totalInputTokens: models.reduce((s, m) => s + m.inputTokens, 0),
    totalOutputTokens: models.reduce((s, m) => s + m.outputTokens, 0),
    totalCacheReadTokens: models.reduce((s, m) => s + m.cacheReadTokens, 0),
    totalCacheWriteTokens: models.reduce((s, m) => s + m.cacheWriteTokens, 0),
    estimatedCostUsd: allCostUsd,
    openRouterLive: orUsage ?? undefined,
    claudeUsage: claudeUsage ?? undefined,
    models,
    modes,
    meteredCostUsd,
    dailyWindowDays: DAILY_WINDOW_DAYS,
    daily: calendarWindow([...byDay.values()], DAILY_WINDOW_DAYS),
    localCompute,
    billing,
    subscription: billing[0] ? { month: billing[0].month, plan: billing[0].plan, amount: billing[0].planAmount } : undefined,
    freshness: { lastLoggedAt, staleDays },
    warnings,
  }
}
