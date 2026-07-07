import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { HOME } from '@/lib/home'
import { logger } from '@/lib/logger'

const SECRET = process.env.AGENT_SECRET
const DB_PATH = path.join(HOME, 'Documents/mission-control', 'data', 'agents.json')

const CREW = [
  { id: 'friday', name: 'F.R.I.D.A.Y.', role: 'Coordinator', station: 'Command HQ', room: 'COMMAND HQ', accent: '#ff10f0', model: 'gemma4:26b / router' },
  { id: 'echo', name: 'Echo', role: 'Memory Agent', station: 'Archive', room: 'MEMORY ARCHIVE', accent: '#22d3ee', model: 'memory tools' },
  { id: 'sage', name: 'Sage', role: 'Study Agent', station: 'Research Lab', room: 'RESEARCH LAB', accent: '#7dd3fc', model: 'Gemma / research' },
  { id: 'forge', name: 'Forge', role: 'Coding Agent', station: 'Workshop', room: 'WORKSHOP', accent: '#60a5fa', model: 'Codex / Claude' },
  { id: 'ticker', name: 'Ticker', role: 'Stock Market Agent', station: 'Trading Desk', room: 'MARKET DESK', accent: '#38bdf8', model: 'market monitor' },
  { id: 'scout', name: 'Scout', role: 'Outreach Agent', station: 'Outpost', room: 'OUTPOST', accent: '#a78bfa', model: 'search / draft' },
  { id: 'crypto', name: 'Crypto', role: 'Trading Agent', station: 'Trading Floor', room: 'CRYPTO TRADING', accent: '#00d4ff', model: 'nemotron-3-super-120b / agentkit' },
]

// Validate agent IDs: alphanumeric + hyphens only, max 64 chars
const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/
const VALID_STATUSES = ['active', 'working', 'idle', 'standby', 'sleeping', 'on-demand', 'attention', 'error'] as const
const MAX_FIELD_LEN = 500

async function ensureDb() {
  const dir = path.dirname(DB_PATH)
  await fs.mkdir(dir, { recursive: true })
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    const initial = { agents: CREW.map(a => ({ ...a, status: 'idle', signal: null, currentTask: null, lastRun: null })) }
    await fs.writeFile(DB_PATH, JSON.stringify(initial, null, 2))
    return initial
  }
}

async function saveDb(data: unknown) {
  const dir = path.dirname(DB_PATH)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2))
}

function isAuthorized(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  if (!SECRET) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${SECRET}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const db = await ensureDb()
    return NextResponse.json({ agents: db.agents })
  } catch (error) {
    logger.error('agents/state', error)
    return NextResponse.json({ error: 'database error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, status, currentTask, signal } = body

    if (!id || typeof id !== 'string' || !VALID_ID_RE.test(id)) {
      return NextResponse.json({ error: 'missing or invalid id (alphanumeric, hyphens, max 64 chars)' }, { status: 400 })
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `invalid status, must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    // Truncate string fields to prevent abuse
    const safeTask = typeof currentTask === 'string' ? currentTask.slice(0, MAX_FIELD_LEN) : currentTask
    const safeSignal = typeof signal === 'string' ? signal.slice(0, MAX_FIELD_LEN) : signal

    const db = await ensureDb()
    const agentIndex = db.agents.findIndex((a: { id: string }) => a.id === id)

    const update = {
      ...(status && { status }),
      ...(safeTask !== undefined && { currentTask: safeTask }),
      ...(safeSignal !== undefined && { signal: safeSignal }),
      ...((status === 'active' || status === 'working') && { lastRun: new Date().toISOString() }),
    }

    if (agentIndex >= 0) {
      db.agents[agentIndex] = { ...db.agents[agentIndex], ...update }
    } else {
      db.agents.push({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        role: 'Agent',
        station: 'Unknown',
        room: 'UNKNOWN',
        accent: '#ff10f0',
        model: null,
        ...update,
      })
    }

    await saveDb(db)
    return NextResponse.json({ success: true, agent: db.agents.find((a: { id: string }) => a.id === id) })
  } catch (error) {
    logger.error('agents/state', error)
    return NextResponse.json({ error: 'database error' }, { status: 500 })
  }
}
