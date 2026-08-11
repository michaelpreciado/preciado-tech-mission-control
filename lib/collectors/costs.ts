import path from 'node:path'
import type { CostDashboard, ModelUsage } from '../types'
import { getConfig } from '../config'
import { readOrMonthlyHistory, recordOrMonthly } from '../or-history'
import { ROOTS, readText, walk, rel } from './shared'
import { usageFromObject } from './costs-usage'

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

async function collectClaudeUsage(): Promise<CostDashboard['claudeUsage']> {
  const claudeProjects = path.join(getConfig().homeDir, '.claude/projects')
  const files = await walk(claudeProjects, { extensions: ['.jsonl'], max: 2000, depth: 6 })
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number }>()
  const byDay = new Map<string, { tokens: number; byModel: Record<string, number> }>()

  for (const file of files) {
    const text = await readText(file)
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

  const models = [...byModel.entries()].map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
  const daily = [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  return {
    models,
    totalInputTokens: models.reduce((s, m) => s + m.inputTokens, 0),
    totalOutputTokens: models.reduce((s, m) => s + m.outputTokens, 0),
    totalCacheTokens: models.reduce((s, m) => s + m.cacheTokens, 0),
    totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
    daily,
  }
}

export async function collectCosts(): Promise<CostDashboard> {
  const files = await walk(ROOTS.agentSessions, { extensions: ['.jsonl'], max: 900, depth: 5 })
  const byModel = new Map<string, ModelUsage>()
  const byDay = new Map<string, { date: string; requests: number; tokens: number; billableTokens: number; cost: number; byModel: Record<string, { tokens: number; cost: number }> }>()
  for (const file of files) {
    const text = await readText(file)
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || !line.includes('usage')) continue
      let obj: Record<string, unknown>
      try { obj = JSON.parse(line) } catch { continue }
      const u = usageFromObject(obj)
      if (!u) continue
      const key = `${u.provider}::${u.model}`
      const current = byModel.get(key) || {
        model: u.model,
        provider: u.provider,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        billableTokens: 0,
        estimatedCostUsd: 0,
        costInputUsd: 0,
        costOutputUsd: 0,
        costCacheReadUsd: 0,
        costCacheWriteUsd: 0,
        failedRequests: 0,
        lastUsedAt: undefined,
        tokenShare: 0,
        costShare: 0,
      }
      current.requests += 1
      current.inputTokens += u.input
      current.outputTokens += u.output
      current.cacheReadTokens += u.cacheRead
      current.cacheWriteTokens += u.cacheWrite
      current.totalTokens += u.total
      current.billableTokens += u.billableTokens
      current.estimatedCostUsd += u.cost
      current.costInputUsd += u.costInput
      current.costOutputUsd += u.costOutput
      current.costCacheReadUsd += u.costCacheRead
      current.costCacheWriteUsd += u.costCacheWrite
      current.failedRequests += u.failed ? 1 : 0
      if (u.timestamp && (!current.lastUsedAt || u.timestamp > current.lastUsedAt)) current.lastUsedAt = u.timestamp
      byModel.set(key, current)
      const date = String(u.timestamp || obj.timestamp || obj.createdAt || '').slice(0, 10) || 'unknown'
      const day = byDay.get(date) || { date, requests: 0, tokens: 0, billableTokens: 0, cost: 0, byModel: {} }
      day.requests += 1; day.tokens += u.total; day.billableTokens += u.billableTokens; day.cost += u.cost
      const modelKey = u.model || 'unknown'
      if (!day.byModel[modelKey]) day.byModel[modelKey] = { tokens: 0, cost: 0 }
      day.byModel[modelKey].tokens += u.total
      day.byModel[modelKey].cost += u.cost
      byDay.set(date, day)
    }
  }
  const allModels = [...byModel.values()]
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
    const loggedOrCost = models.filter(m => /openrouter/i.test(`${m.provider} ${m.model}`)).reduce((s, m) => s + m.estimatedCostUsd, 0)
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

  // ── Freshness / self-healing staleness check ────────────────────────────
  // Track the newest parsed session so the cost view can warn when it goes
  // stale (e.g. a log-format change silently stops new sessions from parsing —
  // the exact failure we hit). `freshness` gives the dashboard/data layer a
  // signal to alert on before anyone trusts outdated numbers.
  const lastTimes = models.map(m => m.lastUsedAt).filter((t): t is string => Boolean(t))
  const lastLoggedAt = lastTimes.length ? lastTimes.sort().pop()! : null
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
      logCost += day.cost
      for (const [model, v] of Object.entries(day.byModel ?? {})) {
        const tk = tokOf(v)
        if (provOf.get(model) === 'ollama') local += tk
        else api += tk
      }
    }
    let claudeTk = 0
    for (const cday of claudeUsage?.daily ?? []) {
      if (String(cday.date).slice(0, 7) === key) claudeTk += cday.tokens
    }
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
    openRouterModels: models.filter(m => /openrouter/i.test(`${m.provider} ${m.model}`)),
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    billing,
    subscription: billing[0] ? { month: billing[0].month, plan: billing[0].plan, amount: billing[0].planAmount } : undefined,
    freshness: { lastLoggedAt, staleDays },
    warnings,
  }
}
