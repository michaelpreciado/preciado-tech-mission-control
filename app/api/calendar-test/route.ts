import { NextRequest, NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/mission-api'

export async function POST(req: NextRequest) {
  const _origin = assertSameOrigin(req)
  if (!_origin.ok) return NextResponse.json(_origin.body, { status: _origin.status })
  return NextResponse.json(
    { success: false, error: 'Calendar test event creation is not configured in this build.' },
    { status: 501 }
  )
}
