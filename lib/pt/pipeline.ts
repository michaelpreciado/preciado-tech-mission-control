/** Pipeline radar: the only store normalizer and business projection owner.
 * Read-only. Producers and the legacy mutation API retain ownership of writes.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { getConfig } from '../config'
import type { PipelineLead, PipelineStage } from '../types'
import { CADENCE, CONTRACT_REVISION, SCHEMA_VERSION, evaluateFreshness, parseInstant, sourceRevisionMaterial, type E, type Freshness, type Source } from './contract'

export const RADAR_STAGES = ['leads_found', 'social_scraped', 'concept_ready', 'awaiting_approval', 'in_development', 'completed', 'archived', 'disqualified'] as const
export type RadarStage = typeof RADAR_STAGES[number]
type Raw = Record<string, unknown>
export type StoredEvidence = { index: number; raw: Raw }
export type NormalizedLead = Omit<PipelineLead, 'stage'> & {
  stage: RadarStage
  archived: boolean
  disqualified: boolean
  duplicateOf?: string
  /** Lossless original records, including legacy fields and unknown nested keys. */
  evidence: StoredEvidence[]
}
export type PipelineStore = {
  records: NormalizedLead[]
  rawRecordCount: number
  invalidRecords: { index: number; reason: string }[]
  duplicateRecordCount: number
  sourceAt: string | null
  revision: string
}
export type PipelineRead =
  | { ok: true; store: PipelineStore }
  | { ok: false; code: 'missing_store' | 'read_failed' | 'invalid_json' | 'invalid_store'; revision: string | null }
export type Fact = {
  state: string
  sourceAt: string | null
  sourceIds: string[]
  freshness: Freshness
  blocked: boolean
  reason: string | null
  evidence: { recordIndex: number; field: string; value: unknown }[]
}
export type RadarRecord = {
  id: string
  businessName: string
  stage: RadarStage
  lead: Omit<NormalizedLead, 'evidence'>
  sourceIndices: number[]
  duplicateCount: number
  archived: boolean
  disqualified: boolean
  active: boolean
  sourceAt: string | null
  freshness: Freshness
  blocked: boolean
  blockedReasons: string[]
  attention: string[]
  requiresBoss: boolean
  gate: string | null
  nextAction: string
  sendReady: boolean
  facts: Record<'build' | 'review' | 'providerAcceptance' | 'delivery' | 'reply' | 'payment' | 'send', Fact>
}
export type PipelineRadar = {
  rawRecordCount: number
  recordCount: number
  invalidRecordCount: number
  duplicateRecordCount: number
  invalidRecords: PipelineStore['invalidRecords']
  counts: Record<RadarStage, number>
  activeCounts: Record<RadarStage, number>
  activeCount: number
  archivedCount: number
  disqualifiedCount: number
  blockedCount: number
  attentionCount: number
  pendingDecisionCount: number
  sendReadyCount: number
  evidenceCounts: Record<keyof RadarRecord['facts'], Record<string, number>>
  attentionIds: string[]
  pendingDecisionIds: string[]
  revenue: { activeCount: number; pricedCount: number; offerEstimate: number; recordIds: string[] }
  records: RadarRecord[]
  display: { recordIds: string[]; limitPerStage: number; complete: boolean }
}
const object = (v: unknown): Raw => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {}
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v : undefined
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined
const digest = (v: string) => createHash('sha256').update(v).digest('hex')
const at = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(parseInstant(v)) ? new Date(parseInstant(v)).toISOString() : null
const member = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v.toLowerCase())
const valueAt = (r: Raw, field: string): unknown => field.split('.').reduce<unknown>((v, k) => object(v)[k], r)

