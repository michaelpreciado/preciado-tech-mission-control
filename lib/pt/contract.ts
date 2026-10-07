/** Shared PT OS wire contract. No filesystem, credentials or browser dependencies. */
export const SCHEMA_VERSION = 1 as const
export const CONTRACT_REVISION = 'pt-os.v1' as const

export type Freshness = 'fresh' | 'stale' | 'unknown' | 'error'

export type Source = {
  /** Logical identifier, never a private filesystem path. */
  id: string
  /** Content/producer revision; null when no revision is known. */
  revision: string | null
  sourceAt: string | null
  observedAt: string
  lastSuccessAt: string | null
  freshness: Freshness
  /** Inventory quality describes a scan; fact quality describes producer evidence.
   * sourceAt always remains the producer time. Never renew it on a scan. */
  freshnessBasis?: 'inventory' | 'fact'
  /** Access denial, business hold or reconciliation; independent of freshness. */
  blocked: boolean
  /** Safe reason code/description; never raw exceptions or credentials. */
  reason: string | null
}

export type ContractError = { sourceId: string; code: string }

export type E<T> = {
  schemaVersion: typeof SCHEMA_VERSION
  contractRevision: typeof CONTRACT_REVISION
  snapshotId: string
  /** Derived from source revisions, never generatedAt or the HTTP response time. */
  dataRevision: string
  generatedAt: string
  validUntil: string
  sources: Source[]
  /** null means unavailable. A successful empty read is []/an empty projection. */
  data: T | null
  errors: ContractError[]
}

/** PLAN-UNIFIED §1 defaults, milliseconds throughout. */
export const CADENCE = Object.freeze({
  pipeline: Object.freeze({ pollMs: 30_000, validityMs: 90_000, attentionAfterMs: 7 * 86_400_000 }),
  crew: Object.freeze({ pollMs: 15_000, validityMs: 45_000, heartbeatTtlMs: 300_000, workerWindowMs: 600_000 }),
  command: Object.freeze({ pollMs: 60_000, validityMs: 180_000 }),
  deliverables: Object.freeze({ pollMs: 60_000, validityMs: 180_000 }),
})

export type FreshnessInput = {
  read: 'success' | 'missing' | 'error'
  /** Includes a successfully read empty collection; excludes invented defaults. */
  hasSnapshot: boolean
  /** The fact's evidence time, not the time its wrapper was polled.
   * Heartbeat: receivedAt. File inventory: last successful scan time.
   * Retained data MUST keep its original time after refresh failure. */
  evidenceAt: string | null
  now: string
  cadenceMs: number
}

// ISO date-time with no zone designator. ECMAScript reads these as server-local
// time; producers are not local to this server, so they are read as UTC instead.
const ZONELESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/

/** Epoch milliseconds for a producer timestamp, independent of the server time zone.
 * Zone-less ISO date-times are UTC; NaN when unparseable. */
export function parseInstant(value: string): number {
  const zoneless = ZONELESS_DATE_TIME.exec(value.trim())
  return Date.parse(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : value)
}

/** Server-side evidence classification, deterministic at a supplied evaluation time.
 * A missing source after a previous success counts as a failed refresh. Future or
 * malformed timestamps cannot establish current presence. blocked is orthogonal.
 * Transport validUntil is checked separately by consumers; it never renews facts.
 */
export function evaluateFreshness(input: FreshnessInput): Pick<Source, 'freshness' | 'reason'> {
  const now = parseInstant(input.now)
  if (!Number.isFinite(now) || !Number.isFinite(input.cadenceMs) || input.cadenceMs <= 0) {
    throw new RangeError('A valid evaluation time and positive cadence are required')
  }
  if (input.read !== 'success') {
    if (input.hasSnapshot) return { freshness: 'stale', reason: 'refresh_failed' }
    return input.read === 'error'
      ? { freshness: 'error', reason: 'read_failed' }
      : { freshness: 'unknown', reason: 'no_evidence' }
  }
  if (!input.hasSnapshot || input.evidenceAt === null) {
    return { freshness: 'unknown', reason: 'no_evidence' }
  }
  const evidenceAt = parseInstant(input.evidenceAt)
  if (!Number.isFinite(evidenceAt)) return { freshness: 'unknown', reason: 'invalid_timestamp' }
  if (evidenceAt > now) return { freshness: 'unknown', reason: 'future_timestamp' }
  return now - evidenceAt > input.cadenceMs
    ? { freshness: 'stale', reason: 'cadence_exceeded' }
    : { freshness: 'fresh', reason: null }
}

/** Canonical input for an adapter's dataRevision digest. Observation times and
 * source ordering must not change a content revision. Snapshot IDs additionally
 * identify the exact evaluated projection (including its evaluation time). */
export function sourceRevisionMaterial(sources: readonly Source[]): string {
  const revisions = sources.map(({ id, revision }) => [id, revision] as const)
  // Total order: id, then revision (null before any string), so duplicate ids
  // cannot leak input order into the material.
  const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  revisions.sort(([aId, aRev], [bId, bRev]) => cmp(aId, bId) || (aRev === bRev ? 0 : aRev === null ? -1 : bRev === null ? 1 : cmp(aRev, bRev)))
  return JSON.stringify(revisions)
}

/** Exact revision compatibility; consumers must not guess across revisions. */
export function isCompatibleContract(value: { schemaVersion?: unknown; contractRevision?: unknown }): boolean {
  return value.schemaVersion === SCHEMA_VERSION && value.contractRevision === CONTRACT_REVISION
}
