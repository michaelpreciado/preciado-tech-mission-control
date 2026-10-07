/** Sole artifact/acceptance owner. Worker prose and pipeline statuses are never
 * acceptance inputs. Hash receipts are read only; this module cannot create one.
 */
import path from 'node:path'
import { readPipelineStore, type PipelineRead } from './pipeline'
import { scanVaultDocs } from '../vault-docs'
import { ArtifactError, MAX_ARTIFACT_BYTES, listArtifactFiles, readArtifactFile, safeRelative, sha256 } from './artifact-files'
import { deliverablesRegistry, type DeliverablesRegistry, type ArtifactRoot, type TrackerRegistration } from './deliverables-registry'
import { CADENCE, SCHEMA_VERSION, CONTRACT_REVISION, evaluateFreshness, sourceRevisionMaterial, type E, type Source } from './contract'
import type { VaultDoc } from '../vault-links'

export type ReviewState = 'draft' | 'awaiting-verification' | 'not-accepted' | 'approval-held' | 'verified' | 'unknown'
export type Deliverable = {
  id: string; title: string; kind: 'report' | 'vault' | 'gate'; rootId: string; path: string | null
  artifactRevision: string | null; evidenceRevision: string | null; coordinatorRevision: string | null
  reviewState: ReviewState; reviewReason: string; trackerStates: { id: string; status: string; gate: string | null }[]
  gateIds: string[]; evidenceRefs: { ref: string; revision: string | null }[]; sourceIds: string[]
  leadIds: string[]; available: boolean; unavailableReason: string | null; bytes: number | null
  mediaType: string | null; webPath: string; vault: { name: string; path: string; metadata: VaultDoc } | null
}
export type DeliverablesIndex = { items: Deliverable[]; count: number; complete: boolean; nextCursor: null; maxContentBytes: number }
export type DeliverableContent = { id: string; title: string; artifactRevision: string; evidenceRevision: string | null; mediaType: string; text: string }
type Raw = Record<string, unknown>
type Task = { id: string; status: string; gate: string | null; evidence: string[]; title: string }
type LoadedTracker = { registration: TrackerRegistration; root: ArtifactRoot; tasks: Task[]; revision: string | null; reviews: { path: string; revision: string | null; rejected: boolean }[]; receipts: Raw[]; receiptRevision: string | null }
const object = (v: unknown): Raw => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Raw : {}
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
const hash = (v: unknown) => sha256(JSON.stringify(v))
// Retain discovered IDs across rescans so moved inventory rows stay unavailable.
// Bounded per registered root; tracker references also survive process restarts.
const discovered = new Map<string, Set<string>>()
const media = (file: string) => ({ '.txt': 'text/plain', '.md': 'text/markdown', '.html': 'text/html-source', '.htm': 'text/html-source' })[path.extname(file).toLowerCase()] ?? null
export const artifactId = (rootId: string, relative: string) => hash([rootId, relative])
const source = (id: string, revision: string | null, now: string, reason: string | null = null): Source => ({
  id, revision, sourceAt: null, observedAt: now, lastSuccessAt: reason ? null : now, freshnessBasis: 'inventory',
  ...evaluateFreshness({ read: !reason ? 'success' : ['read_failed', 'invalid_json', 'invalid_store'].includes(reason) ? 'error' : 'missing', hasSnapshot: !reason, evidenceAt: reason ? null : now, now, cadenceMs: CADENCE.deliverables.validityMs }),
  blocked: false, reason,
})
function envelope<T>(data: T | null, sources: Source[], now: string): E<T> {
  const dataRevision = sha256(sourceRevisionMaterial(sources))
  return { schemaVersion: SCHEMA_VERSION, contractRevision: CONTRACT_REVISION, snapshotId: hash([dataRevision, now, data]), dataRevision, generatedAt: now,
    validUntil: new Date(Date.parse(now) + CADENCE.deliverables.validityMs).toISOString(), sources, data,
    errors: sources.filter(s => s.reason).map(s => ({ sourceId: s.id, code: s.reason! })) }
}
export function unavailableDeliverables(code: string, now = new Date().toISOString()): E<never> {
  const s = source('deliverables', null, now, code)
  s.blocked = code === 'access_denied'
  return { ...envelope<never>(null, [s], now), validUntil: now }
}