function normalizeLead(raw: Raw, index: number): NormalizedLead | null {
  const id = str(raw.id) ?? str(raw.lead_id)
  const businessName = str(raw.business_name) ?? str(raw.businessName)
  if (!id || !businessName || !RADAR_STAGES.includes(raw.stage as RadarStage)) return null
  const extra = object(raw.extra_data ?? raw.extraData)
  const concept = object(raw.concept), approval = object(raw.approval), dev = object(raw.development), done = object(raw.completed)
  // Aliases are normalized once; originals are preserved verbatim in evidence.
  return {
    id, businessName, stage: raw.stage as RadarStage,
    archived: raw.archived === true || extra.archived === true || raw.stage === 'archived',
    disqualified: raw.disqualified === true || raw.qualified === false || extra.disqualified === true || raw.stage === 'disqualified',
    duplicateOf: str(raw.duplicate_of ?? extra.duplicate_of ?? extra.superseded_by),
    location: str(raw.location), phone: str(raw.phone), website: str(raw.website), vertical: str(raw.vertical),
    score: num(raw.score), rating: num(raw.rating), reviewCount: num(raw.review_count ?? raw.reviewCount),
    qualified: typeof raw.qualified === 'boolean' ? raw.qualified : undefined,
    previewUrl: str(raw.preview_url ?? raw.previewUrl), playStoreUrl: str(raw.play_store_url ?? raw.playStoreUrl),
    firstSeenAt: str(raw.first_seen_at ?? raw.firstSeenAt), createdAt: str(raw.created_at ?? raw.createdAt), updatedAt: str(raw.updated_at ?? raw.updatedAt),
    extraData: extra, outreach: object(raw.outreach),
    socials: Object.fromEntries(Object.entries(object(raw.socials)).filter(([, v]) => typeof v === 'string')),
    concept: { ...concept, designDirection: str(concept.design_direction ?? concept.designDirection), inspirationSources: Array.isArray(concept.inspiration_sources ?? concept.inspirationSources) ? (concept.inspiration_sources ?? concept.inspirationSources) as string[] : undefined, estimatedScope: str(concept.estimated_scope ?? concept.estimatedScope) },
    approval: { ...approval, status: str(approval.status) as NonNullable<PipelineLead['approval']>['status'], telegramSentAt: str(approval.telegram_sent_at ?? approval.telegramSentAt), decidedAt: str(approval.decided_at ?? approval.decidedAt) },
    development: { ...dev, taskId: str(dev.task_id ?? dev.taskId), status: str(dev.status), progressPct: num(dev.progress_pct ?? dev.progressPct), milestones: Array.isArray(dev.milestones) ? dev.milestones.filter(m => typeof object(m).label === 'string' && typeof object(m).done === 'boolean') as { label: string; done: boolean }[] : undefined },
    completed: { ...done, previewUrl: str(done.preview_url ?? done.previewUrl), emailDraft: str(done.email_draft ?? done.emailDraft), emailStatus: str(done.email_status ?? done.emailStatus) as NonNullable<PipelineLead['completed']>['emailStatus'], signoffSentAt: str(done.signoff_sent_at ?? done.signoffSentAt) },
    history: Array.isArray(raw.history) ? raw.history.filter(h => str(object(h).stage) && str(object(h).ts)) as PipelineLead['history'] : [],
    evidence: [{ index, raw }],
  }
}

/** Invalid individual rows are quarantined; a bad root is a failed read, never empty. */
export function normalizePipeline(raw: unknown, revision = digest(JSON.stringify(raw) ?? 'undefined')): PipelineStore {
  const list = Array.isArray(raw) ? raw : object(raw).leads
  if (!Array.isArray(list)) throw new TypeError('invalid_store')
  const invalidRecords: PipelineStore['invalidRecords'] = []
  const groups = new Map<string, NormalizedLead[]>()
  list.forEach((entry, index) => {
    const lead = normalizeLead(object(entry), index)
    if (!lead) { invalidRecords.push({ index, reason: 'invalid_record' }); return }
    groups.set(lead.id, [...(groups.get(lead.id) ?? []), lead])
  })
  // Resolve explicit duplicate/replacement aliases only when their target exists.
  // Cycles and unresolved targets stay visible and blocked for reconciliation.
  const destination = (id: string): string => {
    let cursor = id
    const visited = new Set<string>()
    while (!visited.has(cursor)) {
      visited.add(cursor)
      const target = groups.get(cursor)?.[0].duplicateOf
      if (!target || !groups.has(target)) return cursor
      cursor = target
    }
    return id
  }
  const merged = new Map<string, NormalizedLead[]>()
  for (const [id, rows] of groups) {
    const target = destination(id)
    merged.set(target, [...(merged.get(target) ?? []), ...rows])
  }
  const records = [...merged].map(([id, rows]) => {
    const canonical = rows.filter(row => row.id === id).sort((a, b) => (parseInstant(b.updatedAt ?? '') || 0) - (parseInstant(a.updatedAt ?? '') || 0) || a.evidence[0].index - b.evidence[0].index)[0]
    return { ...canonical, evidence: rows.flatMap(row => row.evidence).sort((a, b) => a.index - b.index) }
  })
  return { records, rawRecordCount: list.length, invalidRecords, duplicateRecordCount: list.length - invalidRecords.length - records.length, sourceAt: at(object(raw).updated_at ?? object(raw).updatedAt), revision }
}

