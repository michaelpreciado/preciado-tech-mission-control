import fs from 'node:fs/promises'
import path from 'node:path'
import type { MemoryEntry, MemoryGraph } from '../types'
import { joinIf } from '../config'
import { ROOTS, readText, walk, rel, hashId } from './shared'
import { parseNote, buildGraph, type ParsedNote } from '../obsidian-graph'

export async function collectMemory(): Promise<MemoryEntry[]> {
  const files = [
    joinIf(ROOTS.workspace, 'MEMORY.md'),
    joinIf(ROOTS.workspace, 'USER.md'),
    ...(await walk(joinIf(ROOTS.workspace, 'memory'), { extensions: ['.md'], max: 20, depth: 2 })),
    ...(await walk(joinIf(ROOTS.fridayVault, '100 Memory System'), { extensions: ['.md'], max: 20, depth: 3 })),
    ...(await walk(joinIf(ROOTS.fridayVault, '300 Action Logs'), { extensions: ['.md'], max: 20, depth: 3 })),
  ].filter(Boolean)
  const unique = [...new Set(files)]
  const entries: MemoryEntry[] = []
  for (const file of unique) {
    const text = await readText(file)
    if (!text.trim()) continue
    const stat = await fs.stat(file).catch(() => null)
    const title = text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, '.md')
    const excerpt = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('tags:')).slice(0, 4).join(' ').slice(0, 260)
    entries.push({ id: `mem-${hashId(file)}`, title, source: rel(file), excerpt, updatedAt: stat?.mtime.toISOString() })
  }
  return entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 40)
}

/**
 * Obsidian node graph for the Memory tab — walks the FULL vault
 * (ROOTS.vault → getConfig().paths.vaultDir, never process.env.HOME) and
 * parses [[wikilinks]] + frontmatter tags across every note, unlike
 * collectMemory() above which only skims two narrow subfolders for a flat
 * excerpt list. '' (vault not configured) → empty graph, same "degrade to
 * disabled" convention as every other ROOTS.* path.
 */
export async function collectMemoryGraph(): Promise<MemoryGraph> {
  const vaultRoot = ROOTS.vault
  if (!vaultRoot) return { nodes: [], edges: [], totalNotes: 0, connectedNotes: 0 }

  const files = await walk(vaultRoot, { extensions: ['.md'], max: 3000, depth: 10 })
  const notes: ParsedNote[] = []
  for (const file of files) {
    const text = await readText(file)
    if (!text.trim()) continue
    const relPath = path.relative(vaultRoot, file)
    const stat = await fs.stat(file).catch(() => null)
    notes.push(parseNote(relPath, text, stat?.mtime.toISOString()))
  }
  return { ...buildGraph(notes), vaultName: path.basename(vaultRoot) }
}
