/**
 * Hermes session usage collector — the missing half of the cost picture.
 *
 * The OpenClaw log walk (costs.ts → aggregateFile) only sees sessions run
 * through OpenClaw agents. Hermes — the gateway that runs jarvis/friday and
 * every cron/telegram/kanban dispatch — records its usage in per-profile
 * SQLite stores (one state.db under ~/.hermes plus one per profile), whose
 * `sessions` table carries per-session model, billing_provider, input/output/
 * cache tokens and an estimated cost. Measured 2026-09-01: Hermes moved
 * ~294M tokens in the trailing 7 days across deepseek/glm (OpenRouter) and
 * unc/qwen (local) — none of which the dashboard previously saw.
 *
 * Read-only (node:sqlite, WAL-safe — same pattern as hermes-kanban.ts).
 * One normalized UsageRecord per session, keyed by session id, so re-reads
 * collapse cleanly and the records merge into the OpenClaw pipeline unchanged.
 *
 * Cost honesty rules (validated against the source data):
 *  - `openrouter` sessions keep Hermes' estimated_cost_usd. It prices at list
 *    rate and OVERSTATES real billing (30d: ~$20 estimated vs ~$1.7 actually
 *    billed — cache reads bill at a fraction), so the authoritative dollar
 *    figures remain openRouterLive / or-monthly; these are token-accurate,
 *    cost-estimated rows exactly like the OpenClaw ones.
 *  - `ollama` / `localrouter` / local-named `custom` sessions ran on this rig
 *    (base_url 127.0.0.1) → provider 'ollama', cost forced to $0. Hermes
 *    priced some of these at a remote provider's list rate ("Local AI Router"
 *    at $2.17!) — that money was never billed and would have inflated the
 *    metered total and the blended rate used to value local inference.
 *  - `custom` sessions whose gateway_runtime.base_url is openrouter.ai are
 *    real metered traffic → provider 'openrouter', estimated cost kept.
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getConfig } from '../config'
import { logger } from '../logger'
import type { UsageRecord } from './costs-aggregate'
import { billableOf } from './costs-usage'

/** Profiles never change mid-process; discover once. */
let cachedRecords: UsageRecord[] | null = null
let cachedStamp = ''