export function pipelinePath(): string { return path.join(getConfig().paths.pipelineDir, 'pipeline.json') }
export async function readPipelineStore(file = pipelinePath()): Promise<PipelineRead> {
  let bytes: string
  try { bytes = await fs.readFile(file, 'utf8') }
  catch (error) { return { ok: false, code: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing_store' : 'read_failed', revision: null } }
  const revision = digest(bytes)
  let raw: unknown
  try { raw = JSON.parse(bytes) } catch { return { ok: false, code: 'invalid_json', revision } }
  try { return { ok: true, store: normalizePipeline(raw, revision) } }
  catch { return { ok: false, code: 'invalid_store', revision } }
}

const day = (now: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
function overdue(value: unknown, now: string): boolean {
  if (typeof value !== 'string' || !at(value)) return false
  // A producer date without time is a Los Angeles calendar deadline.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value < day(now) : parseInstant(value) < parseInstant(now)
}

function projectRecord(lead: NormalizedLead, now: string): RadarRecord {
  const { evidence, ...displayLead } = lead
  // Only canonical-id rows participate in business evidence; archived alias
  // history is retained but cannot override its replacement's current decision.
  const rows = evidence.filter(row => (row.raw.id ?? row.raw.lead_id) === lead.id)
  const signals = (...fields: string[]) => rows.flatMap(row => fields.flatMap(field => {
    const value = valueAt(row.raw, field)
    return value === undefined || value === null || value === '' ? [] : [{ recordIndex: row.index, field, value }]
  }))
  const has = (fields: string[], check: (v: unknown) => boolean) => signals(...fields).some(e => check(e.value))
  const knownAt = (...fields: string[]) => signals(...fields).map(e => at(e.value)).filter((v): v is string => v !== null).sort((a, b) => parseInstant(a) - parseInstant(b)).at(-1) ?? null
  const fact = (state: string, fields: string[], dateFields: string[] = [], blocked = false, reason: string | null = null): Fact => {
    const sourceAt = knownAt(...dateFields)
    const quality = evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: sourceAt, now, cadenceMs: CADENCE.pipeline.attentionAfterMs })
    return { state, sourceAt, sourceIds: ['pipeline'], ...quality, blocked, reason: reason ?? quality.reason, evidence: signals(...fields) }
  }
  const buildFields = ['stage', 'development.status', 'development.progress_pct', 'development.progressPct', 'extra_data.build_status']
  const buildComplete = lead.stage === 'completed' || has(['development.status', 'extra_data.build_status'], v => member(v, ['complete', 'completed', 'built', 'deployed'])) || lead.development?.progressPct === 100
  const reviewFields = ['approval.status', 'approval.decided_at', 'approval.decidedAt', 'extra_data.review', 'extra_data.reviewed_at', 'extraData.review', 'extraData.reviewed_at']
  const approvalHeld = has(['approval.status'], v => member(v, ['held', 'rejected']))
  const explicitHeld = has(['extra_data.review', 'extraData.review'], v => v === 'held')
  const approved = has(['approval.status', 'extra_data.review', 'extraData.review'], v => v === 'approved')
  const heldAt = knownAt('extra_data.reviewed_at', 'extraData.reviewed_at')
  const approvalAt = knownAt('approval.decided_at', 'approval.decidedAt')
  const held = approvalHeld || explicitHeld && !(approvalAt && heldAt && approvalAt > heldAt)
  const reviewConflict = held && approved && !(heldAt && approvalAt && heldAt > approvalAt)
  const reviewState = held ? 'held' : approved ? 'approved' : has(['approval.status'], v => v === 'preview-approved') ? 'preview_approved' : lead.stage === 'awaiting_approval' || has(['approval.status'], v => v === 'pending') ? 'pending' : 'unknown'
  const acceptanceFields = ['outreach.resend_id', 'outreach.message_id', 'resend_id', 'extra_data.resend_id', 'outreach.resend_status', 'provider.status', 'provider.accepted_at']
  const accepted = has(acceptanceFields.slice(0, 4), v => !!str(v)) || has(['outreach.resend_status', 'provider.status'], v => member(v, ['accepted', 'sent', 'delivered', 'bounced', 'opened', 'clicked'])) || has(['provider.accepted_at'], v => !!at(v))
  const deliveryFields = ['outreach.resend_status', 'outreach.delivery_status', 'extra_data.delivery_status', 'delivery.status', 'delivery.delivered_at', 'outreach.delivered_at', 'extra_data.email_status']
  const delivered = has(deliveryFields, v => member(v, ['delivered', 'opened', 'clicked'])) || has(['delivery.delivered_at', 'outreach.delivered_at'], v => !!at(v))
  const bounced = has(deliveryFields, v => typeof v === 'string' && /^(bounced|failed|rejected)(-|$)/.test(v))
  const sendFields = ['outreach.sent_at', 'outreach.status', 'completed.email_status', 'completed.emailStatus', 'email_sent_at', 'extra_data.outreach_sent', 'extra_data.sent_at', 'extra_data.email_status', 'outreach_status', 'extra_data.outreach_status']
  const sent = has(['outreach.sent_at', 'email_sent_at', 'extra_data.sent_at'], v => !!at(v)) || has(sendFields, v => member(v, ['sent', 'sent-awaiting-reply', 'sent_awaiting_reply'])) || has(['extra_data.outreach_sent'], v => v === true)
  const replyFields = ['outreach.reply', 'reply.status', 'reply.received_at', 'outreach.reply_at']
  const replied = has(['outreach.reply'], v => !!str(v) && !member(v, ['none', 'none recorded', 'no reply', 'unknown', 'awaiting reply'])) || has(['reply.status'], v => v === 'received') || has(['reply.received_at', 'outreach.reply_at'], v => !!at(v))
  const paymentFields = ['payment.status', 'payment.paid_at', 'payment.receipt_id', 'extra_data.payment_status']
  const paid = has(['payment.status', 'extra_data.payment_status'], v => member(v, ['paid', 'settled']))
  const paymentState = paid ? 'paid' : has(['payment.status', 'extra_data.payment_status'], v => member(v, ['deposit_paid', 'partially_paid'])) ? 'partial' : has(['payment.status', 'extra_data.payment_status'], v => member(v, ['unpaid', 'pending', 'failed', 'refunded'])) ? String(signals('payment.status', 'extra_data.payment_status')[0].value) : 'unknown'
  const active = !lead.archived && !lead.disqualified
  const duplicateConflict = rows.length > 1 && new Set(rows.map(r => JSON.stringify(r.raw))).size > 1
  const blockedReasons = [held && 'review_held', reviewConflict && 'review_conflict', duplicateConflict && 'duplicate_conflict', lead.duplicateOf && 'unresolved_duplicate', bounced && 'delivery_failed', (has(['outreach.status'], v => member(v, ['parked', 'shelved', 'dead'])) || has(['outreach.blocker', 'extra_data.blocker'], v => !!str(v))) && 'business_hold'].filter((v): v is string => !!v)
  const explicitInput = has(['input_gate.status', 'approval_gate.status'], v => member(v, ['pending', 'needs_input', 'awaiting_approval'])) || has(['extra_data.needs_input', 'needs_input'], v => v === true)
  const approvalGate = (lead.stage === 'awaiting_approval' && reviewState !== 'approved') || has(['approval.status'], v => v === 'pending') && reviewState !== 'approved' || lead.completed?.emailStatus === 'awaiting_signoff' || has(['extra_data.outbound_authorized'], v => v === false)
  const gate = active && (explicitInput || approvalGate) ? explicitInput ? 'input_required' : 'approval_required' : null
  // A later record update/decision is operational change; stage-entry age alone
  // cannot mark recently worked records stale. Do not substitute HTTP poll time.
  const sourceAt = knownAt('updated_at', 'updatedAt', 'extra_data.reviewed_at', 'extraData.reviewed_at', 'approval.decided_at', 'outreach.sent_at', 'outreach.reply_at') ?? at(lead.firstSeenAt ?? lead.createdAt)
  const invalidUpdate = rows.some(r => { const u = r.raw.updated_at ?? r.raw.updatedAt; return u !== undefined && !at(u) })
  const { freshness } = evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: invalidUpdate ? 'invalid' : sourceAt, now, cadenceMs: CADENCE.pipeline.attentionAfterMs })
  const attention: string[] = []
  if (active) {
    if (!buildComplete && freshness === 'stale') attention.push('Unfinished work unchanged for 7+ days')
    if (blockedReasons.length) attention.push('Blocked evidence or business hold')
    if (gate) attention.push(gate === 'input_required' ? 'Input requested' : 'Approval requested')
    if (overdue(lead.extraData?.next_action_due, now)) attention.push('Next action overdue')
    if (sent && !replied && !lead.outreach?.followup_sent_at && !has(['outreach.followup_suppressed'], v => v === true) && !has(['outreach.status'], v => member(v, ['parked', 'shelved', 'dead'])) && overdue(lead.outreach?.followup_due ?? lead.extraData?.followup_due, now)) attention.push('Follow-up overdue')
  }
  return {
    id: lead.id, businessName: lead.businessName, stage: lead.stage, lead: displayLead,
    sourceIndices: evidence.map(e => e.index), duplicateCount: evidence.length - 1,
    archived: lead.archived, disqualified: lead.disqualified, active, sourceAt, freshness,
    blocked: blockedReasons.length > 0, blockedReasons, attention, requiresBoss: gate !== null, gate,
    nextAction: str(lead.extraData?.next_action) ?? (gate ? 'Open review' : !active ? 'Retained history' : blockedReasons.length ? 'Resolve recorded hold' : 'Review pipeline record'),
    // Informational readiness only; this projection never authorizes a send.
    sendReady: active && buildComplete && reviewState === 'approved' && !blockedReasons.length && !gate && !sent && !accepted,
    facts: {
      build: fact(buildComplete ? 'complete' : lead.stage === 'in_development' || lead.development?.status ? 'in_progress' : 'unknown', buildFields, ['development.completed_at', 'completed_at']),
      review: fact(reviewState, reviewFields, ['approval.decided_at', 'approval.decidedAt', 'extra_data.reviewed_at', 'extraData.reviewed_at'], held || reviewConflict, reviewConflict ? 'review_conflict' : held ? 'review_held' : null),
      providerAcceptance: fact(accepted ? 'accepted' : 'unknown', acceptanceFields, ['provider.accepted_at']),
      delivery: fact(delivered && bounced ? 'conflict' : bounced ? 'failed' : delivered ? 'delivered' : 'unknown', deliveryFields, ['delivery.delivered_at', 'outreach.delivered_at'], bounced, bounced ? 'delivery_failed' : null),
      reply: fact(replied ? 'received' : 'unknown', replyFields, ['reply.received_at', 'outreach.reply_at']),
      payment: fact(paymentState, paymentFields, ['payment.paid_at']),
      send: fact(sent ? 'reported_sent' : 'unknown', sendFields, ['outreach.sent_at', 'email_sent_at', 'extra_data.sent_at']),
    },
  }
}

