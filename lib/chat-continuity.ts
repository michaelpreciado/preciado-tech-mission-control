import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type ChatContinuity = { mcConversationId: string; hermesSession: string; profile: string; selector: 'name' | 'id'; sessionName?: string; herdrPane?: string; paneName?: string }
export function continuityStore(file = path.join(process.cwd(), 'data/chat-continuity.sqlite')) {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('CREATE TABLE IF NOT EXISTS continuity (profile TEXT, session TEXT, record TEXT NOT NULL, PRIMARY KEY(profile, session))')
  return {
    get(profile: string, session: string): ChatContinuity | undefined {
      const row = db.prepare('SELECT record FROM continuity WHERE profile = ? AND session = ?').get(profile, session)
      return row ? JSON.parse(String(row.record)) : undefined
    },
    save(record: ChatContinuity) {
      db.prepare("UPDATE continuity SET record = ? WHERE json_extract(record, '$.mcConversationId') = ?").run(JSON.stringify(record), record.mcConversationId)
      db.prepare('INSERT INTO continuity VALUES (?, ?, ?) ON CONFLICT(profile, session) DO UPDATE SET record=excluded.record').run(record.profile, record.hermesSession, JSON.stringify(record))
      return record
    },
    alias(profile: string, session: string, record: ChatContinuity) {
      db.prepare('INSERT OR REPLACE INTO continuity VALUES (?, ?, ?)').run(profile, session, JSON.stringify(record))
    },
    close() { db.close() },
  }
}
export function chatContinuity(profile: string, session: string, selector: 'name' | 'id' = 'name') {
  const store = continuityStore()
  try { return store.get(profile, session) ?? store.save({ mcConversationId: randomUUID(), hermesSession: session, profile, selector }) }
  finally { store.close() }
}
