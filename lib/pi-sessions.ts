/** Server-only reader for Pi's native JSONL store for this working directory. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChatMessage, Conversation } from './conversations'

export function piSessionDir(): string {
  const root = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent')
  return process.env.PI_CODING_AGENT_SESSION_DIR || path.join(root, 'sessions', `--${process.cwd().replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`)
}

export function readPiSessions(dir = piSessionDir()): { conversation: Conversation; messages: ChatMessage[] }[] {
  let files: string[]
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')) } catch { return [] }
  return files.flatMap(file => {
    try {
      const rows = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').flatMap(line => {
        try { return [JSON.parse(line)] } catch { return [] } // tolerate an unfinished append
      })
      const header = rows.find(r => r.type === 'session')
      if (!header || typeof header.id !== 'string') return []
      const messages: ChatMessage[] = rows.filter(r => r.type === 'message' && r.message).map((r, i) => ({
        id: i + 1,
        role: r.message.role === 'toolResult' ? 'tool' : r.message.role,
        content: typeof r.message.content === 'string' ? r.message.content :
          (Array.isArray(r.message.content) ? r.message.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n') : ''),
        toolName: r.message.toolName,
        timestamp: Number(r.message.timestamp) || Date.parse(r.timestamp) || 0,
      }))
      const startedAt = Date.parse(header.timestamp) || 0
      const lastActiveAt = messages.at(-1)?.timestamp || startedAt
      const title = rows.filter(r => r.type === 'session_info' && r.name).at(-1)?.name || messages.find(m => m.role === 'user')?.content || '(untitled)'
      return [{ conversation: {
        agent: 'pi', id: header.id, title: title.slice(0, 100), profile: 'pi', device: os.hostname(), source: 'pi',
        model: rows.filter(r => r.type === 'model_change').at(-1)?.modelId || null,
        startedAt, lastActiveAt, messageCount: messages.length,
        preview: (messages.at(-1)?.content || '').slice(0, 140), active: lastActiveAt > Date.now() - 90_000,
      }, messages }]
    } catch { return [] }
  })
}
