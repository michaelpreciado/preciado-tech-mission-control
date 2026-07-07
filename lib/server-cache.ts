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
const FRESH_MS = 15_000

let cached: { data: MissionData; collectedAt: number } | null = null
let inFlight: Promise<MissionData> | null = null

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
  if (cached) {
    if (Date.now() - cached.collectedAt > FRESH_MS) {
      // Serve stale immediately; refresh in the background.
      refresh().catch((err) => logger.error('server-cache/revalidate', err))
    }
    return cached.data
  }
  return refresh()
}
