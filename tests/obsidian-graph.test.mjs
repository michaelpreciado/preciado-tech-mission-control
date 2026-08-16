import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFrontmatterTags,
  parseWikilinkTargets,
  extractTitle,
  parseNote,
  buildNoteIndex,
  resolveLinkTarget,
  buildGraph,
} from '../lib/obsidian-graph.ts'

/* ── frontmatter tags ─────────────────────────────────────── */

test('parseFrontmatterTags reads an inline array', () => {
  const text = `---\ntags: [friday, core, system]\ntype: core-neuron\n---\n\n# System\n`
  assert.deepEqual(parseFrontmatterTags(text), ['friday', 'core', 'system'])
})

test('parseFrontmatterTags reads a dash-list', () => {
  const text = `---\ntags:\n  - writing\n  - personal\n  - journey\ntype: journal\n---\n\n# Journey\n`
  assert.deepEqual(parseFrontmatterTags(text), ['writing', 'personal', 'journey'])
})

test('parseFrontmatterTags lowercases and trims quoted entries', () => {
  const text = `---\ntags: [Edith, "Memory", 'Policy']\n---\nbody\n`
  assert.deepEqual(parseFrontmatterTags(text), ['edith', 'memory', 'policy'])
})

test('parseFrontmatterTags returns [] when there is no tags key', () => {
  const text = `---\ntype: journal\ncreated: 2026-01-01\n---\nbody\n`
  assert.deepEqual(parseFrontmatterTags(text), [])
})

test('parseFrontmatterTags returns [] when there is no frontmatter at all', () => {
  assert.deepEqual(parseFrontmatterTags('# Just a note\n\nno frontmatter here'), [])
})

test('parseFrontmatterTags returns [] for an empty tags key', () => {
  const text = `---\ntags:\ntype: journal\n---\nbody\n`
  assert.deepEqual(parseFrontmatterTags(text), [])
})

test('parseFrontmatterTags does not crash on malformed frontmatter (no closing ---)', () => {
  const text = `---\ntags: [a, b\ntype: broken\n\n# Heading anyway\n`
  assert.deepEqual(parseFrontmatterTags(text), [])
})

/* ── wikilinks ────────────────────────────────────────────── */

test('parseWikilinkTargets strips alias suffix', () => {
  const text = `See [[../../0200 Projects/Project Index|Project Index]] for more.`
  assert.deepEqual(parseWikilinkTargets(text), ['../../0200 Projects/Project Index'])
})

test('parseWikilinkTargets strips heading anchors and block refs', () => {
  const text = `[[Identity#Name]] and [[System^abc123]]`
  assert.deepEqual(parseWikilinkTargets(text), ['Identity', 'System'])
})

test('parseWikilinkTargets skips empty and folder-only links', () => {
  const text = `[[]] and [[000 Session Archives/2026/]]`
  assert.deepEqual(parseWikilinkTargets(text), [])
})

test('parseWikilinkTargets dedupes repeated targets', () => {
  const text = `[[Identity]] mentioned twice: [[Identity]]`
  assert.deepEqual(parseWikilinkTargets(text), ['Identity'])
})

test('parseWikilinkTargets keeps full vault-relative paths intact', () => {
  const text = `related: [[100 Memory System/Durable Memory]]`
  assert.deepEqual(parseWikilinkTargets(text), ['100 Memory System/Durable Memory'])
})

/* ── title extraction ─────────────────────────────────────── */

test('extractTitle prefers the first H1', () => {
  assert.equal(extractTitle('# My Title\n\nbody', 'fallback'), 'My Title')
})

test('extractTitle falls back when there is no H1', () => {
  assert.equal(extractTitle('no heading here', 'Fallback Name'), 'Fallback Name')
})

/* ── link resolution ──────────────────────────────────────── */

function note(relPath, text) {
  return parseNote(relPath, text)
}

test('resolveLinkTarget resolves a full vault-relative path', () => {
  const notes = [
    note('100 Memory System/Durable Memory.md', '# Durable Memory'),
    note('100 Memory System/Identity.md', '[[100 Memory System/Durable Memory]]'),
  ]
  const index = buildNoteIndex(notes)
  assert.equal(
    resolveLinkTarget('100 Memory System/Durable Memory', '100 Memory System/Identity', index),
    '100 Memory System/Durable Memory',
  )
})

