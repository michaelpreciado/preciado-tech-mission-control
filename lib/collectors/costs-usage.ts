// Standalone, dependency-free normalizer for one span/line of usage in a
// provider JSONL log. Kept import-free so it is unit-testable under Node's
// ESM loader (which cannot resolve the app's extensionless `@/lib` imports).

/* eslint-disable @typescript-eslint/no-explicit-any -- JSONL log lines have unbounded shape */
export function usageFromObject(obj: Record<string, any>) {
  const message = obj?.message || obj?.response || obj
  // OpenClaw "model.completed" trace events nest usage under data.usage and
  // name fields differently (modelId, ts) — support both the legacy shape and
  // the current one so recent sessions stop being dropped as "no usage".
  const usage = message?.usage || obj?.usage || obj?.response?.usage || obj?.data?.usage
  if (!usage) return null

  const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.input ?? 0
  const output = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.output ?? 0
  const cacheRead = usage.cache_read_tokens ?? usage.cacheReadTokens ?? usage.cacheRead ?? 0
  const cacheWrite = usage.cache_write_tokens ?? usage.cacheWriteTokens ?? usage.cacheWrite ?? 0
  const explicitTotal = usage.total_tokens ?? usage.totalTokens ?? usage.total
  const total = Number(explicitTotal ?? (Number(input) + Number(output) + Number(cacheRead) + Number(cacheWrite))) || 0
  const billableTokens = (Number(input) || 0) + (Number(output) || 0) + (Number(cacheWrite) || 0)

  const model = message.model || obj.model || obj.modelId || usage.model || obj.providerMetadata?.model || obj.data?.model || 'unknown'
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
  const timestamp = obj.timestamp || message.timestamp || obj.createdAt || message.createdAt || obj.ts || obj.data?.ts || obj.data?.timestamp
  const iso = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : String(timestamp || '')
  const failed = Boolean(message.errorMessage || message.stopReason === 'error' || obj.error || obj.status === 'error' || obj.data?.error)

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

/* ── Local vs cloud-routed classification ──────────────────────────────
 * Ollama can execute a model on THIS machine or route it to Ollama's hosted
 * service. Hosted models carry a `:cloud` suffix, run on someone else's GPU,
 * and are not free — so counting them as "local compute" both inflates local
 * token volume and overstates the cost the rig avoided. They also log a $0
 * cost, which makes them invisible on the paid side too, so they have to be
 * called out explicitly rather than silently dropped.
 * ─────────────────────────────────────────────────────────────────────── */

/** True for an Ollama model executed on Ollama's hosted hardware, not the rig. */
export function isCloudRoutedModel(model: string): boolean {
  return /[:-]cloud$/i.test(String(model ?? '').trim())
}

/** True only for inference that actually ran on this machine. */
export function isLocalModel(provider: string, model: string): boolean {
  return String(provider ?? '').toLowerCase() === 'ollama' && !isCloudRoutedModel(model)
}

/* ── Duplicate-record identity ─────────────────────────────────────────
 * OpenClaw persists a session as a `.trajectory.jsonl` PLUS one
 * `.checkpoint.<id>.jsonl` per fork/resume, and every checkpoint replays the
 * whole conversation up to that point. A session that was resumed twice
 * therefore writes the same assistant turn — same tokens, same billed cost —
 * into three files. Summing the tree naively counted each API call up to 6
 * times: measured against this machine's logs, that overstated requests by
 * 62%, tokens by 36% and logged spend by 63%.
 *
 * `message.responseId` is the provider's own id for the completion and is the
 * true identity of an API call. Across 6,664 distinct responseIds in the local
 * tree, 4,115 appeared more than once and NOT ONE of the repeats carried
 * different usage — every duplicate is a byte-identical replay, so collapsing
 * on this key is lossless rather than lossy.
 *
 * Records with no responseId (~19% — mostly Ollama and trace events) fall back
 * to a content key. Timestamp is deliberately part of that key: two genuine
 * calls with identical token counts are common, two at the same millisecond
 * are not.
 * ─────────────────────────────────────────────────────────────────────── */
export function usageIdentity(obj: Record<string, any>, u: { model: string; input: number; output: number; cacheRead: number; cacheWrite: number; timestamp: string }): string {
  const message = obj?.message || obj?.response || obj
  const responseId = message?.responseId ?? obj?.responseId ?? obj?.data?.responseId
  if (responseId) return `r:${responseId}`
  return `k:${u.model}|${u.timestamp}|${u.input}|${u.output}|${u.cacheRead}|${u.cacheWrite}`
}

/**
 * Identity of one throughput sample. `model.completed` events embed the entire
 * `messagesSnapshot`, so every event re-emits a sample for every earlier turn
 * in the session — without this, turn 1 of a 40-turn session is counted 40
 * times and drags the average toward whatever that one turn happened to do.
 * A turn is uniquely identified by its own timestamp.
 */
export function throughputIdentity(s: { model: string; timestamp: string; outputTokens: number }): string {
  return `${s.model}|${s.timestamp}|${s.outputTokens}`
}

/* ── Billing mode ───────────────────────────────────────────────────────
 * The single most misleading thing a cost dashboard can do is add up dollars
 * and tokens that were paid for in different ways. Four modes exist here and
 * they must never be summed or ranked against one another:
 *
 *   metered       pay per token, a real invoice line       (OpenRouter)
 *   subscription  a flat monthly plan already paid for     (Claude Code, Codex)
 *   local         ran on this machine's GPU, costs nothing (Ollama)
 *   cloud-routed  Ollama's HOSTED hardware — not this rig, not free, and it
 *                 logs no price, so it is neither of the two above
 *
 * Subscription providers log a per-token `cost` anyway: the client prices the
 * request at list rate even though the plan already covered it. Counting that
 * as spend put $57.99 of ChatGPT-plan usage into a "logged spend" total and
 * dragged the blended rate — used to value local inference — up by 85%.
 * ─────────────────────────────────────────────────────────────────────── */

export type BillingMode = 'metered' | 'subscription' | 'local' | 'cloud-routed'

/**
 * Providers whose per-token cost is already covered by a flat plan. Matched on
 * the provider label, so an Anthropic or OpenAI model reached THROUGH a metered
 * gateway (`openrouter/anthropic/claude-sonnet-4-5`) is correctly still
 * metered — its provider is `openrouter`.
 */
export const DEFAULT_SUBSCRIPTION_PROVIDERS = ['openai', 'openai-codex', 'anthropic', 'claude', 'claude-code']

export function billingMode(provider: string, model: string, subscriptionProviders: readonly string[] = DEFAULT_SUBSCRIPTION_PROVIDERS): BillingMode {
  const p = String(provider ?? '').trim().toLowerCase()
  if (p === 'ollama') return isCloudRoutedModel(model) ? 'cloud-routed' : 'local'
  if (subscriptionProviders.some(s => s.toLowerCase() === p)) return 'subscription'
  return 'metered'
}

/** Tokens that a metered provider actually charges for. Cache READS are excluded
 *  deliberately — they are billed at a fraction of input rate and dwarf every
 *  other figure (96% of some models' totals), so ranking on them compares a
 *  heavily-cached agent loop against a cold local model and calls it more work. */
export function billableOf(u: { input: number; output: number; cacheWrite: number }): number {
  return (u.input || 0) + (u.output || 0) + (u.cacheWrite || 0)
}
