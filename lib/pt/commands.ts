/** Server adapter: select existing projection facts; never recalculate counts. */
import { createHash } from 'node:crypto'
import { COMMAND_CATALOG, type BadgeSnapshot, type CommandsProjection } from './catalog'
import { CADENCE, CONTRACT_REVISION, SCHEMA_VERSION, type E, type Source, sourceRevisionMaterial } from './contract'
import type { PipelineRadar } from './pipeline'
import type { CrewProjection } from './crew'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function commandsEnvelope(
  snapshots: { pipeline?: E<PipelineRadar>; crew?: E<CrewProjection> } = {},
  now = new Date().toISOString(),
): E<CommandsProjection> {
  const referencedSnapshots: CommandsProjection['referencedSnapshots'] = {}
  // Preserve the owner's exact snapshot IDs, revisions, source quality and expiry.
  if (snapshots.pipeline) referencedSnapshots.pipeline = {
    ...snapshots.pipeline, data: snapshots.pipeline.data === null ? null : { facts: { pendingDecisionCount: snapshots.pipeline.data.pendingDecisionCount } },
  } satisfies BadgeSnapshot
  if (snapshots.crew) referencedSnapshots.crew = {
    ...snapshots.crew, data: snapshots.crew.data === null ? null : { facts: { 'counts.needsIntervention': snapshots.crew.data.counts.needsIntervention } },
  } satisfies BadgeSnapshot
  const revision = digest(COMMAND_CATALOG)
  const sources: Source[] = [{ id: 'command-catalog', revision, sourceAt: null, observedAt: now, lastSuccessAt: now, freshness: 'fresh', blocked: false, reason: null }]
  const data = { commands: COMMAND_CATALOG, referencedSnapshots }
  const refs = Object.entries(referencedSnapshots)
  const dataRevision = digest([sourceRevisionMaterial(sources), refs.map(([id, s]) => [id, s.dataRevision])])
  // Navigation availability belongs to the catalog. Badge evidence retains each
  // owner's expiry above and is classified independently by commandDisplay.
  const validUntil = new Date(Date.parse(now) + CADENCE.command.validityMs).toISOString()
  return { schemaVersion: SCHEMA_VERSION, contractRevision: CONTRACT_REVISION,
    snapshotId: digest({ dataRevision, now, refs: refs.map(([id, s]) => [id, s.snapshotId]) }),
    dataRevision, generatedAt: now, validUntil, sources, data, errors: [] }
}

export function deniedCommandsEnvelope(now = new Date().toISOString()): E<CommandsProjection> {
  const source: Source = { id: 'command-catalog', revision: null, sourceAt: null, observedAt: now, lastSuccessAt: null, freshness: 'unknown', blocked: true, reason: 'access_denied' }
  return { schemaVersion: SCHEMA_VERSION, contractRevision: CONTRACT_REVISION, snapshotId: digest(['denied', now]), dataRevision: digest('denied'), generatedAt: now, validUntil: now, sources: [source], data: null, errors: [{ sourceId: source.id, code: 'access_denied' }] }
}

export function unavailableCommandsEnvelope(now = new Date().toISOString()): E<CommandsProjection> {
  const envelope = deniedCommandsEnvelope(now)
  return { ...envelope, snapshotId: digest(['unavailable', now]), dataRevision: digest('unavailable'),
    sources: envelope.sources.map(source => ({ ...source, freshness: 'error', blocked: false, reason: 'read_failed' })),
    errors: [{ sourceId: 'command-catalog', code: 'read_failed' }] }
}
