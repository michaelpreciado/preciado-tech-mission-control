/**
 * Server-only, STRICTLY READ-ONLY probe of the Local AI stack (omarchy-local-ai plugin
 * + the 8932 residency proxy). Allowed: read files, `docker ps`, `nvidia-smi` queries,
 * `ss -ltn`, one GET to the proxy's /status. Nothing here starts, stops or writes.
 *
 * Every source resolves to a ProbeResult. A source that could not be read is
 * `unavailable` and carries the command + reason; it never gets a fabricated value.
 * `empty` means the source answered but held nothing (liveness ≠ readiness).
 * Home resolves via getConfig().homeDir (never process.env.HOME: agents restart the server with a different HOME).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { getConfig } from '../config'
import { GATEWAY_PORT_FIRST, GATEWAY_PORT_LAST } from '../local-ai-constants'

export { GATEWAY_PORT_FIRST, GATEWAY_PORT_LAST }

const execFileAsync = promisify(execFile)

export const PROXY_STATUS_URL = 'http://127.0.0.1:8932/status'
export const LOCAL_AI_LABEL = 'io.omarchy.local-ai=1'

export type ProbeState = 'ok' | 'empty' | 'unavailable'
export type ProbeResult<T> = { state: ProbeState; source: string; reason: string | null; data: T }

export type Recipe = {
  id: string; name: string; family: string; engine: string; format: string
  sizeGb: number | null; cards: number | null; minDriver: string | null; hardware: string
}
export type CatalogShape = 'hardware-keyed-object' | 'top-level-keyed-object' | 'top-level-array' | 'unrecognised'
export type HardwareGroup = { key: string; name: string; backend: string; vramGb: number | null; recipeCount: number; thisMachine: boolean }
export type CatalogData = {
  groups: HardwareGroup[]
  path: string | null; shape: CatalogShape | null; schemaVersion: string | null
  registryCommit: string | null; hardwareGroups: number; arrayGroups: number; recipes: Recipe[]
  alternates: { path: string; recipeCount: number | null }[]
}
export type Engine = { name: string; image: string; status: string; labels: Record<string, string>; role: 'engine' | 'gateway' | 'other' }
export type GpuCard = { index: number; name: string; usedMiB: number; totalMiB: number }
export type GpuApp = { pid: number; process: string; usedMiB: number }
export type GpuData = { cards: GpuCard[]; apps: GpuApp[] }
export type GatewayPort = { port: number; inUse: boolean }
export type ProxyData = { httpStatus: number; body: Record<string, unknown> | null; raw: string } | null

export type LocalAiSnapshot = {
  generatedAt: string
  catalog: ProbeResult<CatalogData>
  engines: ProbeResult<Engine[]>
  gpu: ProbeResult<GpuData>
  ports: ProbeResult<GatewayPort[]>
  proxy: ProbeResult<ProxyData>
}

const numOrNull = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
const str = (v: unknown) => typeof v === 'string' ? v : ''

/* ---------- recipes.json ---------- */

function toRecipe(raw: unknown, hardware: string): Recipe | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  return {
    id: r.id, name: str(r.name) || r.id, family: str(r.family), engine: str(r.engine), format: str(r.format),
    sizeGb: numOrNull(r.sizeGb), cards: numOrNull(r.cards), minDriver: str(r.minDriver) || null, hardware,
  }
}

/**
 * The shipped file is `{schemaVersion, registryCommit, generatedAt, gateway, hardware: {<kind>: {match, recipes[]}}}`.
 * We also accept a top-level object keyed by hardware kind, and any group value that is a bare array.
 */
