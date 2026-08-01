import path from 'node:path'
import type { CostDashboard, ModelUsage } from '../types'
import { getConfig } from '../config'
import { ROOTS, readText, walk, rel } from './shared'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONL log lines have unbounded shape
function usageFromObject(obj: Record<string, any>) {
  const message = obj?.message || obj?.response || obj
  const usage = message?.usage || obj?.usage || obj?.response?.usage
  if (!usage) return null

  const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.input ?? 0
  const output = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output ?? 0
  const cacheRead = usage.cache_read_tokens ?? usage.cacheReadTokens ?? usage.cacheRead ?? 0
  const cacheWrite = usage.cache_write_tokens ?? usage.cacheWriteTokens ?? usage.cacheWrite ?? 0
  const explicitTotal = usage.total_tokens ?? usage.totalTokens
  const total = Number(explicitTotal ?? (Number(input) + Number(output) + Number(cacheRead) + Number(cacheWrite))) || 0
  const billableTokens = (Number(input) || 0) + (Number(output) || 0) + (Number(cacheWrite) || 0)

  const model = message.model || obj.model || usage.model || obj.providerMetadata?.model || 'unknown'
  const provider = message.provider || obj.provider || message.api || obj.api || obj.providerName || (String(model).includes('/') ? String(model).split('/')[0] : 'unknown')
  const costObj = usage.cost || {}
  const costInput = Math.max(0, Number(costObj.input ?? 0) || 0)
  const costOutput = Math.max(0, Number(costObj.output ?? 0) || 0)
  const costCacheRead = Math.max(0, Number(costObj.cacheRead ?? costObj.cache_read ?? 0) || 0)
  const costCacheWrite = Math.max(0, Number(costObj.cacheWrite ?? costObj.cache_write ?? 0) || 0)
  const rawCost = Number(costObj.total ?? usage.estimatedCostUsd ?? usage.costUsd ?? obj.costUsd ?? (costInput + costOutput + costCacheRead + costCacheWrite))
  // Some provider logs use negative placeholder values when billing metadata is unavailable.
  // Treat those as unknown/zero so dashboard totals do not show impossible negative spend.
  const cost = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 0
  const timestamp = obj.timestamp || message.timestamp || obj.createdAt || message.createdAt
  const iso = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : String(timestamp || '')
  const failed = Boolean(message.errorMessage || message.stopReason === 'error' || obj.error || obj.status === 'error')

  return {
    model: String(model),
    provider: String(provider),
    input: Number(input) || 0,
    output: Number(output) || 0,
    cacheRead: Number(cacheRead) || 0,
    cacheWrite: Number(cacheWrite) || 0,
    total,
    billableTokens,
    cost,
    costInput,
    costOutput,
    costCacheRead,
    costCacheWrite,
    timestamp: iso,
    failed,
  }
}

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
    warnings,
  }
}
