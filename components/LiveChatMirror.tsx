'use client'

import { AsciiMsg, messageSide } from '@/components/ascii-msg'

/**
 * LIVE CHAT MIRROR — ongoing desktop chats streaming into Mission Control in
 * real time.
 *
 * Polls /api/chats/live?since=<ms> every ~3s (incremental: the server only
 * re-sends messages newer than the cursor), merges them into a per-session
 * pane inside the Chat tab's list column, and click-throughs to the full
 * conversation in the standard thread viewer (same bubbles, same composer).
 * Reuses the cc-* class vocabulary; only the mirror chrome is new (mcl-*).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/Markdown'
import { cleanTitle, sourceGlyph } from '@/lib/conv-format'

type LiveMsg = {
  sessionId: string
  id: number
  role: string
  content: string | null
  toolName: string | null
  timestamp: number
}

type LiveSession = {
  id: string
  profile: string
  source: string
  model: string | null
  firstTs: number
  lastTs: number
  active: boolean
  messages: LiveMsg[]
}

/** Shape the parent console's thread opener accepts. */
export type LiveConversation = {
  id: string
  title: string
  profile: string
  device: string
  source: string
  model: string | null
  startedAt: number
  lastActiveAt: number
  messageCount: number
  preview: string
  active: boolean
}

const POLL_MS = 3000

const keyOf = (s: LiveSession) => `${s.profile}::${s.id}`

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtStamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function firstUserText(s: LiveSession): string {
  const u = s.messages.find(m => m.role === 'user' && m.content)
  return u?.content ?? ''
}

function lastText(s: LiveSession): string {
  for (let i = s.messages.length - 1; i >= 0; i--) {
    const m = s.messages[i]
    if ((m.role === 'user' || m.role === 'assistant') && m.content) return m.content
  }
  return ''
}

function summary(s: LiveSession): string {
  return lastText(s) || firstUserText(s) || '(no text)'
}

function MessageBody({ m }: { m: LiveMsg }) {
  if (m.role === 'tool') {
    const text = m.content || ''
    return (
      <div className="cc-tool is-open">
        <div className="cc-tool-head"><span>⚙ {m.toolName || 'tool'}</span></div>
        {text && <pre className="cc-tool-body">{text}</pre>}
      </div>
    )
  }
  if (m.role === 'session_meta' || (m.content && m.content.startsWith('[System:'))) {
    return <div className="cc-meta">{String(m.content || '')}</div>
  }
  return <div className="cc-msg-body"><Markdown text={m.content || ''} /></div>
}