test('resolveLinkTarget resolves a path relative to the source note', () => {
  const notes = [
    note('0200 Projects/Project Index.md', '# Project Index'),
    note('Friday/500 Friday Hub/Active Projects Hub.md', '[[../../0200 Projects/Project Index]]'),
  ]
  const index = buildNoteIndex(notes)
  assert.equal(
    resolveLinkTarget('../../0200 Projects/Project Index', 'Friday/500 Friday Hub/Active Projects Hub', index),
    '0200 Projects/Project Index',
  )
})

test('resolveLinkTarget falls back to a unique basename match anywhere in the vault', () => {
  const notes = [
    note('100 Memory System/Identity.md', '# Identity'),
    note('300 Action Logs/2026-01-01.md', '[[Identity]]'),
  ]
  const index = buildNoteIndex(notes)
  assert.equal(resolveLinkTarget('Identity', '300 Action Logs/2026-01-01', index), '100 Memory System/Identity')
})

test('resolveLinkTarget returns null for an ambiguous basename match', () => {
  const notes = [
    note('100 Memory System/Identity.md', '# Identity'),
    note('Friday/100 Memory System/Identity.md', '# Identity'),
    note('300 Action Logs/2026-01-01.md', '[[Identity]]'),
  ]
  const index = buildNoteIndex(notes)
  assert.equal(resolveLinkTarget('Identity', '300 Action Logs/2026-01-01', index), null)
})

test('resolveLinkTarget returns null for a dangling link', () => {
  const notes = [note('300 Action Logs/2026-01-01.md', '[[Nonexistent Note]]')]
  const index = buildNoteIndex(notes)
  assert.equal(resolveLinkTarget('Nonexistent Note', '300 Action Logs/2026-01-01', index), null)
})

/* ── graph assembly ───────────────────────────────────────── */

test('buildGraph creates note nodes, link edges, and tag hub nodes', () => {
  const notes = [
    note('100 Memory System/Identity.md', `---\ntags: [friday, core]\n---\n# Identity\n[[100 Memory System/System]]`),
    note('100 Memory System/System.md', `---\ntags: [friday, core]\n---\n# System`),
    note('0000 Inbox/Untouched.md', '# Untouched\njust a stray note'),
  ]
  const graph = buildGraph(notes)

  const noteIds = graph.nodes.filter(n => n.kind === 'note').map(n => n.id)
  assert.deepEqual(new Set(noteIds), new Set(['100 Memory System/Identity', '100 Memory System/System', '0000 Inbox/Untouched']))

  const tagNodes = graph.nodes.filter(n => n.kind === 'tag')
  const tagIds = tagNodes.map(n => n.id).sort()
  assert.deepEqual(tagIds, ['tag:core', 'tag:friday'])
  for (const t of tagNodes) assert.equal(t.noteCount, 2)

  const linkEdge = graph.edges.find(e => e.kind === 'link')
  assert.ok(linkEdge)
  assert.deepEqual(
    [linkEdge.source, linkEdge.target].sort(),
    ['100 Memory System/Identity', '100 Memory System/System'],
  )

  const tagEdges = graph.edges.filter(e => e.kind === 'tag')
  assert.equal(tagEdges.length, 4) // 2 tags x 2 tagged notes

  const untouched = graph.nodes.find(n => n.id === '0000 Inbox/Untouched')
  assert.equal(untouched.isolated, true)
  const identity = graph.nodes.find(n => n.id === '100 Memory System/Identity')
  assert.equal(identity.isolated, false)

  assert.equal(graph.totalNotes, 3)
  assert.equal(graph.connectedNotes, 2)
})

test('buildGraph ignores self-links and dedupes edges from links present in both directions', () => {
  const notes = [
    note('a.md', '[[a]] [[b]]'),
    note('b.md', '[[a]]'),
  ]
  const graph = buildGraph(notes)
  const linkEdges = graph.edges.filter(e => e.kind === 'link')
  assert.equal(linkEdges.length, 1)
})