export function projectPipeline(store: PipelineStore, now: string, limitPerStage = 50): PipelineRadar {
  if (!at(now)) throw new RangeError('Invalid evaluation time')
  const records = store.records.map(lead => projectRecord(lead, new Date(now).toISOString()))
  const counts = Object.fromEntries(RADAR_STAGES.map(stage => [stage, 0])) as Record<RadarStage, number>
  const activeCounts = { ...counts }
  for (const record of records) { counts[record.stage]++; if (record.active) activeCounts[record.stage]++ }
  const priority = (a: RadarRecord, b: RadarRecord) => Number(b.requiresBoss) - Number(a.requiresBoss) || Number(b.attention.length > 0) - Number(a.attention.length > 0) || (a.sourceAt ?? '').localeCompare(b.sourceAt ?? '') || a.id.localeCompare(b.id)
  records.sort(priority)
  const displayIds = RADAR_STAGES.flatMap(stage => records.filter(r => r.stage === stage).slice(0, Math.max(0, limitPerStage)).map(r => r.id))
  const evidenceCounts = Object.fromEntries(['build', 'review', 'providerAcceptance', 'delivery', 'reply', 'payment', 'send'].map(key => [key, {}])) as PipelineRadar['evidenceCounts']
  for (const record of records) for (const key of Object.keys(evidenceCounts) as (keyof PipelineRadar['evidenceCounts'])[]) {
    const state = record.facts[key].state
    evidenceCounts[key][state] = (evidenceCounts[key][state] ?? 0) + 1
  }
  const revenue = records.filter(r => r.active && ['awaiting_approval', 'in_development'].includes(r.stage))
  const priced = revenue.filter(r => num(r.lead.extraData?.offer_estimate) !== undefined)
  return {
    rawRecordCount: store.rawRecordCount, recordCount: records.length, invalidRecordCount: store.invalidRecords.length, duplicateRecordCount: store.duplicateRecordCount, invalidRecords: store.invalidRecords,
    counts, activeCounts, activeCount: records.filter(r => r.active).length, archivedCount: records.filter(r => r.archived).length, disqualifiedCount: records.filter(r => r.disqualified).length,
    blockedCount: records.filter(r => r.active && r.blocked).length, attentionCount: records.filter(r => r.attention.length).length, pendingDecisionCount: records.filter(r => r.requiresBoss).length, sendReadyCount: records.filter(r => r.sendReady).length,
    evidenceCounts, attentionIds: records.filter(r => r.attention.length).map(r => r.id), pendingDecisionIds: records.filter(r => r.requiresBoss).map(r => r.id),
    revenue: { activeCount: revenue.length, pricedCount: priced.length, offerEstimate: priced.reduce((sum, r) => sum + (r.lead.extraData!.offer_estimate as number), 0), recordIds: [...revenue, ...records.filter(r => r.active && r.stage === 'completed').sort((a,b) => (b.sourceAt ?? '').localeCompare(a.sourceAt ?? '')).slice(0, 3)].map(r => r.id) },
    records, display: { recordIds: displayIds, limitPerStage, complete: displayIds.length === records.length },
  }
}

