import { NextRequest, NextResponse } from 'next/server'
import { recordHeartbeat, getHeartbeats } from '@/lib/heartbeats'

const SECRET = process.env.INTERNAL_API_SECRET

function isAuthorized(req: NextRequest): boolean {
  // Localhost bypass
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  // Bearer token check
  if (!SECRET) return true // No secret configured = open
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${SECRET}`
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, status, currentTask, idea, ideaTitle } = body

    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: 'missing or invalid id (alphanumeric, hyphens, max 64 chars)' }, { status: 400 })
    }

    const validStatuses = ['working', 'idle', 'error'] as const
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'invalid status, must be: working | idle | error' }, { status: 400 })
    }

    // Input length limits to prevent abuse
    const MAX_TASK_LEN = 500
    const MAX_IDEA_LEN = 200
    const trimmedTask = typeof currentTask === 'string' ? currentTask.slice(0, MAX_TASK_LEN) : undefined
    const trimmedIdea = typeof idea === 'string' ? idea.slice(0, MAX_IDEA_LEN) : undefined
    const trimmedIdeaTitle = typeof ideaTitle === 'string' ? ideaTitle.slice(0, MAX_IDEA_LEN) : undefined

    const ideaArg = trimmedIdea ? { title: trimmedIdea } : trimmedIdeaTitle ? { title: trimmedIdeaTitle } : undefined
    recordHeartbeat(id, status, trimmedTask, ideaArg)
    return NextResponse.json({ ok: true, id, receivedAt: Date.now() })
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ heartbeats: getHeartbeats() }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
