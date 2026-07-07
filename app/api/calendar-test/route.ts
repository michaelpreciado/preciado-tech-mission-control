import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Calendar test event creation is not configured in this build.' },
    { status: 501 }
  )
}
