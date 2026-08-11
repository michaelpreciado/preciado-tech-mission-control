import type { MissionData } from './types'
import { getMissionData } from './mission-data'
import { logger } from './logger'

/**
 * Stale-while-revalidate cache for the mission-control aggregate.
 * Collection walks thousands of files and can take seconds — only the very
 * first request ever blocks on it. After that, expired entries are served
 * immediately while one background refresh runs; pages feel instant and the
 * data is at most one refresh interval behind.
 */
const ACTIVE_FRESH_MS = 15_000
const IDLE_FRESH_MS = 10 * 60_000
const IDLE_AFTER_MS = 60_000

let cached: { data: MissionData; collectedAt: number } | null = null
let inFlight: Promise<MissionData> | null = null
let lastAccessAt = 0

function refresh(): Promise<MissionData> {
  if (!inFlight) {
    inFlight = getMissionData()
      .then((data) => {
        cached = { data, collectedAt: Date.now() }
        return data
      })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

export async function getCachedMissionData(): Promise<MissionData> {
  const now = Date.now()
  // When no client has hit us for IDLE_AFTER_MS (a closed/throttled tab, overnight),
  // raise the freshness window so background re-walks (thousands of files) don't
  // churn disk/CPU. An actively-polling client (30s cadence) keeps 15s freshness.
  const idle = lastAccessAt > 0 && now - lastAccessAt > IDLE_AFTER_MS
  lastAccessAt = now

  if (cached) {
    const freshMs = idle ? IDLE_FRESH_MS : ACTIVE_FRESH_MS
    if (now - cached.collectedAt > freshMs) {
      // Serve stale immediately; refresh in the background.
      refresh().catch((err) => logger.error('server-cache/revalidate', err))
    }
    return cached.data
  }
  return refresh()
}
