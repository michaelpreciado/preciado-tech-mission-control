/**
 * Obsidian vault graph — pure parsing/graph-building logic, no fs access.
 *
 * lib/collectors/memory.ts walks the vault (via ROOTS.vault → getConfig(),
 * never process.env.HOME) and hands each file's raw text to `parseNote`,
 * then `buildGraph` turns the parsed notes into `{ nodes, edges }` for
 * components/views/MemoryGraph.tsx. Kept dependency-free/fs-free so the
 * parsing rules can be unit tested against synthetic markdown without
 * touching the real vault (see tests/obsidian-graph.test.mjs).
 *
 * Parsing is defensive by design: malformed frontmatter or stray `[[`
 * never throws — worst case a note contributes no tags/links.
 */
import path from 'node:path'
import type { MemoryGraphEdge, MemoryGraphNode } from './types'

export type ParsedNote = {
  /** Vault-relative path with extension, forward slashes, e.g. "Friday/100 Memory System/Identity.md". */
  relPath: string
  /** relPath without the .md extension — the graph node id and wikilink resolution key. */
  id: string
  title: string
  /** Parent directory, vault-relative, '' at vault root. */
  folder: string
  tags: string[]
  excerpt: string
  updatedAt?: string
  /** Raw (alias/anchor-stripped) [[wikilink]] targets found in the note, deduped. */
  linkTargets: string[]
}

/* ── frontmatter ──────────────────────────────────────────────────── */

const BOM = '﻿'
const FRONTMATTER_RE = new RegExp(`^${BOM}?---\\r?\\n([\\s\\S]*?)\\r?\\n---[ \\t]*(\\r?\\n|$)`)

function extractFrontmatterBlock(text: string): string | null {
  try {
    const m = text.match(FRONTMATTER_RE)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function stripFrontmatter(text: string): string {
  try {
    const m = text.match(FRONTMATTER_RE)
    return m ? text.slice(m[0].length) : text
  } catch {
    return text
  }
}

function cleanTag(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '').trim().toLowerCase()
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)]
}

/**
 * Parses a YAML frontmatter `tags:` field. Handles the two forms seen in
 * the vault: an inline array (`tags: [a, b, c]`) and a dash-list
 * (`tags:\n  - a\n  - b`), plus a lone scalar (`tags: solo`) defensively.
 * Anything else (missing frontmatter, no tags key, empty list) → [].
 */
export function parseFrontmatterTags(text: string): string[] {
  try {
    const fm = extractFrontmatterBlock(text)
    if (!fm) return []
    const lines = fm.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const inline = line.match(/^tags:\s*\[(.*)\]\s*$/)
      if (inline) {
        return dedupe(inline[1].split(',').map(cleanTag).filter(Boolean))
      }
      if (/^tags:\s*$/.test(line)) {
        const out: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          const item = lines[j].match(/^\s*-\s*(.+?)\s*$/)
          if (!item) break
          const t = cleanTag(item[1])
          if (t) out.push(t)
        }
        return dedupe(out)
      }
      const scalar = line.match(/^tags:\s*(.+)$/)
      if (scalar) {
        const t = cleanTag(scalar[1])
        return t ? [t] : []
      }
    }
    return []
  } catch {
    return []
  }
}

/* ── wikilinks ────────────────────────────────────────────────────── */

/**
 * Extracts raw `[[wikilink]]` targets: strips the `|alias` display suffix,
 * `#heading` / `^block` anchors, and skips folder links (trailing `/`) and
 * empty `[[]]`. Does NOT resolve targets to real note ids — see
 * `resolveLinkTarget` for that (needs the full vault index).
 */
