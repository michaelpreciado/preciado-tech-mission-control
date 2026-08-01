import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTaskFile, tickCheckbox } from '../lib/task-write.ts'

const HOME = process.env.HOME || '/home/ci'
const ROOTS = [`${HOME}/.openclaw/workspace`, `${HOME}/Documents/Preciado Tech`]

/* ── resolveTaskFile: the path guard ──────────────────── */

test('resolveTaskFile expands ~ and accepts files inside a scanned root', () => {
  assert.equal(
    resolveTaskFile('~/.openclaw/workspace/agent-crew/notes/TASKS.md', HOME, ROOTS),
    `${HOME}/.openclaw/workspace/agent-crew/notes/TASKS.md`,
  )
  assert.equal(
    resolveTaskFile('~/Documents/Preciado Tech/Friday/note.md', HOME, ROOTS),
    `${HOME}/Documents/Preciado Tech/Friday/note.md`,
  )
})

test('resolveTaskFile rejects paths outside every scanned root', () => {
  assert.equal(resolveTaskFile('~/.ssh/id_rsa.md', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/Documents/other/x.md', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('/etc/passwd.md', HOME, ROOTS), null)
})

test('resolveTaskFile rejects traversal that escapes a root', () => {
  assert.equal(resolveTaskFile('~/.openclaw/workspace/../../.ssh/k.md', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/.openclaw/workspace/a/../b.md', HOME, ROOTS),
    `${HOME}/.openclaw/workspace/b.md`) // normalizes but stays inside → allowed
})

test('resolveTaskFile rejects a sibling dir that merely shares a root prefix', () => {
  // "~/.openclaw/workspace-evil" must not pass as "<HOME>/.openclaw/workspace"
  assert.equal(resolveTaskFile('~/.openclaw/workspace-evil/x.md', HOME, ROOTS), null)
})

test('resolveTaskFile requires a .md file', () => {
  assert.equal(resolveTaskFile('~/.openclaw/workspace/notes.txt', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/.openclaw/workspace/notes', HOME, ROOTS), null)
})

test('resolveTaskFile rejects empty input, control chars, and an empty root list', () => {
  assert.equal(resolveTaskFile('', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/.openclaw/workspace/a\u0000b.md', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/.openclaw/workspace/a\nb.md', HOME, ROOTS), null)
  assert.equal(resolveTaskFile('~/.openclaw/workspace/x.md', HOME, []), null)
})

test('resolveTaskFile allows spaces - real vault paths contain them', () => {
  assert.equal(
    resolveTaskFile('~/Documents/Preciado Tech/0900 Content/Video Prompt.md', HOME, ROOTS),
    `${HOME}/Documents/Preciado Tech/0900 Content/Video Prompt.md`,
  )
})

/* ── tickCheckbox: only write when we're certain ──────── */

const FILE = [
  '# Notes',
  '- [ ] Fix the dashboard',
  '- [x] Already done',
  'plain text',
  '  * [ ] Nested task #tag trailing',
]

test('tickCheckbox flips an unchecked box and preserves indentation + bullet', () => {
  const r = tickCheckbox(FILE, 2, 'Fix the dashboard')
  assert.equal(r.ok, true)
  assert.equal(r.lines[1], '- [x] Fix the dashboard')
  assert.deepEqual(r.lines.filter((_, i) => i !== 1), FILE.filter((_, i) => i !== 1))
})

test('tickCheckbox matches the title with the same #tag stripping collectTasks uses', () => {
  const r = tickCheckbox(FILE, 5, 'Nested task')
  assert.equal(r.ok, true)
  assert.equal(r.lines[4], '  * [x] Nested task #tag trailing')
})

test('tickCheckbox is idempotent on an already-ticked box', () => {
  const r = tickCheckbox(FILE, 3, 'Already done')
  assert.equal(r.ok, true)
  assert.equal(r.lines[2], '- [x] Already done')
})

test('tickCheckbox refuses when the title no longer matches (line drift)', () => {
  const r = tickCheckbox(FILE, 2, 'Some other task')
  assert.equal(r.ok, false)
  assert.match(r.reason, /title/i)
})

test('tickCheckbox refuses when the line is not a checkbox', () => {
  assert.equal(tickCheckbox(FILE, 4, 'plain text').ok, false)
  assert.equal(tickCheckbox(FILE, 1, '# Notes').ok, false)
})

test('tickCheckbox refuses an out-of-range line', () => {
  assert.equal(tickCheckbox(FILE, 0, 'x').ok, false)
  assert.equal(tickCheckbox(FILE, 999, 'x').ok, false)
})
