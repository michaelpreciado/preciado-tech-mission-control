/** Local read-only adapters. No SSH, cron, task mutation, environment-file reads,
 * message contents or session identifiers. Projection lives in crew.ts. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from '../config'
import { getKanbanSnapshot } from '../hermes-kanban'
import { readHeartbeatObservations } from '../heartbeats'
import { CADENCE, SCHEMA_VERSION, CONTRACT_REVISION, evaluateFreshness, parseInstant, sourceRevisionMaterial, type E, type Source } from './contract'
import { projectCrew, type CrewProjection, type CrewTaskInput, type ProfileObservation } from './crew'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iso = (value: unknown): string | null => {
  const ms = typeof value === 'number' ? (value > 1e12 ? value : value * 1000) : typeof value === 'string' ? parseInstant(value) : NaN
  return Number.isFinite(ms) && ms > 0 && ms <= 8640000000000000 ? new Date(ms).toISOString() : null
}
const failure = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' as const : 'error' as const
function source(id: string, read: 'success' | 'missing' | 'error', value: unknown, now: string, sourceAt: string | null = null): Source {
  return { id, revision: read === 'success' ? digest(value) : null, sourceAt, observedAt: now, lastSuccessAt: read === 'success' ? now : null,
    ...evaluateFreshness({ read, hasSnapshot: read === 'success', evidenceAt: read === 'success' ? now : null, now, cadenceMs: CADENCE.crew.validityMs }), freshnessBasis: 'inventory', blocked: false }
}
function readOnly<T>(file: string, fn: (db: DatabaseSync) => T): T {
  fs.accessSync(file, fs.constants.R_OK)
  const db = new DatabaseSync(file, { readOnly: true })
  try { return fn(db) } finally { db.close() }
}
export function readCrewKanban(file: string): CrewTaskInput[] {
  const snapshot = getKanbanSnapshot(undefined, Infinity, { scope: 'local', localDbFile: file })
  if (!snapshot.available) throw Object.assign(new Error('kanban_unavailable'), { code: snapshot.sources[0].read === 'missing' ? 'ENOENT' : 'EIO' })
  // Select only projection fields; session IDs, bodies and remote tasks stay out.
  return snapshot.tasks.map(({ id, title, status, assignee, currentRunId, startedAt, lastHeartbeatAt }) => ({ id, title, status, assignee, currentRunId, startedAt, lastHeartbeatAt })).sort((a, b) => a.id.localeCompare(b.id))
}
export type CrewReadOptions = { kanbanDb: string; heartbeatsFile: string; gatewayFile: string; profiles?: string[] }
export function crewReadOptions(): CrewReadOptions {
  const config = getConfig()
  return { kanbanDb: config.paths.kanbanDbFile, heartbeatsFile: path.join(process.cwd(), 'data/heartbeats.json'), gatewayFile: config.paths.gatewayStateFile, profiles: config.chat.profiles }
}
export function crewEnvelope(data: CrewProjection | null, sources: Source[], now: string): E<CrewProjection> {
  const dataRevision = digest(sourceRevisionMaterial(sources)), errors = sources.filter(s => s.reason).map(s => ({ sourceId: s.id, code: s.reason! }))
  return { schemaVersion: SCHEMA_VERSION, contractRevision: CONTRACT_REVISION, snapshotId: digest({ dataRevision, data, sources, now }), dataRevision, generatedAt: now, validUntil: new Date(Date.parse(now) + CADENCE.crew.validityMs).toISOString(), sources, data, errors }
}
export function deniedCrewEnvelope(now = new Date().toISOString()): E<CrewProjection> {
  return crewEnvelope(null, [{ ...source('crew', 'missing', null, now), blocked: true, reason: 'access_denied' }], now)
}
export function collectCrew(now = new Date().toISOString(), options = crewReadOptions()): E<CrewProjection> {
  const sources: Source[] = [], profiles: ProfileObservation[] = []
  let tasks: CrewTaskInput[] | null = null
  try { tasks = readCrewKanban(options.kanbanDb); sources.push(source('kanban', 'success', tasks, now)) }
  catch (error) { sources.push(source('kanban', failure(error), null, now)) }
  const heartbeats = readHeartbeatObservations(options.heartbeatsFile)
  const hbSource = source('presence', heartbeats.read, heartbeats.observations, now, heartbeats.observations.map(h => iso(h.receivedAt)).filter((at): at is string => !!at).sort().at(-1) ?? null)
  if (heartbeats.invalidRecords) { hbSource.blocked = true; hbSource.reason = 'invalid_records' }
  sources.push(hbSource)

  // Match only exact local profile names; the configured gateway belongs to its
  // containing profile. A named gateway must never become the default's status.
  const configuredDir = path.dirname(options.gatewayFile)
  let root = configuredDir
  while (root !== path.dirname(root) && !fs.existsSync(path.join(root, 'profiles'))) root = path.dirname(root)
  if (root === path.dirname(root)) root = configuredDir
  const candidates = new Map<string, { dir: string; gateway: string }>()
  if (fs.existsSync(path.join(root, 'state.db')) || fs.existsSync(path.join(root, 'gateway_state.json'))) candidates.set('default', { dir: root, gateway: path.join(root, 'gateway_state.json') })
  const configuredId = path.basename(path.dirname(configuredDir)) === 'profiles' ? path.basename(configuredDir) : 'default'
  candidates.set(configuredId, { dir: configuredDir, gateway: options.gatewayFile })
  try {
    for (const entry of fs.readdirSync(path.join(root, 'profiles'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, 'profiles', entry.name)
      if (fs.existsSync(path.join(dir, 'state.db')) || fs.existsSync(path.join(dir, 'gateway_state.json'))) candidates.set(entry.name, { dir, gateway: path.join(dir, 'gateway_state.json') })
    }
  } catch (error) { if (failure(error) === 'error') sources.push(source('profiles', 'error', null, now)) }
  for (const [id, entry] of [...candidates].sort(([a],[b]) => a.localeCompare(b))) {
    if (options.profiles?.length && !options.profiles.includes(id)) continue
    const profile: ProfileObservation = { id }
    try {
      const raw = JSON.parse(fs.readFileSync(entry.gateway, 'utf8'))
      if (!raw || typeof raw.gateway_state !== 'string') throw Error('invalid_gateway')
      const needsAttention = Object.values(raw.platforms ?? {}).some(p => !!p && typeof p === 'object' && (p as { needs_attention?: unknown }).needs_attention === true)
      const status = raw.gateway_state === 'running' ? needsAttention ? 'degraded' : 'running' : /^(stopped|failed|error|exited)$/.test(raw.gateway_state) ? 'stopped' : 'unknown'
      profile.gateway = { status, sourceAt: iso(raw.updated_at), needsAttention }
      sources.push(source(`gateway:${id}`, 'success', profile.gateway, now, profile.gateway.sourceAt))
    } catch (error) { sources.push(source(`gateway:${id}`, failure(error), null, now)) }
    try {
      const state = readOnly(path.join(entry.dir, 'state.db'), db => {
        const model = db.prepare("SELECT model, started_at FROM sessions WHERE archived = 0 AND model IS NOT NULL AND model != '' ORDER BY started_at DESC LIMIT 1").get()
        const messages = db.prepare('SELECT MAX(timestamp) AS at FROM messages').get()
        return { model: { value: typeof model?.model === 'string' ? model.model : null, sourceAt: iso(model?.started_at) }, lastMessageAt: iso(messages?.at) }
      })
      Object.assign(profile, state)
      sources.push(source(`state:${id}`, 'success', state, now, state.lastMessageAt))
    } catch (error) { sources.push(source(`state:${id}`, failure(error), null, now)) }
    profiles.push(profile)
  }
  return crewEnvelope(projectCrew({ tasks, heartbeats: heartbeats.read === 'success' ? heartbeats.observations : null, profiles }, now), sources, now)
}
