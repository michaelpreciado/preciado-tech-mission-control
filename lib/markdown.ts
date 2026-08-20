/**
 * Minimal Markdown parser — source text in, a token tree out.
 *
 * Deliberately dependency-free (no marked/markdown-it) to hold the line on this
 * project's pruned dependency list, and import-free so Node's ESM loader can
 * test it directly.
 *
 * SECURITY: this module NEVER produces HTML. It emits a token tree that
 * components/Markdown.tsx renders as React elements, so agent output can never
 * become markup. Two consequences enforced here:
 *   - raw HTML in the source stays literal text (see parseInline),
 *   - link hrefs are allowlisted to http/https/mailto; anything else
 *     (javascript:, data:, vbscript:) degrades to the literal source text.
 * Do not add a `dangerouslySetInnerHTML` path to the renderer.
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'strike'; children: MdInline[] }
  | { type: 'link'; href: string; text: string }

export type MdNode =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: number; children: MdInline[] }
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'list'; ordered: boolean; items: MdInline[][] }
  | { type: 'quote'; children: MdInline[] }
  | { type: 'hr' }

/* ── inline ─────────────────────────────────────────────────────────── */

/** Only these schemes may become an href. Everything else stays text. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/

/** Emphasis run delimiters, longest first so `**` wins over `*`. */
const RUNS: { mark: string; type: 'strong' | 'em' | 'strike' }[] = [
  { mark: '**', type: 'strong' },
  { mark: '__', type: 'strong' },
  { mark: '~~', type: 'strike' },
  { mark: '*', type: 'em' },
  { mark: '_', type: 'em' },
]

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch)
}

/**
 * Index of the delimiter that closes a run opened at `start`, or -1.
 *
 * Applies CommonMark's flanking rule: an opener must be followed by a
 * non-space and a closer must be preceded by one. Without this, `2 * 3 * 4`
 * italicises "3" and `snake_case_name` mangles into emphasis.
 */
function closingRun(src: string, start: number, mark: string): number {
  const from = start + mark.length
  if (isSpace(src[from])) return -1
  let at = src.indexOf(mark, from)
  while (at >= 0) {
    if (at > from && !isSpace(src[at - 1])) return at
    at = src.indexOf(mark, at + 1)
  }
  return -1
}

function pushText(out: MdInline[], text: string): void {
  if (!text) return
  const last = out[out.length - 1]
  // Coalesce, so unmatched delimiters don't shatter a line into fragments.
  if (last && last.type === 'text') last.text += text
  else out.push({ type: 'text', text })
}

export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    // `code` binds tightest — nothing inside it is markup.
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        out.push({ type: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
      pushText(out, ch); i++; continue
    }

    // [text](href) — href allowlisted, else the whole thing stays literal.
    if (ch === '[') {
      const close = src.indexOf('](', i)
      if (close > i) {
        const end = src.indexOf(')', close + 2)
        if (end > close) {
          const text = src.slice(i + 1, close)
          const href = src.slice(close + 2, end)
          if (SAFE_HREF.test(href.trim())) {
            out.push({ type: 'link', href: href.trim(), text })
            i = end + 1
            continue
          }
        }
      }
      pushText(out, ch); i++; continue
    }

    const run = RUNS.find(r => src.startsWith(r.mark, i))
    if (run) {
      const end = closingRun(src, i, run.mark)
      if (end >= 0) {
        out.push({ type: run.type, children: parseInline(src.slice(i + run.mark.length, end)) })
        i = end + run.mark.length
        continue
      }
      // Unmatched or non-flanking: emit the delimiter literally so arithmetic
      // like "2 * 3 * 4" and snake_case_words survive intact.
      pushText(out, run.mark); i += run.mark.length; continue
    }

    pushText(out, ch)
    i++
  }

  return out
}

/* ── blocks ─────────────────────────────────────────────────────────── */

export function parseMarkdown(src: string): MdNode[] {
  const lines = String(src ?? '').split('\n')
  const out: MdNode[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return
    const text = buf.join('\n').trim()
    if (text) out.push({ type: 'paragraph', children: parseInline(text) })
    buf.length = 0
  }

  const para: string[] = []

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(FENCE)
    if (fence) {
      flushParagraph(para)
      const marker = fence[1]
      const body: string[] = []
      i++
      // An unterminated fence swallows the rest — better than leaking half a
      // code block into the prose renderer.
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        body.push(lines[i]); i++
      }
      if (i < lines.length) i++
      out.push({ type: 'code', lang: fence[2] || null, text: body.join('\n') })
      continue
    }

    if (!line.trim()) { flushParagraph(para); i++; continue }

    if (HR.test(line)) { flushParagraph(para); out.push({ type: 'hr' }); i++; continue }

    const heading = line.match(HEADING)
    if (heading) {
      flushParagraph(para)
      out.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) })
      i++; continue
    }

    const quote = line.match(QUOTE)
    if (quote) {
      flushParagraph(para)
      const body: string[] = [quote[1]]
      i++
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].match(QUOTE)![1]); i++ }
      out.push({ type: 'quote', children: parseInline(body.join('\n').trim()) })
      continue
    }

    const isBullet = BULLET.test(line)
    const isOrdered = ORDERED.test(line)
    if (isBullet || isOrdered) {
      flushParagraph(para)
      const ordered = isOrdered
      const items: MdInline[][] = []
      const re = ordered ? ORDERED : BULLET
      while (i < lines.length && re.test(lines[i])) {
        items.push(parseInline(lines[i].match(re)![1].trim()))
        i++
      }
      out.push({ type: 'list', ordered, items })
      continue
    }

    para.push(line)
    i++
  }

  flushParagraph(para)
  return out
}