export function radarEnvelope(read: PipelineRead, now = new Date().toISOString(), limitPerStage = 50): E<PipelineRadar> {
  const data = read.ok ? projectPipeline(read.store, now, limitPerStage) : null
  const revision = read.ok ? read.store.revision : read.revision
  const source: Source = { id: 'pipeline', revision, sourceAt: read.ok ? read.store.sourceAt : null, observedAt: now, lastSuccessAt: read.ok ? now : null,
    // Successful inventory read is current; individual operational facts above
    // keep their producer dates and never inherit this scan's freshness.
    ...evaluateFreshness({ read: read.ok ? 'success' : read.code === 'missing_store' ? 'missing' : 'error', hasSnapshot: read.ok, evidenceAt: read.ok ? now : null, now, cadenceMs: CADENCE.pipeline.validityMs }),
    freshnessBasis: 'inventory', blocked: !!data?.invalidRecordCount || !!data?.blockedCount,
    reason: read.ok ? data?.invalidRecordCount ? 'invalid_records' : null : read.code }
  const dataRevision = digest(sourceRevisionMaterial([source]))
  const errors = !read.ok ? [{ sourceId: 'pipeline', code: read.code }] : data!.invalidRecordCount ? [{ sourceId: 'pipeline', code: 'invalid_records' }] : []
  return { schemaVersion: SCHEMA_VERSION, contractRevision: CONTRACT_REVISION, snapshotId: digest(JSON.stringify({ dataRevision, now, data, errors })), dataRevision, generatedAt: now, validUntil: new Date(Date.parse(now) + CADENCE.pipeline.validityMs).toISOString(), sources: [source], data, errors }
}
export async function collectPipelineRadar(): Promise<E<PipelineRadar>> { return radarEnvelope(await readPipelineStore()) }

/** Errors use E<T> even when a successful legacy read uses its compatibility DTO. */
export function unavailablePipeline(code: 'access_denied' | 'read_failed', now = new Date().toISOString()): E<PipelineRadar> {
  const envelope = radarEnvelope({ ok: false, code: code === 'access_denied' ? 'missing_store' : code, revision: null }, now)
  return { ...envelope, snapshotId: digest(JSON.stringify([envelope.snapshotId, code])), validUntil: now,
    sources: envelope.sources.map(source => ({ ...source, blocked: code === 'access_denied', reason: code })),
    errors: [{ sourceId: 'pipeline', code }] }
}

/** Compatibility DTOs select supported board stages from this SAME normalized
 * read. Lossless evidence remains available on the owner; no second parser. */
export function legacyPipelineLeads(store: PipelineStore): PipelineLead[] {
  return store.records.filter((lead): lead is NormalizedLead & { stage: PipelineStage } => lead.stage !== 'archived' && lead.stage !== 'disqualified').map(({ evidence, ...lead }) => ({
    ...evidence.find(row => (row.raw.id ?? row.raw.lead_id) === lead.id)?.raw, ...lead,
  }))
}