export function parseRecipes(json: unknown): Omit<CatalogData, 'path' | 'alternates'> {
  const empty = { groups: [] as HardwareGroup[], shape: 'unrecognised' as CatalogShape, schemaVersion: null, registryCommit: null, hardwareGroups: 0, arrayGroups: 0, recipes: [] as Recipe[] }
  if (Array.isArray(json)) {
    return { ...empty, shape: 'top-level-array', recipes: json.map(r => toRecipe(r, '')).filter((r): r is Recipe => !!r) }
  }
  if (!json || typeof json !== 'object') return empty
  const top = json as Record<string, unknown>
  const nested = top.hardware && typeof top.hardware === 'object' && !Array.isArray(top.hardware)
  const groups = (nested ? top.hardware : top) as Record<string, unknown>
  const out: Recipe[] = []
  const meta = new Map<string, { name: string; backend: string; vramGb: number | null }>()
  let arrayGroups = 0
  let hardwareGroups = 0
  for (const [key, value] of Object.entries(groups)) {
    let list: unknown[] | null = null
    if (Array.isArray(value)) { list = value; arrayGroups++ }
    else if (value && typeof value === 'object' && Array.isArray((value as { recipes?: unknown }).recipes)) list = (value as { recipes: unknown[] }).recipes
    if (!list) continue
    hardwareGroups++
    const m = (value && typeof value === 'object' && !Array.isArray(value) ? (value as { match?: Record<string, unknown> }).match : null) ?? {}
    meta.set(key, { name: str(m.name), backend: str(m.backend), vramGb: numOrNull(m.vramGb) })
    for (const raw of list) { const r = toRecipe(raw, key); if (r) out.push(r) }
  }
  return {
    shape: nested ? 'hardware-keyed-object' : out.length ? 'top-level-keyed-object' : 'unrecognised',
    schemaVersion: str(top.schemaVersion) || null,
    registryCommit: str(top.registryCommit) || null,
    hardwareGroups, arrayGroups, recipes: out,
    // recipeCount is counted from the same `out` array the UI lists, so they cannot disagree.
    groups: [...meta].map(([key, m]) => ({ key, ...m, recipeCount: out.filter(r => r.hardware === key).length, thisMachine: false })),
  }
}

async function loadCatalog(home: string): Promise<ProbeResult<CatalogData>> {
  // Same precedence as bin/omarchy-local-ai: a refreshed cache wins only when newer than the bundled file.
  const bundled = path.join(home, '.config/omarchy/plugins/sero.local-ai/recipes.json')
  const cached = path.join(home, '.cache/omarchy/local-ai/v3/recipes.json')
  const stat = async (p: string) => { try { return await fs.stat(p) } catch { return null } }
  const [bs, cs] = await Promise.all([stat(bundled), stat(cached)])
  const cacheWins = !!cs && (!bs || cs.mtimeMs > bs.mtimeMs)
  const primary = cacheWins ? cached : bundled
  const base: CatalogData = { groups: [], path: null, shape: null, schemaVersion: null, registryCommit: null, hardwareGroups: 0, arrayGroups: 0, recipes: [], alternates: [] }
  if (!bs && !cs) return { state: 'unavailable', source: `read ${bundled} | ${cached}`, reason: 'recipes.json not found at either location (plugin not installed?)', data: base }
  let json: unknown
  try { json = JSON.parse(await fs.readFile(primary, 'utf8')) }
  catch (e) { return { state: 'unavailable', source: `read ${primary}`, reason: `could not read or parse: ${(e as Error).message}`, data: { ...base, path: primary } } }
  const parsed = parseRecipes(json)
  const alternates: CatalogData['alternates'] = []
  const other = cacheWins ? bundled : cached
  if (cacheWins ? bs : cs) {
    let n: number | null = null
    try { n = parseRecipes(JSON.parse(await fs.readFile(other, 'utf8'))).recipes.length } catch { /* reported as null */ }
    alternates.push({ path: other, recipeCount: n })
  }
  const data: CatalogData = { ...parsed, path: primary, alternates }
  if (!data.recipes.length) return { state: 'empty', source: `read ${primary}`, reason: `parsed as ${parsed.shape} but contains zero recipes`, data }
  return { state: 'ok', source: `read ${primary}`, reason: null, data }
}

