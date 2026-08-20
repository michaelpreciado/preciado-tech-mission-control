// Standalone, dependency-free extractor for per-turn local-inference throughput.
// Kept import-free (like costs-usage.ts) so it is unit-testable under Node's ESM
// loader, which cannot resolve the app's extensionless `@/lib` imports.
//
// OpenClaw trajectory logs don't record per-call duration directly, but each
// `model.completed` event's `data.messagesSnapshot` carries a timestamp on every
// turn plus that turn's usage. The wall-clock delta between an assistant turn
// and the message immediately before it is, for a localhost Ollama call, a
// reasonable proxy for that call's inference time (prompt processing + decode
// combined — not a pure decode-only benchmark number). Deltas outside a
// plausible inference window (near-zero, or long enough to be a human idle gap
// rather than compute) are discarded rather than skewing the average.

/* eslint-disable @typescript-eslint/no-explicit-any -- trajectory event shape is unbounded */

const MIN_ELAPSED_SEC = 0.2
const MAX_ELAPSED_SEC = 120

export interface ThroughputSample {
  model: string
  timestamp: string
  outputTokens: number
  elapsedSec: number
  tokensPerSec: number
}

export function extractThroughputSamples(obj: Record<string, any>): ThroughputSample[] {
  if (obj?.type !== 'model.completed') return []
  const provider = obj.provider || obj.data?.model?.provider
  if (provider !== 'ollama') return []
  const model = String(obj.modelId || obj.data?.model?.name || obj.model || 'unknown')
  const snapshot = obj.data?.messagesSnapshot
  if (!Array.isArray(snapshot) || snapshot.length < 2) return []

  const samples: ThroughputSample[] = []
  for (let i = 1; i < snapshot.length; i++) {
    const cur = snapshot[i]
    const prev = snapshot[i - 1]
    if (cur?.role !== 'assistant') continue
    const outputTokens = Number(cur?.usage?.output ?? 0)
    if (!outputTokens) continue
    const curTs = Number(cur?.timestamp)
    const prevTs = Number(prev?.timestamp)
    if (!Number.isFinite(curTs) || !Number.isFinite(prevTs)) continue
    const elapsedSec = (curTs - prevTs) / 1000
    if (elapsedSec < MIN_ELAPSED_SEC || elapsedSec > MAX_ELAPSED_SEC) continue
    samples.push({
      model,
      timestamp: new Date(curTs).toISOString(),
      outputTokens,
      elapsedSec,
      tokensPerSec: outputTokens / elapsedSec,
    })
  }
  return samples
}