export function parseWikilinkTargets(text: string): string[] {
  const out = new Set<string>()
  try {
    const re = /\[\[([^\]]*)\]\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      let inner = m[1].trim()
      if (!inner) continue
      const pipeIdx = inner.indexOf('|')
      if (pipeIdx >= 0) inner = inner.slice(0, pipeIdx).trim()
      const caretIdx = inner.indexOf('^')
      if (caretIdx >= 0) inner = inner.slice(0, caretIdx).trim()
      const hashIdx = inner.indexOf('#')
      if (hashIdx >= 0) inner = inner.slice(0, hashIdx).trim()
      if (!inner || inner.endsWith('/')) continue
      out.add(inner)
    }
  } catch {
    // fall through with whatever was collected
  }
  return [...out]
}

/* ── note parsing ─────────────────────────────────────────────────── */

export function extractTitle(text: string, fallback: string): string {
  try {
    return text.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback
  } catch {
    return fallback
  }
}

export function extractExcerpt(body: string): string {
  try {
    return body
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !/^(---|\*\*\*|___)+$/.test(l)) // drop markdown horizontal rules
      .slice(0, 4)
      .join(' ')
      .slice(0, 260)
  } catch {
    return ''
  }
}

export function parseNote(relPath: string, text: string, updatedAt?: string): ParsedNote {
  const posixRel = relPath.split(path.sep).join('/')
  const id = posixRel.replace(/\.md$/i, '')
  const dir = path.posix.dirname(posixRel)
  const folder = dir === '.' ? '' : dir
  let title = path.posix.basename(id)
  let tags: string[] = []
  let excerpt = ''
  let linkTargets: string[] = []
  try {
    title = extractTitle(text, title)
    tags = parseFrontmatterTags(text)
    excerpt = extractExcerpt(stripFrontmatter(text))
    linkTargets = parseWikilinkTargets(text)
  } catch {
    // best-effort: keep whatever succeeded, skip the rest
  }
  return { relPath: posixRel, id, title, folder, tags, excerpt, updatedAt, linkTargets }
}

/* ── link resolution ──────────────────────────────────────────────── */

export type NoteIndex = {
  byId: Map<string, ParsedNote>
  /** Case-insensitive fallback for byId: lowercased id -> the id(s) sharing that fold. */
  byIdLower: Map<string, string[]>
  byBasename: Map<string, string[]>
}

export function buildNoteIndex(notes: ParsedNote[]): NoteIndex {
  const byId = new Map<string, ParsedNote>()
  const byIdLower = new Map<string, string[]>()
  const byBasename = new Map<string, string[]>()
  for (const n of notes) {
    byId.set(n.id, n)
    const lower = n.id.toLowerCase()
    const lowerArr = byIdLower.get(lower) ?? []
    lowerArr.push(n.id)
    byIdLower.set(lower, lowerArr)
    const base = path.posix.basename(n.id).toLowerCase()
    const arr = byBasename.get(base) ?? []
    arr.push(n.id)
    byBasename.set(base, arr)
  }
  return { byId, byIdLower, byBasename }
}

/**
 * Looks up a candidate vault-relative id, exact case first, falling back to
 * a case-insensitive match if unique. Obsidian link targets are normally
 * written with the exact case of the note they point at, but a note that
 * got renamed/re-cased after the link was written should still resolve
 * rather than silently going dangling — that's a real, if rare, failure
 * mode in a 600+ note vault that's been reorganized over time. Exact case
 * is tried first so two notes differing only by case (e.g. "README" vs
 * "readme") still resolve unambiguously when the link matches one exactly;
 * only an ambiguous case-insensitive fold (two+ ids) is treated as
 * unresolved, same policy as the basename fallback tier.
 */
function lookupId(candidate: string, index: NoteIndex): string | null {
  if (index.byId.has(candidate)) return candidate
  const lowerMatches = index.byIdLower.get(candidate.toLowerCase())
  if (lowerMatches && lowerMatches.length === 1) return lowerMatches[0]
  return null
}

/**
 * Resolves a raw wikilink target to a real note id. Obsidian links in this
 * vault show up in three shapes: full vault-relative path
 * (`100 Memory System/Durable Memory`), a path relative to the linking
 * note (`../../0200 Projects/Project Index`), or a bare filename that
 * relies on Obsidian's "shortest path" resolution (`Identity`). Tries, in
 * order: exact-then-case-insensitive vault-relative id (see `lookupId`),
 * exact-then-case-insensitive path relative to the source note's folder,
 * then a unique basename match anywhere in the vault. Returns null
 * (dangling link, left out of the graph) if none match or a match is
 * ambiguous.
 */
