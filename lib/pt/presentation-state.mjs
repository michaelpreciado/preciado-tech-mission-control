/** Shared browser/collector transport policy. This file is packaged byte-for-byte.
 * No business rules or filesystem reads belong here. */
export function compatibleEnvelope(value) {
  return value?.schemaVersion === 1 && value?.contractRevision === 'pt-os.v1'
    && typeof value.snapshotId === 'string' && typeof value.dataRevision === 'string'
    && Number.isFinite(Date.parse(value.generatedAt)) && Number.isFinite(Date.parse(value.validUntil))
    && Array.isArray(value.sources) && value.sources.length > 0
    && value.sources.every(source => source && typeof source.id === 'string'
      && ['fresh', 'stale', 'unknown', 'error'].includes(source.freshness)
      && typeof source.blocked === 'boolean')
    && Array.isArray(value.errors) && 'data' in value
}

export function presentationState(envelope, now = Date.now(), refreshFailed = false, accessDenied = false) {
  if (!compatibleEnvelope(envelope)) return { freshness: 'unknown', blocked: accessDenied, label: accessDenied ? 'unknown · blocked' : 'unknown', lastKnown: false }
  if (Date.parse(envelope.generatedAt) > now) return { freshness: 'unknown', blocked: accessDenied, label: accessDenied ? 'unknown · blocked' : 'unknown', lastKnown: false, error: 'future_snapshot' }
  const hasData = envelope.data !== null
  const expired = now >= Date.parse(envelope.validUntil)
  const blocked = accessDenied || envelope.sources.some(source => source.blocked)
  const freshness = hasData && (expired || refreshFailed) ? 'stale'
    : envelope.sources.some(source => source.freshness === 'error') ? 'error'
    : envelope.sources.some(source => source.freshness === 'stale') ? 'stale'
    : !hasData || envelope.sources.some(source => source.freshness === 'unknown') ? 'unknown' : 'fresh'
  return { freshness, blocked, label: freshness + (blocked ? ' · blocked' : ''), lastKnown: hasData && (expired || refreshFailed) }
}
