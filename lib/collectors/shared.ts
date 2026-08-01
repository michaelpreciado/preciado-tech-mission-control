import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import type { CrewId, CrewMember } from '../types'
import * as CHART from '../chart-colors'
import { getConfig } from '../config'

export const ROOTS = {
  get repo() { return getConfig().paths.repoDir },
  get openclaw() { return path.dirname(getConfig().paths.agentsDir) },
  get workspace() { return getConfig().paths.workspaceDir },
  get fridayWorkspace() { return getConfig().paths.projectWorkspaceDir },
  get vault() { return getConfig().paths.vaultDir },
  get fridayVault() { return getConfig().paths.projectVaultDir },
  get cronJobs() { return getConfig().paths.cronJobsFile },
  get kanbanDb() { return getConfig().paths.kanbanDbFile },
  get openclawConfig() { return getConfig().paths.openclawConfigFile },
  get usageLogs() { return getConfig().paths.usageLogsDir },
  get agentSessions() { return getConfig().paths.agentsDir },
  get inbox() { return getConfig().paths.inboxDir },
}

export const CREW: Record<CrewId, Omit<CrewMember, 'status' | 'signal' | 'lastRun' | 'nextRun'>> = {
  friday: {
    id: 'friday', name: 'F.R.I.D.A.Y.', role: 'Coordinator', station: 'Command HQ', room: 'COMMAND HQ', accent: CHART.CATEGORICAL[0], model: 'gemma4:26b / router',
  },
  echo: {
    id: 'echo', name: 'Echo', role: 'Memory Agent', station: 'Archive', room: 'MEMORY ARCHIVE', accent: CHART.CATEGORICAL[4], model: 'memory tools',
  },
  sage: {
    id: 'sage', name: 'Sage', role: 'Study Agent', station: 'Research Lab', room: 'RESEARCH LAB', accent: CHART.CATEGORICAL[6], model: 'Gemma / research',
  },
  forge: {
    id: 'forge', name: 'Forge', role: 'Coding Agent', station: 'Workshop', room: 'WORKSHOP', accent: CHART.CATEGORICAL[3], model: 'Codex / Claude',
  },
  ticker: {
    id: 'ticker', name: 'Ticker', role: 'Stock Market Agent', station: 'Trading Desk', room: 'MARKET DESK', accent: CHART.CATEGORICAL[2], model: 'market monitor',
  },
  scout: {
    id: 'scout', name: 'Scout', role: 'Outreach Agent', station: 'Outpost', room: 'OUTPOST', accent: CHART.CATEGORICAL[1], model: 'search / draft',
  },
  crypto: {
    id: 'crypto', name: 'Crypto', role: 'Trading Agent', station: 'Trading Floor', room: 'CRYPTO TRADING', accent: CHART.CATEGORICAL[5], model: 'nemotron-3-super-120b / agentkit',
  },
}

export async function exists(p: string) {
  try { await fs.access(p); return true } catch { return false }
}

export async function readText(p: string) {
  try { return await fs.readFile(p, 'utf8') } catch { return '' }
}

export async function readJson<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T } catch { return null }
}

export async function walk(dir: string, opts: { extensions?: string[]; max?: number; depth?: number } = {}) {
  const out: string[] = []
  const max = opts.max ?? 800
  const depth = opts.depth ?? 5
  async function visit(current: string, level: number) {
    if (out.length >= max || level > depth) return
    let entries: Dirent[] = []
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length >= max) break
      if (entry.name.startsWith('.') && !entry.name.includes('openclaw')) continue
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(full, level + 1)
      else if (!opts.extensions || opts.extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) out.push(full)
    }
  }
  await visit(dir, 0)
  return out
}

export function rel(p: string) {
  if (!p) return '(not configured)'
  return p.replace(getConfig().homeDir, '~')
}

export function hashId(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  return Math.abs(h).toString(36)
}

export function ownerFor(text: string): CrewId {
  const s = text.toLowerCase()
  if (/stock|ticker|market|nvda|ionq|qubt|asti|serv|portfolio/.test(s)) return 'ticker'
  if (/study|course|university|citation|research|school|cta|assignment/.test(s)) return 'sage'
  if (/code|github|repo|dashboard|next|react|firmware|robot|bug|build|test|openclaw|ollama/.test(s)) return 'forge'
  if (/memory|vault|obsidian|journal|daily|archive|recall/.test(s)) return 'echo'
  return 'friday'
}
