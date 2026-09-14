/**
 * Regression tests for the canonical Hermes Bot Chat lookup.
 *
 * The collector reads each profile's state.db without writing to it. These
 * fixtures cover the real sessions/messages subset used by that read.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { readBotDb } = await import('../lib/collectors/bots.ts')

function makeDb(rows = []) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mc-bots-canonical-'))
  const file = path.join(dir, 'state.db')
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      hidden INTEGER,
      archived INTEGER,
      started_at REAL,
      message_count INTEGER,
      model TEXT,
      source TEXT
    );
    CREATE TABLE messages (
      session_id TEXT,
      role TEXT,
      content TEXT,
      timestamp REAL
    );
  `)
  const addSession = db.prepare(
    `INSERT INTO sessions (id, title, hidden, archived, started_at, message_count, model, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const addMessage = db.prepare(
    `INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)`,
  )
  for (const row of rows) {
    addSession.run(row.id, row.title, row.hidden, row.archived, row.startedAt, row.messageCount, row.model, row.source)
    for (const message of row.messages ?? []) {
      addMessage.run(row.id, message.role, message.content, message.timestamp)
    }
  }
  db.close()
  return { dir, file }
}

test('readBotDb returns the canonical Bot Chat and its last message time', () => {
  const fixture = makeDb([
    {
      id: 'canonical-123', title: 'Bot Chat', hidden: 1, archived: 0,
      startedAt: 1700000000, messageCount: 2, model: 'test/model', source: 'desktop',
      messages: [
        { role: 'user', content: 'hello', timestamp: 1700000010 },
        { role: 'assistant', content: 'hi', timestamp: 1700000042 },
      ],
    },
  ])
  try {
    const stats = readBotDb(fixture.file)
    assert.equal(stats.canonicalSessionId, 'canonical-123')
    assert.equal(stats.canonicalLastActiveAt, 1700000042_000)
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
  }
})

test('readBotDb returns null canonical fields when a profile has no Bot Chat', () => {
  const fixture = makeDb([
    {
      id: 'ordinary-123', title: 'A normal session', hidden: 0, archived: 0,
      startedAt: 1700000000, messageCount: 0, model: null, source: 'desktop',
    },
  ])
  try {
    const stats = readBotDb(fixture.file)
    assert.equal(stats.canonicalSessionId, null)
    assert.equal(stats.canonicalLastActiveAt, null)
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true })
  }
})
