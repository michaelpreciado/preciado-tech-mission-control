import { execFile } from 'node:child_process'
import { promisify, stripVTControlCharacters } from 'node:util'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { HerdrSnapshot, HerdrKind } from './herdr-types'

type Row = Record<string, unknown>
const row = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : []
const str = (v: unknown) => typeof v === 'string' ? v : ''
export const TARGET_RE = /^w[A-Za-z0-9]+:p[A-Za-z0-9]+$/
const exec = promisify(execFile)
export type HerdrRunner = (args: string[], timeout?: number) => Promise<Row>

export class HerdrError extends Error {
  status: number
  target?: string
  constructor(message: string, status = 503, target?: string) {
    super(message)
    this.status = status
    this.target = target
  }
}

export const runHerdr: HerdrRunner = async (args, timeout = 10_000) => {
  try {
    const bin = process.env.HERDR_BIN || path.join(os.homedir(), '.local/bin/herdr')
    const { stdout } = await exec(bin, args, { timeout, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' })
    // Unlike control commands, `agent read --format text` prints terminal text
    // directly (including an empty screen), not the JSON socket envelope.
    if (args[0] === 'agent' && args[1] === 'read') return { text: stdout }
    const response = row(JSON.parse(stdout))
    if (response.error) throw new Error('Herdr rejected the operation')
    if (!response.result || typeof response.result !== 'object') throw new Error('Invalid Herdr response')
    return row(response.result)
  } catch {
    // CLI stderr may contain prompt text, environment details, or terminal contents.
    throw new HerdrError('Herdr did not complete the operation. Check the local server and agent readiness.')
  }
}

export function normalizeSnapshot(snapshot: Row, agentList: Row): HerdrSnapshot {
  const panes = rows(snapshot.panes)
  const agents = rows(agentList.agents)
  const byPane = new Map(panes.map(p => [str(p.pane_id), p]))
  return {
    available: true,
    generatedAt: new Date().toISOString(),
    agents: agents.filter(a => TARGET_RE.test(str(a.pane_id))).map(a => {
      const p = byPane.get(str(a.pane_id)) ?? {}
      return {
        id: str(a.pane_id), name: str(a.name) || str(a.label) || str(a.pane_id),
        kind: str(a.agent) || str(a.display_agent) || 'unknown',
        status: str(a.agent_status) || 'unknown',
        cwd: str(a.foreground_cwd) || str(a.cwd) || str(p.foreground_cwd) || str(p.cwd),
        focused: a.pane_id === snapshot.focused_pane_id,
      }
    }),
    workspaces: rows(snapshot.workspaces).map(w => ({
      id: str(w.workspace_id), name: str(w.label) || str(w.workspace_id),
      cwd: str(panes.find(p => p.workspace_id === w.workspace_id)?.cwd),
    })),
  }
}

export function validateTarget(target: unknown): string {
  if (typeof target !== 'string' || !TARGET_RE.test(target)) throw new HerdrError('Invalid pane id', 400)
  return target
}

function textField(value: unknown, name: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === '')) return ''
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) {
    throw new HerdrError(`Invalid ${name}`, 400)
  }
  return value
}

export type SpawnInput = { kind: HerdrKind; cwd: string; name?: string; model?: string; prompt?: string; direction?: 'right' | 'down' }
export function validateSpawn(input: Row): SpawnInput {
  if (!['codex', 'claude', 'opencode'].includes(str(input.kind))) throw new HerdrError('Unsupported agent kind', 400)
  const cwd = textField(input.cwd, 'working directory', 4096)
  if (!path.isAbsolute(cwd) || /[\x00-\x1f\x7f]/.test(cwd)) throw new HerdrError('Working directory must be an absolute path', 400)
  const name = textField(input.name, 'name', 80, true)
  if (name && !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) throw new HerdrError('Name must start with a letter or number', 400)
  const model = textField(input.model, 'model', 160, true)
  if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new HerdrError('Invalid model identifier', 400)
  if (input.direction !== undefined && !['right', 'down'].includes(str(input.direction))) throw new HerdrError('Invalid split direction', 400)
  return { kind: input.kind as HerdrKind, cwd, name, model, prompt: textField(input.prompt, 'prompt', 32_000, true), direction: input.direction as SpawnInput['direction'] }
}

