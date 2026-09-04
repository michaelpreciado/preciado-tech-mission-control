import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

const DEADLINE_MS = 4_000
const SOURCE_TIMEOUT_MS = 3_800
const DEFAULT_KEYWORDS = [
  'agent', 'agents', 'llm', 'local', 'inference', 'robot', 'robotics',
  'trading', 'crypto', 'bitcoin', 'gpu', 'ollama', 'openai', 'anthropic',
  'model', 'rag', 'neural', 'embedding', 'transformer', 'nvidia',
]

type Signal = {
  id: string
  title: string
  url: string
  source: 'HN' | 'arXiv:cs.RO' | 'arXiv:cs.AI'
  author: string | null
  score: number
  ageDays: number
  summary: string | null
  tags: string[]
  matched: boolean
}

function keywordsFromConfig(): string[] {
  try {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'data', 'config.json'), 'utf8'))
    const keywords = config?.contentSignals?.keywords
    if (!Array.isArray(keywords)) return DEFAULT_KEYWORDS
    const clean = keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0)
    return clean.length > 0 ? clean.map(keyword => keyword.toLowerCase()) : DEFAULT_KEYWORDS
  } catch {
    return DEFAULT_KEYWORDS
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchedTags(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase()
  return keywords.filter(keyword => new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(lower))
}

function ageDays(value: number | string | undefined, now: number): number {
  const timestamp = typeof value === 'number' ? value * 1000 : Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return 9999
  return Math.round(Math.max(0, (now - timestamp) / 86_400_000) * 10) / 10
}

function decodeXml(value: string): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  }
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code: string) => {
      const point = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : ''
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => entities[name.toLowerCase()] ?? entity)
}

function cleanText(value: string, maxLength?: number): string {
  const text = decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!maxLength || text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

function field(block: string, name: string): string {
  return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? ''
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function fetchHn(keywords: string[], now: number, signal: AbortSignal): Promise<Signal[]> {
  const ids = JSON.parse(await fetchText('https://hacker-news.firebaseio.com/v0/topstories.json', signal))
  if (!Array.isArray(ids)) throw new Error('invalid topstories response')
  const items = await Promise.all(ids.slice(0, 30).map(async (id): Promise<Signal | null> => {
    try {
      const item = JSON.parse(await fetchText(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, signal))
      if (!item?.id || !item?.title) return null
      const summary = item.text ? cleanText(String(item.text), 200) : null
      const tags = matchedTags(`${item.title} ${summary ?? ''}`, keywords)
      return {
        id: `hn-${item.id}`,
        title: cleanText(String(item.title)),
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        source: 'HN' as const,
        author: typeof item.by === 'string' ? item.by : null,
        score: typeof item.score === 'number' ? item.score : 0,
        ageDays: ageDays(item.time, now),
        summary,
        tags,
        matched: tags.length > 0,
      }
    } catch {
      return null
    }
  }))
  return items.filter((item): item is Signal => item !== null)
}

async function fetchArxiv(category: 'cs.RO' | 'cs.AI', keywords: string[], now: number, signal: AbortSignal): Promise<Signal[]> {
  const xml = await fetchText(`https://rss.arxiv.org/rss/${category}`, signal)
  const blocks = Array.from(xml.matchAll(/<(?:entry|item)\b[^>]*>([\s\S]*?)<\/(?:entry|item)>/gi), match => match[1]).slice(0, 12)
  return blocks.map((block, index) => {
    const title = cleanText(field(block, 'title'))
    const summary = cleanText(field(block, 'summary') || field(block, 'description'), 200) || null
    const href = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    const url = decodeXml(href || cleanText(field(block, 'link')) || cleanText(field(block, 'id')))
    const published = cleanText(field(block, 'published') || field(block, 'pubDate') || field(block, 'updated'))
    const rawId = cleanText(field(block, 'id')) || url
    const arxivId = rawId.match(/(?:abs\/|arxiv:)([^?#\s]+)/i)?.[1] || `${category}-${index}`
    const author = cleanText(field(block, 'author') || field(block, 'dc:creator')) || null
    const tags = matchedTags(`${title} ${summary ?? ''}`, keywords)
    return {
      id: `arxiv-${arxivId}`,
      title,
      url,
      source: `arXiv:${category}` as const,
      author,
      score: 0,
      ageDays: ageDays(published, now),
      summary,
      tags,
      matched: tags.length > 0,
    }
  }).filter(item => item.title && item.url)
}

export async function GET() {
  const now = Date.now()
  const keywords = keywordsFromConfig()
  const errors: string[] = []
  const signals: Signal[] = []
  const controllers = [new AbortController(), new AbortController(), new AbortController()]
  const sourceTimers = controllers.map(controller => setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS))

  const jobs: Array<Promise<void>> = [
    fetchHn(keywords, now, controllers[0].signal)
      .then(items => { signals.push(...items) })
      .catch(() => { errors.push('HN unavailable') }),
    fetchArxiv('cs.RO', keywords, now, controllers[1].signal)
      .then(items => { signals.push(...items) })
      .catch(() => { errors.push('arXiv:cs.RO unavailable') }),
    fetchArxiv('cs.AI', keywords, now, controllers[2].signal)
      .then(items => { signals.push(...items) })
      .catch(() => { errors.push('arXiv:cs.AI unavailable') }),
  ]

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled(jobs),
    new Promise<void>(resolve => { deadlineTimer = setTimeout(resolve, DEADLINE_MS) }),
  ])
  if (deadlineTimer) clearTimeout(deadlineTimer)
  sourceTimers.forEach(clearTimeout)
  controllers.forEach(controller => controller.abort())

  signals.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1
    if (a.matched && b.matched && a.tags.length !== b.tags.length) return b.tags.length - a.tags.length
    return a.ageDays - b.ageDays
  })

  const capped = signals.slice(0, 40).map(item => ({ ...item, tags: item.tags.slice(0, 4) }))
  return NextResponse.json(
    {
      generatedAt: new Date(now).toISOString(),
      count: capped.length,
      sources: ['HN', 'arXiv:cs.RO', 'arXiv:cs.AI'],
      errors,
      signals: capped,
    },
    { headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=600' } },
  )
}
