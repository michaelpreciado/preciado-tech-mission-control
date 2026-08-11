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
