import fs from 'node:fs/promises'
import path from 'node:path'
import type { Idea, IntegrationState, Mission } from '../types'
import { getConfig, joinIf } from '../config'
import { ROOTS, exists, readText, readJson, rel } from './shared'

export async function integrations(): Promise<IntegrationState[]> {
  const checks: IntegrationState[] = []
  checks.push({ name: 'OpenClaw workspace', status: await exists(ROOTS.workspace) ? 'connected' : 'missing', detail: rel(ROOTS.workspace) })
  checks.push({ name: 'Obsidian vault', status: await exists(ROOTS.vault) ? 'connected' : 'missing', detail: rel(ROOTS.vault) })
  checks.push({ name: 'Hermes cron scheduler', status: await exists(ROOTS.cronJobs) ? 'connected' : 'missing', detail: rel(ROOTS.cronJobs) })
  checks.push({ name: 'Hermes kanban DB', status: await exists(ROOTS.kanbanDb) ? 'connected' : 'missing', detail: rel(ROOTS.kanbanDb) })
  checks.push({ name: 'GitHub CLI', status: await exists(path.join(getConfig().homeDir, '.config/gh/hosts.yml')) ? 'connected' : 'partial', detail: 'gh used server-side for repo snapshots' })
  const gcalCreds = getConfig().paths.googleCalendarCredsFile
  const gcalExists = gcalCreds ? await exists(gcalCreds) : false
  checks.push({ name: 'Google Calendar', status: gcalExists ? 'connected' : 'missing', detail: gcalExists ? 'Service account configured' : 'No credentials found' })
  // Stripe — check for live/test key presence in workspace .env
  const envText = ROOTS.fridayWorkspace ? await readText(path.join(ROOTS.fridayWorkspace, '.env')) : ''
  const hasStripe = /stripe/i.test(envText)
  checks.push({ name: 'Stripe', status: hasStripe ? 'connected' : 'missing', detail: hasStripe ? 'Ticker Signals Pro — live keys present' : 'No Stripe keys in .env' })
  // Resend — check for Resend API key presence
  const hasResend = /resend/i.test(envText)
  checks.push({ name: 'Resend', status: hasResend ? 'connected' : 'missing', detail: hasResend ? 'Email API — signals delivery configured' : 'No Resend keys in .env' })
  return checks
}

export type IdeasResult = { ideas: Idea[]; status: { path: string; exists: boolean } }

export async function collectIdeas(): Promise<IdeasResult> {
  const ideasPath = path.join(ROOTS.workspace, 'ideas.json')
  const fileExists = await exists(ideasPath)
  const raw = fileExists ? await readJson<Idea[]>(ideasPath) : null
  const ideas = Array.isArray(raw) ? raw : []
  return { ideas: ideas.slice(0, 100), status: { path: rel(ideasPath), exists: fileExists } }
}

export type MissionsResult = {
  missions: Mission[]
  status: { path: string | null; updatedAt: string | null; stale: boolean }
}

const MISSIONS_STALE_MS = 7 * 24 * 60 * 60 * 1000

export async function collectMissions(): Promise<MissionsResult> {
  const candidates = [
    path.join(process.cwd(), 'missions.json'),
    joinIf(ROOTS.fridayWorkspace, 'missions.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    const raw = await readJson<Mission[] | { missions: Mission[] }>(p)
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray((raw as { missions: Mission[] }).missions) ? (raw as { missions: Mission[] }).missions : null)
    if (arr && arr.length > 0) {
      const stat = await fs.stat(p).catch(() => null)
      const updatedAt = stat?.mtime.toISOString() ?? null
      const missions = arr.map((m, i) => ({
        id: m.id || `mission-${i}`,
        title: m.title || 'Untitled mission',
        description: m.description,
        assignedTo: (m as Mission & { owner?: string }).owner || m.assignedTo,
        priority: m.priority || 'medium',
        status: m.status || 'pending',
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        labels: (m as Mission & { labels?: string[] }).labels,
      })).slice(0, 100)
      return { missions, status: { path: rel(p), updatedAt, stale: !updatedAt || Date.now() - Date.parse(updatedAt) > MISSIONS_STALE_MS } }
    }
  }
  return { missions: [], status: { path: null, updatedAt: null, stale: true } }
}
