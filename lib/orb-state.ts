import type { HostSample } from './host-metrics'

export type OrbState = 'idle' | 'active' | 'surge' | 'hot'

export interface OrbActivity {
  lastEventAt: number | null
  runningTaskCount: number
  now: number
  previousState?: OrbState
  coolBelowSince?: number | null
}

export const ORB_THRESHOLDS = {
  eventWindowMs: 20_000,
  cpuSurgePct: 70,
  normalizedLoadSurge: 0.75,
  gpuSurgePct: 70,
  cpuHotC: 80,
  gpuHotC: 85,
  cpuCoolC: 75,
  gpuCoolC: 80,
  coolHoldMs: 3_000,
} as const

export function isOrbBelowCoolThreshold(sample: HostSample | null): boolean {
  if (!sample) return false
  const cpuCool = sample.cpuTempC == null || sample.cpuTempC < ORB_THRESHOLDS.cpuCoolC
  return cpuCool && sample.gpus.every(gpu => gpu.tempC < ORB_THRESHOLDS.gpuCoolC)
}

export function orbLoadIntensity(sample: HostSample | null): number {
  if (!sample) return 0
  const coreCount = Math.max(1, sample.cores.length)
  const normalizedLoad = sample.load1 / coreCount
  const gpuUtil = sample.gpus.reduce((max, gpu) => Math.max(max, gpu.utilPct), 0)
  return Math.min(1, Math.max(sample.cpuPct / 100, normalizedLoad, gpuUtil / 100))
}

/** Pure priority state derivation. The caller owns the two tiny hysteresis refs. */
export function deriveOrbState(sample: HostSample | null, activity: OrbActivity): OrbState {
  if (!sample) return 'idle'

  const enteringHot = (sample.cpuTempC ?? -Infinity) >= ORB_THRESHOLDS.cpuHotC
    || sample.gpus.some(gpu => gpu.tempC >= ORB_THRESHOLDS.gpuHotC)
  if (enteringHot) return 'hot'

  if (activity.previousState === 'hot') {
    const cooledLongEnough = isOrbBelowCoolThreshold(sample)
      && activity.coolBelowSince != null
      && activity.now - activity.coolBelowSince >= ORB_THRESHOLDS.coolHoldMs
    if (!cooledLongEnough) return 'hot'
  }

  const coreCount = Math.max(1, sample.cores.length)
  if (
    sample.cpuPct > ORB_THRESHOLDS.cpuSurgePct
    || sample.load1 / coreCount > ORB_THRESHOLDS.normalizedLoadSurge
    || sample.gpus.some(gpu => gpu.utilPct > ORB_THRESHOLDS.gpuSurgePct)
  ) return 'surge'

  const eventIsRecent = activity.lastEventAt != null
    && activity.now - activity.lastEventAt <= ORB_THRESHOLDS.eventWindowMs
  return activity.runningTaskCount > 0 || eventIsRecent ? 'active' : 'idle'
}
