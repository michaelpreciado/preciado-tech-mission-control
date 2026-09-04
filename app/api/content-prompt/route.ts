import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'

const TEMPLATE_PATH = join(process.cwd(), 'data', 'content', 'video-prompt-template.txt')

let template: string | null = null
try {
  template = readFileSync(TEMPLATE_PATH, 'utf8')
} catch {
  template = null
}

function replaceAll(source: string, slot: string, value: string): string {
  return source.split(slot).join(value)
}

function stepDetails(raw: string): { count: number; titles: string; bullets: string } {
  const titleLines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('- '))
    .slice(0, 5)

  if (titleLines.length === 0) {
    return {
      count: 4,
      titles: 'Step 1: Boot | Step 2: Build | Step 3: Prove | Step 4: Payoff',
      bullets: '',
    }
  }

  const titles = titleLines.map((line, index) => {
    const title = line.replace(/^step\s+\d+\s*:\s*/i, '')
    return `Step ${index + 1}: ${title}`
  }).join(' | ')

  return {
    count: Math.max(3, Math.min(5, titleLines.length)),
    titles,
    bullets: raw,
  }
}

export async function GET(request: NextRequest) {
  if (template === null) {
    return NextResponse.json({ error: 'template missing' }, { status: 500 })
  }

  const params = request.nextUrl.searchParams
  const topic = params.get('topic') || 'Untitled build'
  const hook = params.get('hook') || 'Watch what I built'
  const steps = params.get('steps') || ''
  const terminal = params.get('terminal') || './preciado-build --mode=live'
  const payoff = params.get('payoff') || "it works, and it's on my own hardware"
  const length = params.get('length') || '30'
  const details = stepDetails(steps)

  const replacements: Array<[string, string]> = [
    ['<<TOPIC>>', topic],
    ['<<HOOK LINE>>', hook],
    ['<<NUMBER OF STEPS>>', String(details.count)],
    ['<<STEP TITLES>>', details.titles],
    ['<<STEP BULLETS>>', details.bullets],
    ['<<TERMINAL COMMAND>>', terminal],
    ['<<PAYOFF / RESULT>>', payoff],
    ['<<TARGET LENGTH>>', `${length} seconds (25-32s safe band)`],
    ['<<CTA HANDLE>>', '@preciadotech'],
    ['<<CTA TEXT>>', '+ FOLLOW FOR AI TECH'],
    ['<<PLATFORM>>', 'TikTok + Instagram Reels + YouTube Shorts (9:16, 1080x1920, 30fps)'],
    ['<<SOURCE ASSETS>>', 'screenshots + terminal captures in ./assets/'],
  ]

  const prompt = replacements.reduce(
    (result, [slot, value]) => replaceAll(result, slot, value),
    template,
  )

  return NextResponse.json(
    { prompt, chars: prompt.length },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
