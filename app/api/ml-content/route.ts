import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
// Use relative path — @/ alias may not work in API routes
import type { MLContentIdea } from '../../../lib/types'
import { getConfig } from '../../../lib/config'

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

  const ideas: MLContentIdea[] = []
  for (const file of files) {
    try {
      const content = readFileSync(join(IDEAS_DIR, file), 'utf-8')
      const data = JSON.parse(content)
      const stages = ['script_film', 'edit_optimize', 'post_promote', 'done'] as const
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idea files have loose shape
      data.ideas?.forEach((idea: any, idx: number) => {
        ideas.push({
          ...idea,
          stage: stages[idx % stages.length],
          updated_at: data.generated_at,
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

export async function POST(_request: NextRequest) {
  return NextResponse.json({ message: 'Not implemented yet' }, { status: 501 })
}
