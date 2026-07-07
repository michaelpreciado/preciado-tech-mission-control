import type { MissionData } from './types'
import { getMissionData } from './mission-data'

const CACHE_TTL_MS = 5000

let cached: { data: MissionData; expiresAt: number } | null = null

export async function getCachedMissionData(): Promise<MissionData> {
  const now = Date.now()
  if (cached && now < cached.expiresAt) return cached.data
  const data = await getMissionData()
  cached = { data, expiresAt: now + CACHE_TTL_MS }
  return data
}