/** References may associate only with already-registered roots; never widen them.
 * Relative report evidence is relative to its registered tracker root.
 */
function locate(registry: DeliverablesRegistry, value: string, context?: ArtifactRoot): { root: ArtifactRoot; relative: string } | null {
  if (/[\\\x00-\x1f\x7f]/.test(value) || value.split('/').some(s => s === '.' || s === '..') || /^[a-z]+:/i.test(value)) return null
  const candidates = path.isAbsolute(value) ? [value] : [context && path.join(context.directory, value), path.join(registry.workspaceDir, value), ...registry.roots.filter(r => r.kind === 'vault').map(r => path.join(r.directory, path.relative(r.vaultPrefix || '', value)))].filter((v): v is string => !!v)
  for (const absolute of candidates) for (const root of registry.roots) {
    const relative = path.relative(root.directory, absolute)
    if (safeRelative(relative)) return { root, relative }
  }
  return null
}

async function loadTrackers(registry: DeliverablesRegistry, sources: Source[], now: string): Promise<LoadedTracker[]> {
  const trackers: LoadedTracker[] = []
  for (const registration of registry.trackers) {
    const root = registry.roots.find(r => r.id === registration.rootId)
    if (!root) continue
    let tasks: Task[] = [], revision: string | null = null
    try {
      const file = await readArtifactFile(root.directory, registration.path, 2 * 1024 * 1024)
      const parsed = JSON.parse(file.bytes.toString('utf8'))
      if (!Array.isArray(parsed.tasks)) throw Error('invalid_tracker')
      tasks = parsed.tasks.map((v: unknown) => { const t = object(v); return { id: String(t.id ?? ''), title: String(t.title ?? ''), status: String(t.status ?? 'unknown'), gate: typeof t.gate === 'string' ? t.gate : null, evidence: strings(t.evidence) } }).filter((t: Task) => t.id)
      revision = file.revision
    } catch { /* Source failure is explicit; artifacts cannot inherit acceptance. */ }
    sources.push(source(`tracker:${root.id}`, revision, now, revision ? null : 'tracker_unavailable'))
    const reviews: LoadedTracker['reviews'] = []
    for (const review of registration.reviews) {
      try {
        const file = await readArtifactFile(root.directory, review.path)
        // Legacy coordinator prose may veto, but can NEVER grant hash acceptance.
        reviews.push({ path: review.path, revision: file.revision, rejected: /^Status:\s*(?:NOT ACCEPTED|REJECTED)\b/im.test(file.bytes.toString('utf8')) })
      } catch { reviews.push({ path: review.path, revision: null, rejected: false }) }
    }
    let receipts: Raw[] = [], receiptRevision: string | null = null
    try {
      const file = await readArtifactFile(root.directory, registration.receiptPath)
      const parsed = JSON.parse(file.bytes.toString('utf8'))
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.decisions)) { receipts = parsed.decisions.map(object); receiptRevision = file.revision }
    } catch { /* Optional authority file. Its absence never grants acceptance. */ }
    trackers.push({ registration, root, tasks, revision, reviews, receipts, receiptRevision })
  }
  return trackers
}

