import { compatibleEnvelope, presentationState } from './presentation-state.mjs'
export const REVIEW_STATES = ['draft', 'awaiting-verification', 'not-accepted', 'approval-held', 'verified', 'unknown']
export function compatibleDeliverables(value) {
  return compatibleEnvelope(value) && (value.data === null || (Array.isArray(value.data.items)
    && value.data.items.every(row => /^[a-f0-9]{64}$/.test(row.id) && REVIEW_STATES.includes(row.reviewState)
      && typeof row.title === 'string' && typeof row.available === 'boolean'
      && (row.artifactRevision === null || /^[a-f0-9]{64}$/.test(row.artifactRevision)))) )
}
/** @param {unknown} envelope @param {number} now @param {boolean} failed @param {string|null} error */
export function deliverablesDisplay(envelope, now = Date.now(), failed = false, error = null) {
  const compatible = compatibleDeliverables(envelope)
  const state = presentationState(compatible ? envelope : null, now, failed, error === 'access_denied')
  const usable = compatible && !state.error && error !== 'access_denied'
  return { ...state, rows: usable ? envelope.data?.items ?? [] : [],
    count: usable ? envelope.data?.count ?? null : null,
    complete: usable && envelope.data?.complete === true,
    validUntil: compatible ? envelope.validUntil : null, generatedAt: compatible ? envelope.generatedAt : null,
    snapshotId: compatible ? envelope.snapshotId : null, dataRevision: compatible ? envelope.dataRevision : null,
    canRead: usable && envelope.data !== null && !state.lastKnown && !failed, error: state.error ?? error }
}
export function contentPath(row) {
  if (!/^[a-f0-9]{64}$/.test(row?.id) || !/^[a-f0-9]{64}$/.test(row?.artifactRevision)) return null
  return `/api/deliverables/${row.id}?revision=${row.artifactRevision}` + (row.evidenceRevision ? `&evidenceRevision=${encodeURIComponent(row.evidenceRevision)}` : '')
}
export function matchingContent(value, row) {
  return compatibleEnvelope(value) && value.data?.id === row.id && value.data?.artifactRevision === row.artifactRevision
    && value.data?.evidenceRevision === row.evidenceRevision && typeof value.data?.text === 'string'
    && ['text/plain', 'text/markdown', 'text/html-source'].includes(value.data.mediaType)
}