/** Newest sessions-table mtime across every profile DB — invalidation stamp. */
function discoveryStamp(): string {
  const stamps: string[] = []
  const home = path.join(os.homedir(), '.hermes')
  const candidates = [
    path.join(home, 'state.db'),
    path.join(getConfig().paths.agentStateDbFile ?? '', '..'),
  ]
  const profilesDir = path.join(home, 'profiles')
  try {
    for (const name of fs.existsSync(profilesDir) ? fs.readdirSync(profilesDir) : []) {
      candidates.push(path.join(profilesDir, name, 'state.db'))
    }
  } catch { /* no profiles dir */ }
  for (const c of candidates) {
    try { stamps.push(`${c}:${fs.statSync(c).mtimeMs}`) } catch { /* absent */ }
  }
  return stamps.sort().join('|')
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRecord(r: any): UsageRecord | null {
  const inTok = Number(r.input_tokens) || 0
  const outTok = Number(r.output_tokens) || 0
  const cacheRead = Number(r.cache_read_tokens) || 0
  const cacheWrite = Number(r.cache_write_tokens) || 0
  const total = inTok + outTok + cacheRead + cacheWrite
  if (total <= 0) return null

  const rawProvider = String(r.billing_provider ?? '').toLowerCase()
  const model = String(r.model ?? 'unknown')
  // URL precedence: the session's runtime record (gateway_runtime.base_url in
  // model_config) reflects what actually served its requests — this is the
  // only reliable signal for fallback sessions (observed: billing_provider
  // 'ollama', billing_base_url 127.0.0.1, but the model is a 100B+ deepseek
  // that never existed in local Ollama and gateway_runtime says
  // openrouter.ai with fallback_active:true — every token went to OpenRouter
  // and was PAID). Older rows lack the runtime block → fall back to the
  // billing_base_url column, then to the provider label.
  const runtimeUrl = (() => {
    try { return String(JSON.parse(String(r.model_config ?? '{}'))?.gateway_runtime?.base_url ?? '') } catch { return '' }
  })()
  const billingUrl = String(r.billing_base_url ?? '')
  const cfgText = runtimeUrl || billingUrl || String(r.model_config ?? '')

  // 127.0.0.1/localhost = this rig = free; openrouter.ai = metered.
  const isOrRouter = /openrouter\.ai/.test(cfgText)
  const isLocalUrl = /127\.0\.0\.1|localhost/.test(cfgText)
  const isLocal = isLocalUrl
    || (!isOrRouter && (rawProvider === 'ollama' || rawProvider === 'localrouter'))
    || (rawProvider === 'custom' && !isOrRouter && !model.includes('/'))
    || (rawProvider === '' && !model.includes('/'))

  // 'local' rides the existing billingMode('ollama', …) path → mode local,
  // $0, counted in localCompute. Everything else is metered (never a
  // subscription: Hermes rows are openrouter or local, no claude-code).
  const provider = isLocal ? 'ollama' : 'openrouter'
  const cost = isLocal ? 0 : Math.max(0, Number(r.estimated_cost_usd) || 0)
  // Cache-read shares ride in their own columns downstream; here they only
  // feed billable (which excludes reads by design) and totals.
  const u = { input: inTok, output: outTok, cacheWrite }
  const started = typeof r.started_at === 'number' && r.started_at > 0
    ? new Date(r.started_at > 1e12 ? r.started_at : r.started_at * 1000).toISOString()
    : ''
  if (!started) return null

  return {
    model: model.replace(/^ollama\//, ''),
    provider,
    input: inTok, output: outTok, cacheRead, cacheWrite,
    total, billableTokens: billableOf(u),
    cost, costInput: 0, costOutput: cost, costCacheRead: 0, costCacheWrite: 0,
    failed: false,
    timestamp: started,
  }
}

/** Session-level identity: one row per hermes session, dedup-safe on re-read. */
function recordKey(r: { model: string; provider: string; timestamp: string }, sessionId: string): string {
  return `hermes:${sessionId}:${r.provider}::${r.model}`
}

/**
 * Read every profile's Hermes sessions and normalize them into UsageRecords.
 * Returns [] (never throws) so the costs pipeline degrades gracefully when
 * the stores are absent or locked.
 */
export function collectHermesUsage(): UsageRecord[] {
  const stamp = discoveryStamp()
  if (cachedRecords && stamp === cachedStamp) return cachedRecords

  const home = path.join(os.homedir(), '.hermes')
  const dbs = [
    path.join(home, 'state.db'),
    path.join(getConfig().paths.agentStateDbFile ?? '', '..', 'state.db'),
  ]
  const profilesDir = path.join(home, 'profiles')
  try {
    for (const name of fs.existsSync(profilesDir) ? fs.readdirSync(profilesDir) : []) {
      dbs.push(path.join(profilesDir, name, 'state.db'))
    }
  } catch { /* no profiles dir */ }

  const out: UsageRecord[] = []
  const seen = new Set<string>()
  for (const file of [...new Set(dbs)]) {
    if (!fs.existsSync(file)) continue
    let db: DatabaseSync | null = null
    try {
      db = new DatabaseSync(file, { readOnly: true })
      // model_config is only read for routing (base_url sniff); sessions with
      // zero tokens are skipped in rowToRecord — nothing to bill or chart.
      const rows = db.prepare(`
        SELECT id, model, model_config, billing_provider, billing_base_url, started_at,
               input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
               estimated_cost_usd
        FROM sessions
        WHERE started_at IS NOT NULL
      `).all() as any[]
      for (const r of rows) {
        const rec = rowToRecord(r)
        if (!rec) continue
        const key = recordKey(rec, String(r.id))
        if (seen.has(key)) continue
        seen.add(key)
        out.push(rec)
      }
    } catch (e) {
      logger.warn('costs', `hermes sessions read failed for ${file}: ${e instanceof Error ? e.message : e}`)
    } finally {
      try { db?.close() } catch { /* already closed */ }
    }
  }
  cachedRecords = out
  cachedStamp = stamp
  logger.info('costs', `hermes sessions: ${out.length} usage records from profile stores`)
  return out
}