export function resolveLinkTarget(rawTarget: string, sourceId: string, index: NoteIndex): string | null {
  const target = rawTarget.trim()
  if (!target) return null
  const bare = target.replace(/\.md$/i, '')

  const normalize = (p: string) => {
    let c = p.replace(/\\/g, '/')
    if (c.startsWith('./')) c = c.slice(2)
    if (c.startsWith('/')) c = c.slice(1)
    return c
  }

  const direct = normalize(bare)
  const directHit = lookupId(direct, index)
  if (directHit) return directHit

  const sourceDir = path.posix.dirname(sourceId)
  const joined = normalize(path.posix.normalize(path.posix.join(sourceDir === '.' ? '' : sourceDir, bare)))
  const joinedHit = lookupId(joined, index)
  if (joinedHit) return joinedHit

  const base = path.posix.basename(bare).toLowerCase()
  const candidates = index.byBasename.get(base)
  if (candidates && candidates.length === 1) return candidates[0]

  return null
}

/* ── graph assembly ───────────────────────────────────────────────── */

export type BuiltGraph = {
  nodes: MemoryGraphNode[]
  edges: MemoryGraphEdge[]
  totalNotes: number
  connectedNotes: number
}

/**
 * Tag-edge strategy: each unique tag becomes its own graph node
 * (`id: "tag:<name>"`) with an edge to every note carrying it, rather than
 * a note-to-note edge for every shared-tag pair. A popular tag shared by
 * N notes would otherwise contribute O(N^2) note-to-note edges (dozens of
 * notes tagged `edith` alone) — a hub node keeps it O(N) and mirrors how
 * Obsidian's own graph view treats tags as first-class nodes.
 */
export function buildGraph(notes: ParsedNote[]): BuiltGraph {
  const index = buildNoteIndex(notes)
  const degree = new Map<string, number>()
  for (const n of notes) degree.set(n.id, 0)

  const edgeMap = new Map<string, MemoryGraphEdge>()

  for (const n of notes) {
    for (const raw of n.linkTargets) {
      const targetId = resolveLinkTarget(raw, n.id, index)
      if (!targetId || targetId === n.id) continue
      const key = `link:${[n.id, targetId].sort().join('::')}`
      if (edgeMap.has(key)) continue
      edgeMap.set(key, { source: n.id, target: targetId, kind: 'link' })
      degree.set(n.id, (degree.get(n.id) ?? 0) + 1)
      degree.set(targetId, (degree.get(targetId) ?? 0) + 1)
    }
  }

  const tagNoteCounts = new Map<string, number>()
  for (const n of notes) {
    for (const t of n.tags) tagNoteCounts.set(t, (tagNoteCounts.get(t) ?? 0) + 1)
  }
  for (const n of notes) {
    for (const t of n.tags) {
      const tagId = `tag:${t}`
      edgeMap.set(`${tagId}->${n.id}`, { source: tagId, target: n.id, kind: 'tag' })
      degree.set(n.id, (degree.get(n.id) ?? 0) + 1)
    }
  }

  const nodes: MemoryGraphNode[] = notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    tags: n.tags,
    kind: 'note',
    excerpt: n.excerpt,
    updatedAt: n.updatedAt,
    path: n.id,
    isolated: (degree.get(n.id) ?? 0) === 0,
  }))
  for (const [tag, count] of tagNoteCounts) {
    nodes.push({ id: `tag:${tag}`, title: `#${tag}`, folder: '', tags: [], kind: 'tag', isolated: false, noteCount: count })
  }

  const connectedNotes = notes.filter(n => (degree.get(n.id) ?? 0) > 0).length

  return { nodes, edges: [...edgeMap.values()], totalNotes: notes.length, connectedNotes }
}