function pipelineReferences(read: PipelineRead): { leadId: string; path: string; folder: boolean }[] {
  if (!read.ok) return []
  return read.store.records.flatMap(lead => lead.evidence.flatMap(({ raw }) => {
    const extra = object(raw.extra_data ?? raw.extraData), completed = object(raw.completed)
    const artifacts = [raw.preview_file, raw.email_draft, extra.file, extra.preview_file, extra.email_draft, completed.email_draft,
      ...[raw.artifacts, extra.artifacts, raw.artifact_refs].flatMap(v => Array.isArray(v) ? v.map(a => typeof a === 'string' ? a : object(a).path) : [])]
    const folder = raw.docs_path ?? extra.docs_path
    return [...artifacts.filter((v): v is string => typeof v === 'string').map(p => ({ leadId: lead.id, path: p, folder: false })),
      ...(typeof folder === 'string' ? [{ leadId: lead.id, path: folder, folder: true }] : [])]
  }))
}

export async function collectDeliverables(options: { registry?: DeliverablesRegistry; pipeline?: PipelineRead; now?: string } = {}): Promise<E<DeliverablesIndex>> {
  const registry = options.registry ?? deliverablesRegistry(), now = options.now ?? new Date().toISOString()
  const sources: Source[] = [], items: Deliverable[] = []
  const pipeline = options.pipeline ?? await readPipelineStore()
  sources.push(source('pipeline', pipeline.ok ? pipeline.store.revision : pipeline.revision, now, pipeline.ok ? null : pipeline.code))
  const trackers = await loadTrackers(registry, sources, now)
  const refs = pipelineReferences(pipeline).flatMap(ref => { const location = locate(registry, ref.path); return location ? [{ ...ref, ...location }] : [] })
  const cached = new Map<string, Promise<Awaited<ReturnType<typeof readArtifactFile>> | null>>()
  const evidenceRead = (root: ArtifactRoot, relative: string) => {
    const key = artifactId(root.id, relative)
    if (!cached.has(key)) cached.set(key, readArtifactFile(root.directory, relative, 2 * 1024 * 1024).catch(() => null))
    return cached.get(key)!
  }
  let complete = true
  for (const root of registry.roots) {
    let files: string[] = [], rootReason: string | null = null
    const vaultScan = root.kind === 'vault' ? await scanVaultDocs({ root: root.directory, vaultPrefix: root.vaultPrefix, fresh: true, inventory: true }) : null
    if (vaultScan) { files = vaultScan.paths; complete &&= vaultScan.complete; rootReason = vaultScan.reason }
    else {
      try { const scan = await listArtifactFiles(root.directory); files = scan.paths; complete &&= scan.complete; if (!scan.complete) rootReason = 'inventory_truncated' }
      catch { complete = false; rootReason = 'root_unavailable' }
    }
    const vaultDocs = new Map(vaultScan?.docs.map(doc => [doc.path, doc]))
    const tracker = trackers.find(t => t.root.id === root.id)
    for (const task of tracker?.tasks ?? []) for (const ref of task.evidence) {
      const located = locate(registry, ref, root)
      if (located?.root.id === root.id) files.push(located.relative)
    }
    for (const ref of refs.filter(r => r.root.id === root.id && !r.folder)) files.push(ref.relative)
    const discoveryKey = `${root.id}:${root.directory}`
    const previous = discovered.get(discoveryKey) ?? new Set<string>()
    for (const file of files) if (previous.size < 1000) previous.add(file)
    discovered.set(discoveryKey, previous)
    files.push(...previous)
    // Authority receipts are not artifacts and must never be hashed into themselves.
    files = [...new Set(files)].filter(p => p !== tracker?.registration.receiptPath).sort()
    for (const relative of files.slice(0, 1000)) {
      const id = artifactId(root.id, relative), mediaType = media(relative)
      let file: Awaited<ReturnType<typeof readArtifactFile>> | null = null, unavailableReason: string | null = null
      try { file = await readArtifactFile(root.directory, relative) } catch (err) { unavailableReason = err instanceof ArtifactError ? err.message : 'unavailable' }
      if (file && !mediaType) unavailableReason = 'unsupported_format'
      let text = ''
      if (file && mediaType) {
        try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes); if (text.includes('\0')) throw Error() }
        catch { unavailableReason = 'unsupported_format' }
      }
      const vaultPath = `${root.vaultPrefix}/${relative}`
      // Metadata must describe exactly the bytes being shown. A concurrent edit
      // invalidates this row; a subsequent scan can safely expose the new title.
      const vaultDoc = file && !unavailableReason ? vaultDocs.get(vaultPath) ?? null : null
      if (vaultDoc && vaultScan?.revisions[vaultPath] !== file?.revision) unavailableReason = 'revision_mismatch'
      const scopes = tracker?.registration.scopes.filter(s => relative.startsWith(s.prefix)) ?? []
      const tasks = tracker?.tasks.filter(t => scopes.some(s => s.taskIds.includes(t.id)) || t.evidence.some(ref => { const found = locate(registry, ref, root); return found?.root.id === root.id && found.relative === relative })) ?? []
      const gateIds = [...new Set([...scopes.flatMap(s => s.gateIds), ...tasks.filter(t => t.status === 'approval-held').map(t => t.id)])]
      const gates = tracker?.tasks.filter(t => gateIds.includes(t.id)) ?? []
      const reviewRegs = tracker?.registration.reviews.filter(r => relative.startsWith(r.prefix) || tasks.some(t => r.taskIds.includes(t.id))) ?? []
      const reviews = tracker?.reviews.filter(r => reviewRegs.some(reg => reg.path === r.path)) ?? []
      const evidenceRefs: Deliverable['evidenceRefs'] = []
      for (const ref of [...new Set(tasks.flatMap(t => t.evidence))].sort()) {
        const found = locate(registry, ref, root)
        if (!found || found.relative === tracker?.registration.receiptPath || found.root.id === root.id && found.relative === relative) continue
        evidenceRefs.push({ ref: `${found.root.id}:${found.relative}`, revision: (await evidenceRead(found.root, found.relative))?.revision ?? null })
      }
      for (const review of reviews) if (!evidenceRefs.some(r => r.ref === `${root.id}:${review.path}`)) evidenceRefs.push({ ref: `${root.id}:${review.path}`, revision: review.revision })
      evidenceRefs.sort((a, b) => a.ref.localeCompare(b.ref))
      const evidenceRevision = tracker?.revision ? hash({ trackerRevision: tracker.revision, evidenceRefs }) : null
      const receipts = tracker?.receipts.filter(r => r.path === relative) ?? []
      const rejected = reviews.some(r => r.rejected) || receipts.some(r => r.state === 'not-accepted') || tasks.some(t => ['not-accepted', 'rejected', 'failed'].includes(t.status))
      const held = [...tasks, ...gates].some(t => t.status === 'approval-held')
      const accepted = !!file && !!tasks.length && tasks.every(t => t.status === 'verified') && evidenceRefs.every(r => r.revision) && receipts.length === 1 && receipts[0].state === 'accepted' && receipts[0].artifactRevision === file.revision && receipts[0].evidenceRevision === evidenceRevision
      let reviewState: ReviewState = 'unknown', reviewReason = 'no_acceptance_evidence'
      if (rejected) { reviewState = 'not-accepted'; reviewReason = 'coordinator_or_tracker_rejection' }
      else if (held) { reviewState = 'approval-held'; reviewReason = 'tracker_approval_hold' }
      else if (!file) { reviewState = 'unknown'; reviewReason = 'artifact_unavailable' }
      else if (accepted) { reviewState = 'verified'; reviewReason = 'coordinator_hash_binding_matches' }
      else if (tasks.some(t => ['verified', 'awaiting-verification', 'partial', 'completed'].includes(t.status)) || receipts.length) { reviewState = 'awaiting-verification'; reviewReason = receipts.some(r => r.state === 'accepted') ? 'verification_revision_mismatch' : 'hash_bound_coordinator_acceptance_required' }
      else if (tasks.some(t => ['draft', 'queued', 'running', 'in-progress'].includes(t.status))) { reviewState = 'draft'; reviewReason = 'tracker_draft' }
      items.push({ id, title: !unavailableReason && vaultDoc ? vaultDoc.title : relative, kind: root.kind, rootId: root.id, path: relative, artifactRevision: file?.revision ?? null,
        evidenceRevision, coordinatorRevision: tracker?.receiptRevision ?? null, reviewState, reviewReason,
        trackerStates: [...new Map([...tasks, ...gates].map(t => [t.id, { id: t.id, status: t.status, gate: t.gate }])).values()], gateIds, evidenceRefs,
        sourceIds: [root.id, ...(tracker ? [`tracker:${root.id}`] : []), 'pipeline'],
        leadIds: [...new Set(refs.filter(r => r.root.id === root.id && (r.relative === relative || r.folder && relative.startsWith(r.relative + '/'))).map(r => r.leadId))],
        available: !!file && !unavailableReason, unavailableReason, bytes: file?.bytes.length ?? null, mediaType, webPath: `/deliverables?id=${id}`,
        vault: vaultDoc && !unavailableReason ? { name: root.vaultName!, path: vaultDoc.path, metadata: vaultDoc } : null })
    }
    if (files.length > 1000) { complete = false; rootReason = 'inventory_truncated' }
    // Tracker gates with no artifact must remain visible (e.g. publication held).
    for (const task of tracker?.tasks.filter(t => !t.evidence.length) ?? []) {
      const id = artifactId(root.id, `gate:${task.id}`)
      items.push({ id, title: task.title, kind: 'gate', rootId: root.id, path: null, artifactRevision: null, evidenceRevision: tracker!.revision,
        coordinatorRevision: null, reviewState: task.status === 'approval-held' ? 'approval-held' : task.status === 'queued' ? 'draft' : 'unknown', reviewReason: 'tracker_gate_only',
        trackerStates: [{ id: task.id, status: task.status, gate: task.gate }], gateIds: [task.id], evidenceRefs: [], sourceIds: [`tracker:${root.id}`], leadIds: [],
        available: false, unavailableReason: 'no_artifact', bytes: null, mediaType: null, webPath: `/deliverables?id=${id}`, vault: null })
    }
    sources.push(source(root.id, hash(items.filter(i => i.rootId === root.id)), now, rootReason))
  }
  return envelope({ items, count: items.length, complete, nextCursor: null, maxContentBytes: MAX_ARTIFACT_BYTES }, sources, now)
}

