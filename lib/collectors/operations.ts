import fs from 'node:fs/promises'
import path from 'node:path'
import type { ActivityItem, OperationsDashboard } from '../types'
import { ROOTS, CREW, walk, rel, hashId, ownerFor } from './shared'

function fileKind(file: string): ActivityItem['kind'] {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.md') return 'markdown'
  if (['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.mjs'].includes(ext)) return ext === '.json' ? 'config' : 'code'
  if (['.jsonl', '.csv', '.sqlite', '.db'].includes(ext)) return 'data'
  return 'other'
}

// NB: roots may be '' (unconfigured) and ''.startsWith is always true — guard each.
function under(file: string, root: string): boolean {
  return Boolean(root) && file.startsWith(root)
}

function areaFor(file: string): ActivityItem['area'] {
  if (under(file, ROOTS.inbox)) return 'inbox'
  if (under(file, ROOTS.repo)) return 'repo'
  if (under(file, ROOTS.vault)) return 'vault'
  if (under(file, ROOTS.workspace) || under(file, ROOTS.fridayWorkspace)) return 'workspace'
  if (under(file, ROOTS.usageLogs)) return 'logs'
  return 'workspace'
}

async function activityItem(file: string, event: ActivityItem['event']): Promise<ActivityItem | null> {
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) return null
  const title = path.basename(file).replace(/\.[^.]+$/, '')
  const owner = ownerFor(`${title} ${file}`)
  return {
    id: `act-${hashId(`${file}:${stat.mtimeMs}:${event}`)}`,
    path: rel(file),
    area: areaFor(file),
    kind: fileKind(file),
    event,
    title,
    updatedAt: stat.mtime.toISOString(),
    ageMinutes: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 60000)),
    owner,
    ownerName: CREW[owner].name,
  }
}

/** Run up to `limit` promises at a time from the array of thunks. */
async function throttled<T>(thunks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let i = 0
  async function next(): Promise<void> {
    while (i < thunks.length) {
      const idx = i++
      results[idx] = await thunks[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, () => next()))
  return results
}

export async function collectOperations(): Promise<OperationsDashboard> {
  const scanRoots = [ROOTS.repo, ROOTS.workspace, ROOTS.fridayWorkspace, ROOTS.fridayVault, ROOTS.usageLogs].filter(Boolean)
  const files = (await Promise.all(scanRoots.map(r => walk(r, { extensions: ['.md', '.ts', '.tsx', '.js', '.json', '.jsonl', '.css'], max: 500, depth: 6 })))).flat()
  const items = (await throttled(files.map(f => () => activityItem(f, under(f, ROOTS.usageLogs) ? 'log-update' : 'recent-change')), 50)).filter(Boolean) as ActivityItem[]
  const recentFiles = items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 40)
  const inboxFiles = ROOTS.inbox ? await walk(ROOTS.inbox, { extensions: ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.json'], max: 80, depth: 4 }) : []
  const inbox = ((await Promise.all(inboxFiles.map(f => activityItem(f, 'inbox-item')))).filter(Boolean) as ActivityItem[]).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 20)
  const hour = recentFiles.filter(i => i.ageMinutes <= 60).length
  const day = recentFiles.filter(i => i.ageMinutes <= 1440).length
  return {
    source: `${rel(ROOTS.repo)} + ${rel(ROOTS.workspace)} + ${rel(ROOTS.fridayVault)} polled from filesystem mtimes`,
    recentFiles,
    inbox,
    hotspots: [
      { label: 'changed <1h', count: hour, tone: hour ? 'green' : 'slate' },
      { label: 'changed <24h', count: day, tone: day ? 'blue' : 'slate' },
      { label: 'inbox items', count: inbox.length, tone: inbox.length ? 'amber' : 'green' },
      { label: 'repo writes', count: recentFiles.filter(i => i.area === 'repo').length, tone: 'blue' },
      { label: 'vault writes', count: recentFiles.filter(i => i.area === 'vault').length, tone: 'blue' },
    ],
  }
}
