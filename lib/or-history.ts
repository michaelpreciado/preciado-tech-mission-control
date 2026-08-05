import fs from 'node:fs'
import path from 'node:path'

/**
 * Forward-looking OpenRouter monthly history.
 *
 * The OpenRouter key API only exposes the CURRENT month's billed $ (usage_monthly)
 * plus lifetime usage — there is no retroactive per-month history endpoint. To get
 * real per-month OpenRouter spend going forward, we snapshot usage_monthly into a
 * tiny local store each time it moves. Past months read from this store when
 * available; months we never recorded stay null (honest, not fabricated).
 *
 * Store: <project>/data/or-monthly.json  (gitignored — local only)
 */
const HISTORY_FILE = () => path.join(process.cwd(), 'data', 'or-monthly.json')

export type OrMonthlyHistory = Record<string, number> // 'YYYY-MM' -> billed $

export function readOrMonthlyHistory(): OrMonthlyHistory {
  try {
    const raw = fs.readFileSync(HISTORY_FILE(), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as OrMonthlyHistory) : {}
  } catch {
    return {}
  }
}

/** Upsert the current month's billed value, writing only when it changed. */
export function recordOrMonthly(month: string, billedUsd: number): void {
  if (!Number.isFinite(billedUsd) || billedUsd < 0) return
  const hist = readOrMonthlyHistory()
  const prev = hist[month]
  // Only touch disk when the number actually moved (the API is polled often).
  if (prev !== undefined && Math.abs(prev - billedUsd) < 0.005) return
  hist[month] = Math.round(billedUsd * 100) / 100
  try {
    const dir = path.dirname(HISTORY_FILE())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(HISTORY_FILE(), JSON.stringify(hist, null, 2), 'utf8')
  } catch {
    // Non-fatal: the history store is best-effort; never crash a collect on it.
  }
}

/** Graceful read of the config path (unused directly, kept for parity). */
export function orHistoryFile(): string {
  return HISTORY_FILE()
}