/* ---------- docker ps ---------- */

export function parseDockerPs(stdout: string): Engine[] {
  const rows: Engine[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let j: Record<string, unknown>
    try { j = JSON.parse(line) } catch { continue }
    const labels: Record<string, string> = {}
    for (const pair of str(j.Labels).split(',')) {
      const i = pair.indexOf('=')
      if (i > 0) labels[pair.slice(0, i)] = pair.slice(i + 1)
    }
    const name = str(j.Names)
    rows.push({ name, image: str(j.Image).replace(/@sha256:[0-9a-f]{8,}$/, m => m.slice(0, 15)), status: str(j.Status), labels,
      role: /gateway/.test(name) ? 'gateway' : /engine/.test(name) ? 'engine' : 'other' })
  }
  return rows
}

async function probeEngines(): Promise<ProbeResult<Engine[]>> {
  const source = `docker ps --filter label=${LOCAL_AI_LABEL} --format '{{json .}}'`
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--filter', `label=${LOCAL_AI_LABEL}`, '--format', '{{json .}}'], { timeout: 5000 })
    const data = parseDockerPs(stdout)
    // A successful `docker ps` with zero rows is a real, read answer: nothing is running.
    return { state: data.length ? 'ok' : 'empty', source, reason: data.length ? null : 'docker answered; no containers carry the local-ai label', data }
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    return { state: 'unavailable', source, reason: (err.stderr || err.message).trim().split('\n')[0].slice(0, 200), data: [] }
  }
}

/* ---------- nvidia-smi ---------- */

