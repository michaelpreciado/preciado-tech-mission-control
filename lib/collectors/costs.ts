import path from 'node:path'
import type { CostDashboard, ModelUsage } from '../types'
import { getConfig } from '../config'
import { readOrMonthlyHistory, recordOrMonthly } from '../or-history'
import fs from 'node:fs/promises'
import { logger } from '../logger'
import { ROOTS, readText, walk, rel } from './shared'
import { isLocalModel, isCloudRoutedModel, billingMode } from './costs-usage'
import {
  aggregateFile, foldRecords, calendarWindow, isRealModelRow, rollupModes,
  DAILY_WINDOW_DAYS, HEATMAP_WINDOW_DAYS, type FileAggregate, type UsageRecord,
} from './costs-aggregate'
import { type ThroughputSample } from './ollama-throughput'
import { collectHermesUsage } from './hermes-usage'
import { collectCodexUsage } from './codex-usage'

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
    sessionsCount: files.length,
    daily,
    monthlyTokens,
  }
}
/* The parse pipeline lives in ./costs-aggregate — pure, and unit-tested there.
   What stays here is the part that cannot be pure: walking the session tree,
   caching each file against its mtime+size, and reconciling against the live
   OpenRouter billing API. */

/** path → { stamp, aggregate }. Stamp changes ⇒ the file was appended to. */
const fileCache = new Map<string, { stamp: string; agg: FileAggregate }>()

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

  // ── Hermes sessions (SQLite profile stores) ─────────────────────────────
  // The OpenClaw walk above only covers sessions run through OpenClaw agents.
  // Hermes (gateway/telegram/cron/kanban dispatches) records usage in
  // per-profile SQLite `sessions` tables — merged into the same record set so
  // every downstream figure (modes, billing, local-vs-API, cost-avoided)
  // includes it. Records are keyed `hermes:<session>` and dedup on re-read.
  for (const rec of collectHermesUsage()) {
    records.set(`hermes:${rec.timestamp}:${rec.provider}::${rec.model}:${rec.input}:${rec.output}`, rec)
  }

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
  const [claudeUsage, codexUsage] = await Promise.all([collectClaudeUsage(), collectCodexUsage()])
  // Purely log-derived. OpenRouter's live number is LIFETIME spend for the key and
  // covers a different window than these logs, so folding it in here produced a
  // total that contradicted the "this month" figure rendered beside it. Lifetime
  // stays available on openRouterLive.usageLifetime for reference instead.
  const allCostUsd = models.reduce((s, m) => s + m.estimatedCostUsd, 0)

  const baseModes = rollupModes(models)
  const subscriptionExtras = [claudeUsage, codexUsage].filter(Boolean)
  const modes = baseModes.map(mode => mode.mode !== 'subscription' ? mode : {
    ...mode,
    models: mode.models + subscriptionExtras.reduce((sum, usage) => sum + (usage?.models.length ?? 0), 0),
    billableTokens: mode.billableTokens + subscriptionExtras.reduce((sum, usage) => sum + (usage?.totalInputTokens ?? 0) + (usage?.totalOutputTokens ?? 0), 0),
    totalTokens: mode.totalTokens + subscriptionExtras.reduce((sum, usage) => sum + (usage?.totalTokens ?? 0), 0),
    inputTokens: mode.inputTokens + subscriptionExtras.reduce((sum, usage) => sum + (usage?.totalInputTokens ?? 0), 0),
    outputTokens: mode.outputTokens + subscriptionExtras.reduce((sum, usage) => sum + (usage?.totalOutputTokens ?? 0), 0),
  }).filter(m => m.requests > 0 || m.totalTokens > 0)
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
    const codexTk = codexUsage?.monthlyTokens?.[key] ?? 0
    billing.push({
      month: key,
      plan: plan.plan,
      planAmount: plan.amount,
      openRouterUsd: orHistory[key] ?? (back === 0 ? (orUsage?.usageMonthly ?? null) : null),
      apiTokens: api,
      claudeTokens: claudeTk,
      codexTokens: codexTk,
      localTokens: local,
      totalTokens: api + local + claudeTk + codexTk,
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
    codexUsage: codexUsage ?? undefined,
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
