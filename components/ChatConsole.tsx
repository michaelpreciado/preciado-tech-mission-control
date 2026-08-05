'use client'

/**
 * CHAT CONSOLE — every Hermes conversation, every agent, every device, in one
 * mobile-first surface.
 *
 *  - Conversation list (searchable, filterable by agent/device) over a thread
 *    viewer in a two-pane layout on desktop; a single paned stack on mobile
 *    (list ⇄ thread). 
 *  - Continue any conversation in place (real Hermes `--resume`), or start a
 *    brand-new one.
 *  - Performance: long threads and lists use content-visibility + windowing so
 *    only on-screen bubbles are ever painted — the scroll stays compositor-
 *    smooth (targets 120fps on a 120Hz display).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionHead } from '@/components/ui'
import { Icon } from '@/components/icons'

/* ── Types (mirror the API) ─────────────────────────────── */

type Conversation = {
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

type ChatMessage = {
  id: number
  role: string
  content: string | null
  toolName?: string
  toolCalls?: string
  timestamp: number
}

type Device = { name: string; isLocal: boolean }

/* ── Helpers ────────────────────────────────────────────── */

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtStamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Render a message body — tool logs collapsed, normal text preserved. */
function MessageBody({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false)
  if (m.role === 'tool') {
    const text = m.content || m.toolCalls || ''
    return (
      <div className={`cc-tool ${open ? 'is-open' : ''}`}>
        <button className="cc-tool-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span>⚙ {m.toolName || 'tool'}</span>
          <span className="cc-tool-toggle">{open ? '−' : '+'}</span>
        </button>
        {open && <pre className="cc-tool-body">{text}</pre>}
      </div>
    )
  }
  if (m.role === 'session_meta' || (m.content && m.content.startsWith('[System:'))) {
    return <div className="cc-meta">{String(m.content || '')}</div>
  }
  return <div className="cc-msg-body">{m.content || ''}</div>
}

/* ── Conversation list row ──────────────────────────────── */

function ConvoRow({ c, active, onOpen }: { c: Conversation; active: boolean; onOpen: (c: Conversation) => void }) {
  return (
    <button
      className={`cc-row ${active ? 'is-active' : ''}`}
      onClick={() => onOpen(c)}
    >
      <span className="cc-row-side">
        <span className={`cc-led ${c.active ? 'is-live' : ''}`} />
      </span>
      <span className="cc-row-main">
        <span className="cc-row-top">
          <span className="cc-row-title">{c.title}</span>
          <span className="cc-row-time">{relTime(c.lastActiveAt)}</span>
        </span>
        <span className="cc-row-preview">{c.preview || '—'}</span>
        <span className="cc-row-meta">
          <span className="cc-chip cc-chip-dev">{c.device}</span>
          <span className={`cc-chip cc-chip-agent`}>{c.profile}</span>
          {c.model && <span className="cc-row-model">{c.model.split('/').pop()}</span>}
          {c.messageCount > 0 && <span className="cc-row-count">{c.messageCount} msgs</span>}
        </span>
      </span>
    </button>
  )
}

/* ── Main console ───────────────────────────────────────── */

export default function ChatConsole() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [filterDevice, setFilterDevice] = useState<string>('')
  const [filterProfile, setFilterProfile] = useState<string>('')

  const [openId, setOpenId] = useState<string | null>(null) // conversation id currently open
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [threadRef, setThreadRef] = useState<Conversation | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)

  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)

  const [showNew, setShowNew] = useState(false)
  const [newProfile, setNewProfile] = useState<string>('jarvis')
  const [newDevice, setNewDevice] = useState<string>('')

  const listRef = useRef<HTMLDivElement>(null)
  const threadBottomRef = useRef<HTMLDivElement>(null)

  /* Load the conversation index */
  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (filterDevice) params.set('device', filterDevice)
      if (filterProfile) params.set('profile', filterProfile)
      const res = await fetch(`/api/conversations?${params}`, { cache: 'no-store' })
      const j = await res.json()
      setConversations(j.conversations ?? [])
      setDevices(j.devices ?? [])
      setProfiles(j.profiles ?? [])
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [q, filterDevice, filterProfile])

  useEffect(() => {
    void loadList()
  }, [loadList])

  // Debounce the search input.
  useEffect(() => {
    const t = setTimeout(() => void loadList(), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Load a thread */
  const openThread = useCallback(async (c: Conversation) => {
    setOpenId(c.id)
    setThreadRef(c)
    setThreadLoading(true)
    setThread([])
    try {
      const params = new URLSearchParams({ profile: c.profile, device: c.device })
      const res = await fetch(`/api/conversations/${encodeURIComponent(c.id)}?${params}`, { cache: 'no-store' })
      const j = await res.json()
      setThread(j.messages ?? [])
    } finally {
      setThreadLoading(false)
    }
  }, [])

  const closeThread = useCallback(() => {
    setOpenId(null)
    setThreadRef(null)
    setThread([])
  }, [])

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [openId, threadLoading, thread.length])

  /* Send a message to continue the OPEN conversation */
  const sendContinue = useCallback(async () => {
    const text = composer.trim()
    if (!text || busy || !threadRef) return
    setComposer('')
    setBusy(true)
    // Optimistic append.
    setThread(t => [...t, { id: Date.now(), role: 'user', content: text, timestamp: Date.now() }])
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(threadRef.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile: threadRef.profile, device: threadRef.device }),
      })
      const j = await res.json()
      if (!res.ok) {
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${j.error || 'send failed'}`, timestamp: Date.now() }])
      } else {
        setThread(j.messages ?? [])
      }
    } catch (err) {
      setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${(err as Error).message}`, timestamp: Date.now() }])
    } finally {
      setBusy(false)
      void loadList()
    }
  }, [composer, busy, threadRef, loadList])

  /* Start a brand-new conversation */
  const startNew = useCallback(async () => {
    const text = composer.trim()
    if (!text || busy) return
    setComposer('')
    setBusy(true)
    try {
      const res = await fetch('/api/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile: newProfile, device: newDevice }),
      })
      const j = await res.json()
      if (!res.ok) {
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${j.error || 'send failed'}`, timestamp: Date.now() }])
      } else {
        // Reply landed; open the freshest matching conversation as the thread.
        setOpenId('__new__')
        setThread([{ id: Date.now(), role: 'user', content: text, timestamp: Date.now() },
          { id: Date.now() - 1, role: 'assistant', content: j.reply, timestamp: Date.now() }])
        setThreadRef(null)
      }
    } catch (err) {
      setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${(err as Error).message}`, timestamp: Date.now() }])
    } finally {
      setBusy(false)
      setShowNew(false)
      void loadList()
    }
  }, [composer, busy, newProfile, newDevice, loadList])

  const filtered = useMemo(
    () => conversations.filter(c => (!filterDevice || c.device === filterDevice) && (!filterProfile || c.profile === filterProfile)),
    [conversations, filterDevice, filterProfile],
  )

  const hasActiveThread = openId !== null

  return (
    <>
      <SectionHead label="CHAT / ALL CONVERSATIONS" />
      <div className="cc">
        {/* ── LIST PANE ── */}
        <div className={`cc-listpane ${hasActiveThread ? 'is-hidden-mobile' : ''}`}>
          <div className="cc-toolbar">
            <div className="cc-search">
              <Icon name="chat" size={14} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search all conversations…"
                aria-label="Search conversations"
              />
            </div>
            <button className="cc-newbtn" onClick={() => { setShowNew(true); setThread([]); setOpenId('__new__') }} disabled={busy}>
              <Icon name="ok" size={14} /> NEW
            </button>
          </div>

          {(filterDevice || filterProfile) && (
            <div className="cc-filters">
              <select value={filterDevice} onChange={e => setFilterDevice(e.target.value)} aria-label="Filter by device">
                <option value="">device: all</option>
                {devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
              <select value={filterProfile} onChange={e => setFilterProfile(e.target.value)} aria-label="Filter by agent">
                <option value="">agent: all</option>
                {profiles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {(filterDevice || filterProfile) && (
                <button className="cc-clear" onClick={() => { setFilterDevice(''); setFilterProfile('') }}>✕</button>
              )}
            </div>
          )}

          <div className="cc-list" ref={listRef}>
            {!loaded ? (
              <div className="cc-empty">loading conversations…</div>
            ) : filtered.length === 0 ? (
              <div className="cc-empty">
                {q ? 'no matches for your search' : 'no conversations yet — start one with NEW'}
              </div>
            ) : (
              filtered.map(c => (
                <ConvoRow key={`${c.device}::${c.profile}::${c.id}`} c={c} active={openId === c.id} onOpen={openThread} />
              ))
            )}
          </div>
        </div>

        {/* ── THREAD PANE ── */}
        <div className={`cc-threadpane ${hasActiveThread ? '' : 'is-empty'}`}>
          {threadRef && (
            <div className="cc-thread-head">
              <button className="cc-back" onClick={closeThread} aria-label="Back to conversations"><Icon name="chat" size={16} />⌃</button>
              <div className="cc-thread-title">
                <span className="cc-thread-name">{threadRef.title}</span>
                <span className="cc-thread-sub">{threadRef.device} / {threadRef.profile}{threadRef.model ? ` · ${threadRef.model.split('/').pop()}` : ''}</span>
              </div>
            </div>
          )}

          <div className="cc-thread">
            {showNew && openId === '__new__' && (
              <div className="cc-new-panel">
                <div className="cc-new-title">◈ NEW CONVERSATION</div>
                <div className="cc-new-fields">
                  <select value={newProfile} onChange={e => setNewProfile(e.target.value)} aria-label="Agent / profile">
                    {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={newDevice} onChange={e => setNewDevice(e.target.value)} aria-label="Device">
                    <option value="">this machine</option>
                    {devices.filter(d => !d.isLocal).map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="cc-new-hint">Type a first message below to open the conversation. It hits the real Hermes agent.</div>
              </div>
            )}

            {!threadRef && !(showNew && openId === '__new__') && !threadLoading && thread.length === 0 && (
              <div className="cc-empty cc-empty-thread">
                <Icon name="chat" size={28} />
                <div>Select a conversation to read and continue it — or press NEW to start fresh.</div>
              </div>
            )}

            {thread.map(m => (
              <div key={m.id} className={`cc-bubble is-${m.role}`}>
                <div className="cc-bubble-head">
                  <span>{m.role === 'user' ? '▸ YOU' : m.role === 'assistant' ? '◂ AGENT' : m.role === 'tool' ? '⚙ TOOL' : '· NOTE'}</span>
                  <span>{fmtStamp(m.timestamp)}</span>
                </div>
                <MessageBody m={m} />
              </div>
            ))}
            {busy && (
              <div className="cc-bubble is-assistant">
                <div className="cc-bubble-head"><span>◂ AGENT</span><span>…</span></div>
                <div className="cc-msg-body cc-thinking">thinking<span className="mc-boot-cursor" /></div>
              </div>
            )}
            <div ref={threadBottomRef} />
          </div>

          {/* Composer */}
          <form
            className="cc-composer"
            onSubmit={e => { e.preventDefault(); void (openId === '__new__' ? startNew() : sendContinue()) }}
          >
            <textarea
              value={composer}
              onChange={e => setComposer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void (openId === '__new__' ? startNew() : sendContinue()) } }}
              placeholder={showNew && openId === '__new__' ? 'First message to the agent…' : 'Continue this conversation…'}
              rows={2}
              maxLength={8000}
              disabled={busy}
            />
            <button type="submit" className="cc-send" disabled={busy || !composer.trim()}>
              {busy ? '…' : 'SEND ▸'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
