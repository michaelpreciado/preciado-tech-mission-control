/**
 * Conversation presentation helpers — turning raw Hermes session rows into
 * something readable in the chat list.
 *
 * Hermes titles a session from its first message, so real titles sit next to
 * control-token spew (`< | DSML | tool_calls>`), bracketed model-switch notes,
 * and empty stubs. This module is where that gets cleaned up.
 *
 * Import-free so Node's ESM loader can test it directly.
 */

const MAX_TITLE = 80

/**
 * Leading `[Note: …]` / `[System: …]` markers Hermes prepends to a turn. The
 * closing bracket is optional: Hermes truncates long titles mid-string, so a
 * great many of these arrive with the `]` cut off.
 */
const NOTE_PREFIX = /^\[\s*(?:note|system|reminder)\s*:\s*([^\]]*)(?:\]\s*|$)/i
/** Control-token wrappers like `< | DSML | tool_calls>`. */
const CONTROL_TOKENS = /[<>|]+/g
/** A title that is only punctuation or markdown scaffolding carries nothing. */
const NO_SIGNAL = /^[\s\-*_=~#.`'"()[\]{}<>|/\\]*$/

export function cleanTitle(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let t = String(raw)

  // A bracketed note wrapping the whole title is all we have — keep its body
  // rather than throwing the only text away.
  const note = t.match(NOTE_PREFIX)
  if (note) {
    const rest = t.slice(note[0].length).trim()
    t = rest || note[1]
  }

  t = t
    .replace(CONTROL_TOKENS, ' ')
    .replace(/`+/g, '')
    // Only unwrap emphasis that actually PAIRS around text. Stripping bare
    // underscores would turn `tool_calls` into `toolcalls` and mangle every
    // snake_case identifier that shows up in a title.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*(\S[^*]*?)\*/g, '$1')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()

  if (!t || NO_SIGNAL.test(t)) return null
  if (t.toLowerCase() === 'untitled' || t.toLowerCase() === '(untitled)') return null

  if (t.length > MAX_TITLE) {
    const cut = t.slice(0, MAX_TITLE)
    const sp = cut.lastIndexOf(' ')
    t = (sp > MAX_TITLE * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
  }
  return t
}

/**
 * A row worth hiding: no usable title AND nothing to read. Threads with real
 * message volume are always kept, however badly they're titled.
 */
export function isJunk(c: { title?: string | null; messageCount?: number; preview?: string | null }): boolean {
  if ((c.messageCount ?? 0) > 1) return false
  if (cleanTitle(c.title)) return false
  return !String(c.preview ?? '').trim()
}

/* ── time bucketing ─────────────────────────────────────────────────── */

export type DayBucket = 'TODAY' | 'YESTERDAY' | 'THIS WEEK' | 'THIS MONTH' | 'OLDER'

/** Whole calendar days between two instants — local time, not 24h windows. */
function calendarDaysApart(then: number, now: number): number {
  const a = new Date(then); const b = new Date(now)
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function dayBucket(ts: number, now: number = Date.now()): DayBucket {
  const days = calendarDaysApart(ts, now)
  if (days <= 0) return 'TODAY'
  if (days === 1) return 'YESTERDAY'
  if (days < 7) return 'THIS WEEK'
  if (days < 31) return 'THIS MONTH'
  return 'OLDER'
}

/* ── source glyphs ──────────────────────────────────────────────────── */

const SOURCE_GLYPH: Record<string, string> = {
  cli: '▶',
  tui: '▤',
  desktop: '▣',
  telegram: '✈',
  kanban: '≡',
  cron: '○',
  api: '⌁',
  web: '◈',
}

export function sourceGlyph(source: string | null | undefined): string {
  return SOURCE_GLYPH[String(source ?? '').toLowerCase()] ?? '·'
}