export function createHerdrBridge(run: HerdrRunner = runHerdr) {
  let cache: { expires: number; value: HerdrSnapshot } | undefined
  let pending: Promise<HerdrSnapshot> | undefined
  let generation = 0
  const tails = new Map<string, { expires: number; pending: Promise<{ text: string; generatedAt: string }> }>()
  const busy = new Set<string>()
  const invalidate = () => { generation++; cache = undefined; for (const [key, value] of tails) if (value.expires !== Infinity) tails.delete(key) }
  const snapshot = async (): Promise<HerdrSnapshot> => {
    if (cache && cache.expires > Date.now()) return cache.value
    if (pending) return pending
    const revision = generation
    pending = (async () => {
      let value: HerdrSnapshot
      try {
        const [s, a] = await Promise.all([run(['api', 'snapshot']), run(['agent', 'list'])])
        if (!s.snapshot || !Array.isArray(a.agents)) throw new Error('Invalid snapshot')
        value = normalizeSnapshot(row(s.snapshot), a)
      } catch {
        value = { available: false, agents: [], workspaces: [], generatedAt: new Date().toISOString(), error: 'Herdr is unavailable. Start the local Herdr server to connect the deck.' }
      }
      if (revision === generation) cache = { expires: Date.now() + 2000, value }
      return value
    })().finally(() => { pending = undefined })
    return pending
  }
  const tail = async (target: string, lines: number) => {
    validateTarget(target)
    if (!Number.isInteger(lines) || lines < 1 || lines > 200) throw new HerdrError('Lines must be between 1 and 200', 400)
    const key = `${target}:${lines}`
    const existing = tails.get(key)
    if (existing && existing.expires > Date.now()) return existing.pending
    if (tails.size >= 64) {
      for (const [k, v] of tails) if (v.expires <= Date.now()) tails.delete(k)
      if (tails.size >= 64) throw new HerdrError('Too many open terminal tails', 429)
    }
    const revision = generation
    const request = run(['agent', 'read', target, '--lines', String(lines), '--format', 'text']).then(result => {
      // Runner normalizes CLI text; accept wrapped socket fixtures as well.
      const output = row(result.output ?? result.read)
      const raw = typeof result.text === 'string' ? result.text : output.text
      if (typeof raw !== 'string') throw new HerdrError('Herdr returned no terminal text')
      const entry = tails.get(key)
      if (entry) entry.expires = revision === generation ? Date.now() + 1500 : 0
      return { text: stripVTControlCharacters(raw).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').slice(-100_000), generatedAt: new Date().toISOString() }
    }).catch(error => { tails.delete(key); throw error })
    tails.set(key, { expires: Infinity, pending: request })
    return request
  }
  const lock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (busy.has(key)) throw new HerdrError('An operation is already running for this agent', 409)
    busy.add(key)
    try { return await fn() } finally { busy.delete(key); invalidate() }
  }
  const spawn = async (input: SpawnInput) => lock('spawn', async () => {
    const checked = validateSpawn(input)
    let cwd: string
    try { cwd = await realpath(checked.cwd); if (!(await stat(cwd)).isDirectory()) throw new Error() }
    catch { throw new HerdrError('Working directory does not exist', 400) }
    const name = checked.name || `mc-${checked.kind}-${randomUUID().slice(0, 8)}`
    const s = row((await run(['api', 'snapshot'])).snapshot)
    // Resolve the exact parent once: never let a focus change redirect a split.
    const parent = str(s.focused_pane_id)
    const created = parent && TARGET_RE.test(parent)
      ? await run(['pane', 'split', parent, '--direction', checked.direction || 'right', '--cwd', cwd, '--no-focus'])
      : await run(['workspace', 'create', '--cwd', cwd, '--label', 'Mission Control', '--no-focus'])
    const target = str(created.pane_id) || str(row(created.pane).pane_id) || str(row(created.root_pane).pane_id)
    if (!TARGET_RE.test(target)) throw new HerdrError('Herdr created a workspace but returned no pane id. Inspect Herdr before retrying.')
    const args = ['agent', 'start', name, '--kind', checked.kind, '--pane', target, '--timeout', '8000']
    if (checked.model) args.push('--', '--model', checked.model)
    try { await run(args, 10_000) }
    catch { throw new HerdrError('Agent startup was not confirmed. Inspect this pane before retrying; it may still be starting.', 502, target) }
    let warning: string | undefined
    if (checked.prompt) {
      try { await run(['agent', 'prompt', target, checked.prompt]) }
      catch { warning = 'Agent started, but opening prompt delivery was not confirmed. Inspect the tail before resending.' }
    }
    return { ok: true as const, target, name, warning }
  })
  const operate = async (input: Row) => {
    if (input.op === 'spawn') return spawn(validateSpawn(input))
    const target = validateTarget(input.target)
    let args: string[]
    switch (input.op) {
      case 'prompt': {
        const text = textField(input.text, 'prompt', 32_000)
        if (input.wait !== undefined && typeof input.wait !== 'boolean') throw new HerdrError('Invalid wait option', 400)
        // Herdr's hand-written parser consumes target/text positionally;
        // it does not implement `--`. execFile preserves text as one argument.
        args = ['agent', 'prompt', target, text]
        if (input.wait) args.push('--wait', '--until', 'idle', '--until', 'done', '--until', 'blocked', '--timeout', '8000')
        break
      }
      case 'send-keys': {
        if (!Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 8 || input.keys.some(k => !['esc', 'up', 'down', 'enter', 'tab', 'ctrl+c'].includes(k))) throw new HerdrError('Unsupported keys', 400)
        args = ['agent', 'send-keys', target, ...input.keys as string[]]
        break
      }
      case 'rename': {
        const name = textField(input.name, 'name', 80)
        if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) throw new HerdrError('Invalid name', 400)
        args = ['agent', 'rename', target, name]
        break
      }
      case 'focus': args = ['agent', 'focus', target]; break
      case 'stop': args = ['agent', 'send-keys', target, 'ctrl+c']; break
      default: throw new HerdrError('Unknown operation', 400)
    }
    return lock(target, async () => { await run(args); return { ok: true as const, target } })
  }
  return { snapshot, tail, spawn, operate, invalidate }
}

export const herdr = createHerdrBridge()