export default function LiveChatMirror({ localDevice, onOpen }: {
  localDevice: string
  onOpen: (c: LiveConversation) => void
}) {
  const [sessions, setSessions] = useState<LiveSession[]>([])
  const [generatedAt, setGeneratedAt] = useState<number>(0)
  const [err, setErr] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [thread, setThread] = useState<LiveMsg[]>([])
  const lastSinceRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  /* Merge incremental payloads into the pane, deduped by message id. */
  const merge = useCallback((incoming: LiveSession[]) => {
    setSessions(prev => {
      const map = new Map(prev.map(s => [keyOf(s), s]))
      for (const s of incoming) {
        const k = keyOf(s)
        const old = map.get(k)
        if (!old) { map.set(k, s); continue }
        const seen = new Set(old.messages.map(m => m.id))
        map.set(k, {
          ...old,
          source: s.source || old.source,
          model: s.model || old.model,
          firstTs: old.firstTs || s.firstTs,
          lastTs: s.lastTs,
          active: s.active,
          messages: [...old.messages, ...s.messages.filter(m => !seen.has(m.id))].slice(-200),
        })
      }
      return [...map.values()].sort((a, b) => b.lastTs - a.lastTs)
    })
  }, [])

  /* Poll loop: since = server's generatedAt of the last successful response. */
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const since = lastSinceRef.current
        const res = await fetch(`/api/chats/live?since=${since}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        if (!alive) return
        lastSinceRef.current = j.generatedAt
        setGeneratedAt(j.generatedAt)
        merge(j.sessions ?? [])
        setErr(null)
      } catch (e) {
        if (alive) setErr((e as Error).message)
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS)
      }
    }
    void tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [merge])

  /* Keep the open thread pinned to the newest message. */
  useEffect(() => {
    if (openKey) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [openKey, thread.length])

  /* Live-update the open detail view as new messages land. */
  useEffect(() => {
    if (!openKey) return
    const live = sessions.find(s => keyOf(s) === openKey)
    if (!live) return
    setThread(prev => {
      const seen = new Set(prev.map(m => m.id))
      const add = live.messages.filter(m => !seen.has(m.id))
      return add.length ? [...prev, ...add] : prev
    })
  }, [sessions, openKey])

  const openThread = useCallback(async (s: LiveSession) => {
    const k = keyOf(s)
    setOpenKey(prev => (prev === k ? null : k))
    setThread(s.messages)
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(s.id)}?profile=${s.profile}`, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setThread(j.messages ?? [])
      }
    } catch { /* keep the live copy */ }
  }, [])

  const jumpToConsole = useCallback((s: LiveSession) => {
    onOpen({
      id: s.id,
      title: cleanTitle(firstUserText(s)) ?? s.source,
      profile: s.profile,
      device: localDevice,
      source: s.source,
      model: s.model,
      startedAt: s.firstTs,
      lastActiveAt: s.lastTs,
      messageCount: s.messages.length,
      preview: summary(s),
      active: s.active,
    })
  }, [localDevice, onOpen])

  const open = openKey ? sessions.find(s => keyOf(s) === openKey) : null

  return (
    <div className="mcl amsg-surface">
      <div className="mcl-head">
        <span className="mcl-dot" aria-hidden />
        <span className="mcl-title">LIVE · DESKTOP CHATS</span>
        <span className="mcl-meta">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          {generatedAt > 0 && <> · {relTime(generatedAt)}</>}
        </span>
        {err && <span className="mcl-err" title={err}>⚠</span>}
      </div>

      <div className="mcl-list">
        {sessions.length === 0 && !err && (
          <div className="mcl-empty">no recent activity — desktop chats appear here live</div>
        )}
        {sessions.map(s => (
          <div key={keyOf(s)} className={`mcl-row ${openKey === keyOf(s) ? 'is-open' : ''}`}>
            <button className="mcl-row-main" onClick={() => void openThread(s)} aria-expanded={openKey === keyOf(s)}>
              <span className="mcl-row-top">
                <span className={`cc-led ${s.active ? 'is-live' : ''}`} />
                <span className="mcl-row-name">{cleanTitle(firstUserText(s)) ?? s.source}</span>
                <span className="mcl-row-time">{relTime(s.lastTs)}</span>
              </span>
              <span className="mcl-row-preview">{summary(s)}</span>
              <span className="mcl-row-meta">
                <span className="cc-chip cc-chip-src">{sourceGlyph(s.source)} {s.source}</span>
                <span className="cc-chip cc-chip-agent">{s.profile}</span>
                {s.model && <span className="cc-row-model">{s.model.split('/').pop()}</span>}
              </span>
            </button>
            <button className="mcl-row-full" onClick={() => jumpToConsole(s)} title="Open in conversation console">
              ⇱
            </button>
            {openKey === keyOf(s) && (
              <div className="mcl-thread">
                {thread.map((m, i) => (
                  <AsciiMsg key={m.id} compact who={messageSide(m.role, m.content) === 'system' ? 'SYS' : m.role === 'user' ? 'MICHAEL' : s.profile} side={messageSide(m.role, m.content)} ts={fmtStamp(m.timestamp)} idx={i + 1}>
                    <MessageBody m={m} />
                  </AsciiMsg>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}