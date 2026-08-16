import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/mission-api'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
// Use relative path — @/ alias may not work in API routes
import { deriveMLContentIdeaId, type MLContentIdea } from '../../../lib/types'
import { getConfig } from '../../../lib/config'
import { logger } from '../../../lib/logger'

// Local-only, gitignored sidecar recording which ideas have already been
// dispatched to Hermes — same pattern as data/config.json (lib/config.ts).
// Read-merge-write with no locking is fine here: writes are human-driven
// button clicks (low frequency), and last-writer-wins matches the existing
// config.json risk profile in this codebase.
const DISPATCHED_FILE = join(process.cwd(), 'data', 'ml-content-dispatched.json')

type DispatchedMap = Record<string, string> // idea id -> ISO dispatchedAt

function readDispatched(): DispatchedMap {
  try {
    const parsed = JSON.parse(readFileSync(DISPATCHED_FILE, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function GET(_request: NextRequest) {
  // Ideas dir (week-N.json files) — configurable, defaults to <project>/data/ml-content.
  // Missing/unconfigured dir is a normal first-run state — empty board, not an error.
  const IDEAS_DIR = getConfig().paths.mlContentIdeasDir
  let files: string[] = []
  try {
    files = readdirSync(IDEAS_DIR).filter(f => f.startsWith('week-') && f.endsWith('.json'))
  } catch {
    return NextResponse.json({ generated_at: new Date().toISOString(), ideas: [], configured: false })
  }

  const dispatched = readDispatched()
  const ideas: MLContentIdea[] = []
  for (const file of files) {
    try {
      const content = readFileSync(join(IDEAS_DIR, file), 'utf-8')
      const data = JSON.parse(content)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idea files have loose shape
      data.ideas?.forEach((idea: any) => {
        const id = deriveMLContentIdeaId(idea)
        const dispatchedAt = dispatched[id]
        ideas.push({
          ...idea,
          id,
          updated_at: data.generated_at,
          dispatched: Boolean(dispatchedAt),
          dispatchedAt,
        })
      })
    } catch (error) {
      console.error('ML Content: skipping unreadable file', file, error)
    }
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    ideas,
    configured: true,
  })
}

export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const id = (body as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !id.trim()) {
    return NextResponse.json({ error: 'id (string) is required' }, { status: 400 })
  }

  try {
    const dispatched = readDispatched()
    const dispatchedAt = new Date().toISOString()
    dispatched[id] = dispatchedAt
    mkdirSync(dirname(DISPATCHED_FILE), { recursive: true })
    writeFileSync(DISPATCHED_FILE, JSON.stringify(dispatched, null, 2) + '\n', { mode: 0o600 })
    return NextResponse.json({ ok: true, id, dispatchedAt })
  } catch (error) {
    logger.error('ml-content/dispatch', error)
    return NextResponse.json({ error: 'failed to record dispatch state' }, { status: 500 })
  }
}
