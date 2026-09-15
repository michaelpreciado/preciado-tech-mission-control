import type { BusEvent } from './telemetry-types'

export type OrbOverlayKind = 'success' | 'sync'

export type OrbOverlay = {
  kind: OrbOverlayKind
  until: number
}

export const ORB_OVERLAY_SUCCESS_MS = 6_000
export const ORB_OVERLAY_SYNC_MS = 8_000
export const ORB_OVERLAY_COOLDOWN_MS = 30_000

const TERMINAL_STATUSES = new Set(['done', 'completed', 'closed'])
const SYNC_DISCRIMINATORS = new Set([
  'merge',
  'merged',
  'sync',
  'synced',
  'synchronize',
  'synchronized',
])

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function isSyncDiscriminator(value: string): boolean {
  return SYNC_DISCRIMINATORS.has(value.replace(/^task\./, ''))
}

/**
 * Map one normalized event to an additive orb treatment.
 *
 * This deliberately reads the bus discriminators (`type`, `raw_kind`, and
 * `status`) rather than task titles or arbitrary payload text. Rate limiting
 * belongs to the live-data owner; this function only maps one event to its
 * visual window and remains pure for unit tests.
 */
export function parseOrbOverlayEvent(evt: BusEvent, now: number): OrbOverlay | null {
  const type = normalized(evt.type)
  const rawKind = normalized(evt.raw_kind)
  const status = normalized(evt.status)

  // `task.done` is the canonical terminal event in the normalized Hermes
  // contract. Some task-progress updates also carry the terminal task status.
  const isCompletion = type !== 'task.failed'
    && rawKind !== 'failed'
    && (type === 'task.done'
    || (type === 'task.progress' && TERMINAL_STATUSES.has(status))
    || type === 'task.completed'
    || type === 'task.closed'
    || rawKind === 'done'
    || rawKind === 'completed'
    || rawKind === 'closed')

  if (isCompletion) return { kind: 'success', until: now + ORB_OVERLAY_SUCCESS_MS }

  // Merge/sync is intentionally constrained to the event discriminators. In
  // this contract dynamic kanban kinds are represented as task.<raw_kind>.
  const isSync = isSyncDiscriminator(type) || isSyncDiscriminator(rawKind)
  if (isSync) return { kind: 'sync', until: now + ORB_OVERLAY_SYNC_MS }

  return null
}
