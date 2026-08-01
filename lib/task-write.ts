/**
 * Write-back for markdown task checkboxes.
 *
 * These functions edit files in the user's notes vault, so both are written to
 * refuse rather than guess. They are pure (path + line math only) so the risky
 * logic is unit-testable without touching disk — the route layer does the I/O.
 */
import path from 'node:path'

/** Same shape collectTasks() scrapes in lib/mission-data.ts. Keep in sync. */
const CHECKBOX_RE = /^(\s*[-*]\s+\[)([ xX✓])(\]\s+)(.+)$/

/** Same normalization collectTasks() applies before storing MissionTask.title. */
function normalizeTitle(raw: string): string {
  return raw.replace(/\s+#\w+.*$/, '').trim()
}

/**
 * Turn a client-supplied `source` (as produced by rel(): absolute path with the
 * home dir replaced by "~") back into an absolute path, but only if it lands
 * inside one of the roots collectTasks() actually scans and is a .md file.
 * Returns null for anything else — never throws, never guesses.
 */
export function resolveTaskFile(source: string, homeDir: string, roots: string[]): string | null {
  if (!source || typeof source !== 'string') return null
  // Reject control characters only — real vault paths legitimately contain
  // spaces (e.g. "~/Documents/Preciado Tech/...").
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(source)) return null
  if (!source.endsWith('.md')) return null

  const expanded = source.startsWith('~/') ? path.join(homeDir, source.slice(2)) : source
  if (!path.isAbsolute(expanded)) return null
  // Resolve first: "root/../../secret.md" must be judged by where it lands.
  const abs = path.resolve(expanded)
  if (!abs.endsWith('.md')) return null

  const inside = roots.some(root => {
    if (!root) return false
    const r = path.resolve(root)
    // The separator check stops "/x/workspace-evil" matching root "/x/workspace".
    return abs === r || abs.startsWith(r + path.sep)
  })
  return inside ? abs : null
}

export type TickResult =
  | { ok: true; lines: string[] }
  | { ok: false; reason: string }

/**
 * Tick the checkbox at 1-indexed `line`, but only when that line is still a
 * checkbox whose title matches `expectedTitle`. Line numbers drift as files are
 * edited; a mismatch means the file changed underneath us and the safe move is
 * to refuse rather than tick an unrelated task.
 */
export function tickCheckbox(lines: string[], line: number, expectedTitle: string): TickResult {
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    return { ok: false, reason: `line ${line} is outside the file (1..${lines.length})` }
  }
  const idx = line - 1
  const m = lines[idx].match(CHECKBOX_RE)
  if (!m) return { ok: false, reason: `line ${line} is no longer a markdown checkbox` }

  const [, prefix, mark, mid, rest] = m
  if (normalizeTitle(rest) !== normalizeTitle(expectedTitle)) {
    return { ok: false, reason: `line ${line} title changed — refusing to tick a different task` }
  }
  if (mark !== ' ') return { ok: true, lines } // already done; idempotent

  const out = lines.slice()
  out[idx] = `${prefix}x${mid}${rest}`
  return { ok: true, lines: out }
}
