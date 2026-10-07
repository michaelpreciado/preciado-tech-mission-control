/** Shared MC/native presentation. Business classifications are server facts;
 * failed/expired transport is displayed as last-known, never renewed by SSE. */
import { compatibleEnvelope, presentationState } from './presentation-state.mjs'
const countKeys = ['members', 'active', 'confirmedWorkers', 'trackedOnly', 'presenceReported', 'unknown', 'needsIntervention', 'interventionTasks', 'runningTasks', 'unassignedTasks']
const dated = fact => fact && ['fresh', 'stale', 'unknown', 'error'].includes(fact.freshness) && (fact.sourceAt === null || typeof fact.sourceAt === 'string')
export function compatibleCrewEnvelope(value) {
  return compatibleEnvelope(value) && (value.data === null || (
    Array.isArray(value.data?.members) && value.data?.counts && countKeys.every(key => value.data.counts[key] === null || Number.isSafeInteger(value.data.counts[key]) && value.data.counts[key] >= 0)
    && value.data.members.every(row => row && typeof row.id === 'string' && typeof row.name === 'string'
      && ['confirmed-worker', 'tracked-only', 'presence-reported', 'unknown'].includes(row.kind)
      && typeof row.needsIntervention === 'boolean' && dated(row.worker) && dated(row.presence) && dated(row.model) && dated(row.gateway)
      && ['confirmed-worker', 'tracked-only', 'unknown'].includes(row.worker.kind)
      && ['presence-reported', 'unknown'].includes(row.presence.kind)
      && (row.currentTask === null || typeof row.currentTask?.id === 'string' && typeof row.currentTask?.title === 'string' && typeof row.currentTask?.status === 'string'))))
}
/** @param {any} envelope @param {number} now @param {boolean} failed @param {string|null} error */
export function crewDisplay(envelope, now = Date.now(), failed = false, error = null) {
  const good = compatibleCrewEnvelope(envelope)
  const status = presentationState(good ? envelope : null, now, failed, error === 'access_denied')
  const data = good && !status.error ? envelope.data : null
  const badge = fact => status.lastKnown && fact.freshness === 'fresh' ? 'stale' : fact.freshness
  return {
    ...status, error: status.error ?? error,
    snapshotId: good ? envelope.snapshotId : null, dataRevision: good ? envelope.dataRevision : null,
    generatedAt: good ? envelope.generatedAt : null, validUntil: good ? envelope.validUntil : null,
    active: data?.counts.active ?? null, needsIntervention: data?.counts.needsIntervention ?? null,
    counts: data ? Object.fromEntries(countKeys.map(key => [key, data.counts[key]])) : null,
    rows: (data?.members ?? []).map(row => ({
      id: row.id, name: row.name, kind: row.kind, needsIntervention: row.needsIntervention,
      worker: { kind: row.worker.kind, sourceAt: row.worker.sourceAt, freshness: badge(row.worker), reason: row.worker.reason, evidence: row.worker.evidence, runId: row.worker.runId },
      presence: { kind: row.presence.kind, reportedStatus: row.presence.reportedStatus, reportedTask: row.presence.reportedTask, sourceAt: row.presence.sourceAt, freshness: badge(row.presence), reason: row.presence.reason },
      model: { value: row.model.value, sourceAt: row.model.sourceAt, freshness: badge(row.model), reason: row.model.reason },
      gateway: { status: row.gateway.status, sourceAt: row.gateway.sourceAt, freshness: badge(row.gateway), needsAttention: row.gateway.needsAttention },
      currentTask: row.currentTask ? { id: row.currentTask.id, title: row.currentTask.title, status: row.currentTask.status } : null,
    })),
  }
}