const mib = (s: string) => { const n = Number.parseInt(s.replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : NaN }

export function parseGpuCards(csv: string): GpuCard[] {
  const out: GpuCard[] = []
  for (const line of csv.split('\n').slice(1)) {
    const f = line.split(',').map(s => s.trim())
    if (f.length < 4) continue
    // name is the only free-text column; index first, memory columns last.
    const index = Number.parseInt(f[0], 10)
    const total = mib(f[f.length - 1]); const used = mib(f[f.length - 2])
    if (!Number.isFinite(index) || Number.isNaN(total) || Number.isNaN(used)) continue
    out.push({ index, name: f.slice(1, -2).join(','), usedMiB: used, totalMiB: total })
  }
  return out
}

export function parseGpuApps(csv: string): GpuApp[] {
  const out: GpuApp[] = []
  for (const line of csv.split('\n').slice(1)) {
    const f = line.split(',').map(s => s.trim())
    if (f.length < 3) continue
    const pid = Number.parseInt(f[0], 10); const used = mib(f[f.length - 1])
    if (!Number.isFinite(pid) || Number.isNaN(used)) continue
    // Keep the executable only: argv can carry tokens/paths that must not reach the UI.
    const process = f.slice(1, -1).join(',').split(/\s--?\w/)[0].trim()
    out.push({ pid, process, usedMiB: used })
  }
  return out
}

async function probeGpu(): Promise<ProbeResult<GpuData>> {
  const cardsCmd = 'nvidia-smi --query-gpu=index,name,memory.used,memory.total --format=csv'
  const appsCmd = 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv'
  const source = `${cardsCmd} ; ${appsCmd}`
  try {
    const [c, a] = await Promise.all([
      execFileAsync('nvidia-smi', ['--query-gpu=index,name,memory.used,memory.total', '--format=csv'], { timeout: 8000 }),
      execFileAsync('nvidia-smi', ['--query-compute-apps=pid,process_name,used_memory', '--format=csv'], { timeout: 8000 }),
    ])
    const cards = parseGpuCards(c.stdout)
    const apps = parseGpuApps(a.stdout)
    if (!cards.length) return { state: 'empty', source, reason: 'nvidia-smi answered but listed no GPUs', data: { cards, apps } }
    return { state: 'ok', source, reason: null, data: { cards, apps } }
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    return { state: 'unavailable', source, reason: (err.stderr || err.message).trim().split('\n')[0].slice(0, 200), data: { cards: [], apps: [] } }
  }
}

/* ---------- ss -ltn ---------- */

export function parseListeningPorts(ss: string): Set<number> {
  const ports = new Set<number>()
  for (const line of ss.split('\n').slice(1)) {
    const local = line.trim().split(/\s+/)[3]
    const m = local?.match(/:(\d+)$/)
    if (m) ports.add(Number(m[1]))
  }
  return ports
}

async function probePorts(): Promise<ProbeResult<GatewayPort[]>> {
  const source = 'ss -ltn'
  try {
    const { stdout } = await execFileAsync('ss', ['-ltn'], { timeout: 4000 })
    const listening = parseListeningPorts(stdout)
    const data: GatewayPort[] = []
    for (let port = GATEWAY_PORT_FIRST; port <= GATEWAY_PORT_LAST; port++) data.push({ port, inUse: listening.has(port) })
    return { state: 'ok', source, reason: null, data }
  } catch (e) {
    return { state: 'unavailable', source, reason: (e as Error).message.split('\n')[0].slice(0, 200), data: [] }
  }
}

/* ---------- 8932 proxy /status ---------- */

export function interpretProxy(httpStatus: number, raw: string): ProbeResult<ProxyData> {
  const source = `GET ${PROXY_STATUS_URL}`
  let body: Record<string, unknown> | null = null
  if (raw.trim()) { try { const j = JSON.parse(raw); if (j && typeof j === 'object' && !Array.isArray(j)) body = j as Record<string, unknown> } catch { /* non-JSON */ } }
  const data = { httpStatus, body, raw: body ? '' : raw.slice(0, 200) }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { state: body ? 'ok' : 'unavailable', source, reason: body ? null : `HTTP ${httpStatus} with no readable JSON body`, data }
  }
  // 200 with nothing in it is liveness without readiness: report EMPTY, not success.
  if (!raw.trim()) return { state: 'empty', source, reason: 'HTTP 200 with an empty body: the service is up but reports no state', data }
  if (!body) return { state: 'unavailable', source, reason: 'HTTP 200 but the body is not a JSON object', data }
  if (!Object.keys(body).length) return { state: 'empty', source, reason: 'HTTP 200 with an empty JSON object', data }
  return { state: 'ok', source, reason: null, data }
}

async function probeProxy(): Promise<ProbeResult<ProxyData>> {
  try {
    const res = await fetch(PROXY_STATUS_URL, { signal: AbortSignal.timeout(2500), cache: 'no-store' })
    return interpretProxy(res.status, await res.text())
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    const why = err.cause?.code === 'ECONNREFUSED' ? 'connection refused: nothing is listening on 8932' : (err.cause?.code || err.message)
    return { state: 'unavailable', source: `GET ${PROXY_STATUS_URL}`, reason: why, data: null }
  }
}

/** A catalog group is "this machine" only if a read GPU matches its marketing name AND its VRAM size. */
export function markThisMachine(groups: HardwareGroup[], cards: GpuCard[]) {
  for (const g of groups) {
    g.thisMachine = g.backend === 'nvidia' && !!g.name && g.vramGb != null && cards.some(c =>
      (c.name === g.name || c.name === `NVIDIA ${g.name}`) && Math.abs(c.totalMiB / 1024 - g.vramGb!) < 1)
  }
}

export async function collectLocalAi(): Promise<LocalAiSnapshot> {
  const home = getConfig().homeDir
  const [catalog, engines, gpu, ports, proxy] = await Promise.all([loadCatalog(home), probeEngines(), probeGpu(), probePorts(), probeProxy()])
  if (gpu.state === 'ok') markThisMachine(catalog.data.groups, gpu.data.cards)
  return { generatedAt: new Date().toISOString(), catalog, engines, gpu, ports, proxy }
}
