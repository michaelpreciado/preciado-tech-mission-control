import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getConfig } from '@/lib/config'
const ACTIVE_WINDOW_MS = 90 * 1000  // active if session updated < 90s ago
const RECENT_WINDOW_MS = 5 * 60 * 1000 // recently active if < 5 min ago

// Map OpenClaw agent IDs → crew member IDs
const AGENT_TO_CREW: Record<string, string> = {
  main: 'friday',
  memory: 'echo',
  stocks: 'ticker',
  code: 'forge',
  study: 'scout',
  crypto: 'crypto',
}

interface SessionEntry {
  label: string
  sessionId: string
  updatedAt: number
  systemSent: boolean
  sessionFile: string
}

interface RealtimeAgent {
  crewId: string
  active: boolean      // session updated < 90s ago (currently running)
  recent: boolean      // session updated < 5 min ago (busy recently)
  lastSessionAt: number // timestamp of most recent session update
  label: string        // human-readable label of the active session
}

function detectActivity(sessions: Record<string, SessionEntry>): { active: boolean; recent: boolean; lastSessionAt: number; label: string } {
  const now = Date.now()
  let lastSessionAt = 0
  let label = ''
  let active = false
  let recent = false

  for (const [key, entry] of Object.entries(sessions)) {
    const age = now - entry.updatedAt
    if (entry.updatedAt > lastSessionAt) {
      lastSessionAt = entry.updatedAt
      label = entry.label || key
    }
    if (age < ACTIVE_WINDOW_MS) active = true
    if (age < RECENT_WINDOW_MS) recent = true
  }

  return { active, recent, lastSessionAt, label }
}

export async function GET() {
  try {
    const AGENT_BASE = getConfig().paths.agentsDir
    const agents = ['main', 'memory', 'stocks', 'code', 'study', 'crypto']
    const result: Record<string, RealtimeAgent> = {}

    await Promise.all(agents.map(async (agentId) => {
      const sessionsPath = join(AGENT_BASE, agentId, 'sessions', 'sessions.json')
      try {
        const raw = await readFile(sessionsPath, 'utf8')
        const sessions = JSON.parse(raw) as Record<string, SessionEntry>
        const activity = detectActivity(sessions)
        const crewId = AGENT_TO_CREW[agentId] || agentId

        result[crewId] = {
          crewId,
          ...activity,
        }
      } catch {
        // No sessions file for this agent yet — return zeros, not an error
        const crewId = AGENT_TO_CREW[agentId] || agentId
        result[crewId] = { crewId, active: false, recent: false, lastSessionAt: 0, label: '' }
      }
    }))

    return NextResponse.json({ timestamp: Date.now(), agents: result })
  } catch {
    return NextResponse.json({ error: 'Agent session data temporarily unavailable. Please try again in a moment.' }, { status: 503 })
  }
}