/** Rebuild the index for every detail request: moves and evidence edits are observed
 * immediately, independently of client polling. Re-read pinned bytes after lookup.
 */
export async function readDeliverable(id: string, revision: string | null, evidenceRevision: string | null, options: Parameters<typeof collectDeliverables>[0] = {}) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ArtifactError('unavailable')
  const registry = options.registry ?? deliverablesRegistry()
  const index = await collectDeliverables({ ...options, registry })
  const item = index.data!.items.find(i => i.id === id)
  if (!item?.path) throw new ArtifactError('unavailable')
  if (item.unavailableReason === 'revision_mismatch') throw new ArtifactError('revision_mismatch', 409)
  const root = registry.roots.find(r => r.id === item.rootId)!
  const file = await readArtifactFile(root.directory, item.path)
  if (!item.mediaType || item.unavailableReason === 'unsupported_format') throw new ArtifactError('unsupported_format', 415)
  if (!revision || revision !== file.revision || file.revision !== item.artifactRevision || evidenceRevision !== item.evidenceRevision) throw new ArtifactError('revision_mismatch', 409)
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes)
  return envelope<DeliverableContent>({ id, title: item.title, artifactRevision: file.revision, evidenceRevision: item.evidenceRevision, mediaType: item.mediaType, text }, index.sources, index.generatedAt)
}
