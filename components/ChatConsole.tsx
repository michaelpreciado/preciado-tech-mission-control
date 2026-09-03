'use client'

/**
 * CHAT CONSOLE — every Hermes conversation, every agent, every device, in one
 * mobile-first surface.
 *
 *  - Conversation list (searchable, filterable by agent/device/source) over a
 *    thread viewer in a two-pane layout on desktop; a single paned stack on
 *    mobile (list ⇄ thread).
 *  - With nothing selected the thread pane shows CHAT INTEL — archive-wide
 *    stats — rather than sitting empty.
 *  - Continue any conversation in place (real Hermes `--resume`), or start a
 *    brand-new one.
 *  - Performance: rows and bubbles use CSS content-visibility, so off-screen
 *    entries cost DOM but skip layout and paint.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectionHead } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Markdown } from '@/components/Markdown'
import { cleanTitle, dayBucket, isJunk, sourceGlyph, type DayBucket } from '@/lib/conv-format'
import { ChatIntel } from '@/components/views/ChatIntel'
import LiveChatMirror from '@/components/LiveChatMirror'
import type { ConversationStats } from '@/lib/conversations'
import '../app/vf/v3-lane.css'

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
  ms?: number
}

type Device = { name: string; isLocal: boolean }

const BUCKET_ORDER: DayBucket[] = ['TODAY', 'YESTERDAY', 'THIS WEEK', 'THIS MONTH', 'OLDER']

/**
 * Rows rendered per page. content-visibility skips PAINT for off-screen rows
 * but they still cost DOM: the full archive put ~8,000 nodes on the page
 * against ~900 on every other tab. Paging keeps the tree small while search
 * still queries the whole archive server-side.
 */
const PAGE_SIZE = 60

/* ── SSE reader ─────────────────────────────────────────── */

type SseEvent = { event: string; data: unknown }

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let curEvent = 'message'
  let curData = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('event:')) {
          curEvent = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          curData = line.slice(5).trim()
        } else if (line === '') {
          if (curData !== '') {
            try { yield { event: curEvent, data: JSON.parse(curData) } } catch { /* skip bad frame */ }
          }
          curEvent = 'message'
          curData = ''
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

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

function convoKey(c: Conversation): string {
  return `${c.device}::${c.profile}::${c.id}`
}

/** Render a message body — tool logs collapsed, prose as markdown. */
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
  // Agent replies are markdown; users type plain text but markdown is harmless
  // there and keeps pasted snippets readable.
  return <div className="cc-msg-body"><Markdown text={m.content || ''} /></div>
}

/* ── Copy-to-clipboard button ───────────────────────────── */

function fallbackCopy(text: string, onDone: () => void) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
  document.body.appendChild(el)
  el.select()
  try { document.execCommand('copy') } catch { /* best-effort */ }
  document.body.removeChild(el)
  onDone()
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }
  return (
    <button
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy message'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '12px',
        minWidth: '44px',
        minHeight: '44px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontFamily: 'monospace',
        letterSpacing: '0.08em',
        opacity: copied ? 1 : 0.4,
        color: copied ? 'var(--mc-neon)' : 'inherit',
        flexShrink: 0,
      }}
    >
      {copied ? 'COPIED' : '⎘'}
    </button>
  )
}

/* ── Conversation list row ──────────────────────────────── */

function ConvoRow({ c, active, cursor, onOpen }: {
  c: Conversation; active: boolean; cursor: boolean; onOpen: (c: Conversation) => void
}) {
  const title = cleanTitle(c.title) ?? `${c.source || 'session'} · ${new Date(c.startedAt).toLocaleDateString()}`
  return (
    <button
      className={`cc-row ${active ? 'is-active' : ''} ${cursor ? 'is-cursor' : ''}`}
      onClick={() => onOpen(c)}
      data-convo={convoKey(c)}
    >
      <span className="cc-row-side">
        <span className={`cc-led ${c.active ? 'is-live' : ''}`} />
      </span>
      <span className="cc-row-main">
        <span className="cc-row-top">
          <span className="cc-row-title">{title}</span>
          <span className="cc-row-time">{relTime(c.lastActiveAt)}</span>
        </span>
        <span className="cc-row-preview">{c.preview || '—'}</span>
        <span className="cc-row-meta">
          <span className="cc-chip cc-chip-src" title={`source: ${c.source || 'unknown'}`}>
            {sourceGlyph(c.source)} {c.source || '—'}
          </span>
          <span className="cc-chip cc-chip-dev">{c.device}</span>
          <span className="cc-chip cc-chip-agent">{c.profile}</span>
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
  const [stats, setStats] = useState<ConversationStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [filterDevice, setFilterDevice] = useState('')
  const [filterProfile, setFilterProfile] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [showJunk, setShowJunk] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<ChatMessage[]>([])
  const [threadRef, setThreadRef] = useState<Conversation | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [newProfile, setNewProfile] = useState('jarvis')
  const [newDevice, setNewDevice] = useState('')

  /* Deep-link support: /chat?profile=<name> (from the Bots roster's ENGAGE
     action) pre-filters the list AND presets the NEW composer to that bot.
     /chat?session=<id>[&device=<name>] (from the command palette) additionally
     opens that thread once the list resolves. Read once on mount; afterwards
     the user's own filter choices win. */
  const deepLinkRef = useRef<{ session: string; device: string } | null>(null)
  const deepLinkDoneRef = useRef(false)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const preset = sp.get('profile')
    if (preset) {
      setFilterProfile(preset)
      setNewProfile(preset)
    }
    const session = sp.get('session')
    if (session) deepLinkRef.current = { session, device: sp.get('device') ?? '' }
  }, [])

  const [cursor, setCursor] = useState(-1)
  /* Bumped after a send so the list effect re-runs and picks up the new
     message count, preview and ordering. */
  const [reloadToken, setReloadToken] = useState(0)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const listRef = useRef<HTMLDivElement>(null)
  const threadRefEl = useRef<HTMLDivElement>(null)
  const threadBottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  /* Tick the elapsed display while busy. Server heartbeats anchor the truth;
     the client interval keeps it smooth between them. */
  const busyStartRef = useRef<number>(0)
  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    busyStartRef.current = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - busyStartRef.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [busy])

  /* Abort any in-flight request on unmount. */
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  /* Load the conversation index. One debounced effect owns every fetch — an
     eager load plus a debounced load fired two requests per keystroke. */
  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (filterDevice) params.set('device', filterDevice)
        if (filterProfile) params.set('profile', filterProfile)
        const res = await fetch(`/api/conversations?${params}`, { cache: 'no-store' })
        const j = await res.json()
        if (!alive) return
        setConversations(j.conversations ?? [])
        setDevices(j.devices ?? [])
        setProfiles(j.profiles ?? [])
        setStats(j.stats ?? null)
      } catch {
        /* keep whatever is on screen */
      } finally {
        if (alive) setLoaded(true)
      }
    }
    const t = setTimeout(run, q ? 250 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [q, filterDevice, filterProfile, reloadToken])

  useEffect(() => { setLimit(PAGE_SIZE); setCursor(-1) }, [q, filterDevice, filterProfile, filterSource, showJunk])

  /* Load a thread */
  const openThread = useCallback(async (c: Conversation) => {
    setOpenId(c.id)
    setThreadRef(c)
    setShowNew(false)
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
    setShowNew(false)
  }, [])

  /* Honour a /chat?session=<id> deep-link once the conversation index has
     resolved: open the matching thread (device-scoped if ?device= was given,
     else first id match). If the id isn't in the result set we give up quietly
     and leave the ?profile= pre-filter in place — never crash, never blank. */
  useEffect(() => {
    if (deepLinkDoneRef.current || !loaded) return
    const dl = deepLinkRef.current
    if (!dl) { deepLinkDoneRef.current = true; return }
    const match =
      conversations.find(c => c.id === dl.session && (!dl.device || c.device === dl.device)) ??
      conversations.find(c => c.id === dl.session)
    if (match) {
      deepLinkDoneRef.current = true
      deepLinkRef.current = null
      void openThread(match)
    } else if (conversations.length > 0) {
      // Index resolved without the target — stop retrying on later reloads.
      deepLinkDoneRef.current = true
      deepLinkRef.current = null
    }
  }, [loaded, conversations, openThread])

  useEffect(() => {
    threadBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [openId, threadLoading, thread.length])

  /* Track whether we're pinned to the newest message (drives JUMP TO LATEST). */
  const onThreadScroll = useCallback(() => {
    const el = threadRefEl.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120)
  }, [])

  /* Send a message to continue the OPEN conversation */
  const sendContinue = useCallback(async () => {
    const text = composer.trim()
    if (!text || busy || !threadRef) return
    setComposer('')
    setBusy(true)
    setThread(t => [...t, { id: Date.now(), role: 'user', content: text, timestamp: Date.now() }])
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(threadRef.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile: threadRef.profile, device: threadRef.device }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: 'send failed' }))
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${j.error || 'send failed'}`, timestamp: Date.now() }])
      } else {
        for await (const ev of readSse(res.body)) {
          if (ev.event === 'heartbeat') {
            const d = ev.data as { elapsedMs?: number }
            if (typeof d.elapsedMs === 'number') {
              busyStartRef.current = Date.now() - d.elapsedMs
            }
          } else if (ev.event === 'done') {
            const d = ev.data as { ok?: boolean; error?: string; reply?: string; messages?: ChatMessage[] }
            if (!d.ok) {
              setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${d.error || 'send failed'}`, timestamp: Date.now() }])
            } else {
              setThread(d.messages ?? [])
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${(err as Error).message}`, timestamp: Date.now() }])
      }
    } finally {
      abortRef.current = null
      setBusy(false)
      setReloadToken(t => t + 1)
    }
  }, [composer, busy, threadRef])

  /* Start a brand-new conversation */
  const startNew = useCallback(async () => {
    const text = composer.trim()
    if (!text || busy) return
    setComposer('')
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch('/api/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, profile: newProfile, device: newDevice }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: 'send failed' }))
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${j.error || 'send failed'}`, timestamp: Date.now() }])
      } else {
        for await (const ev of readSse(res.body)) {
          if (ev.event === 'heartbeat') {
            const d = ev.data as { elapsedMs?: number }
            if (typeof d.elapsedMs === 'number') {
              busyStartRef.current = Date.now() - d.elapsedMs
            }
          } else if (ev.event === 'done') {
            const d = ev.data as { ok?: boolean; error?: string; reply?: string }
            if (!d.ok) {
              setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${d.error || 'send failed'}`, timestamp: Date.now() }])
            } else {
              setOpenId('__new__')
              setThread([{ id: Date.now(), role: 'user', content: text, timestamp: Date.now() },
                { id: Date.now() - 1, role: 'assistant', content: d.reply ?? '', timestamp: Date.now() }])
              setThreadRef(null)
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setThread(t => [...t, { id: Date.now() - 1, role: 'tool', content: `⚠ ${(err as Error).message}`, timestamp: Date.now() }])
      }
    } finally {
      abortRef.current = null
      setBusy(false)
      setReloadToken(t => t + 1)
    }
  }, [composer, busy, newProfile, newDevice])

  /* Every source present in the current result set, for the source filter. */
  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const c of conversations) if (c.source) set.add(c.source)
    return [...set].sort()
  }, [conversations])

  const { visible, hiddenCount } = useMemo(() => {
    const bySource = filterSource ? conversations.filter(c => c.source === filterSource) : conversations
    if (showJunk) return { visible: bySource, hiddenCount: 0 }
    const kept = bySource.filter(c => !isJunk(c))
    return { visible: kept, hiddenCount: bySource.length - kept.length }
  }, [conversations, filterSource, showJunk])

  /* Only the current page is rendered; `visible` stays the full result set so
     counts and keyboard navigation still describe the whole archive. */
  const shown = useMemo(() => visible.slice(0, limit), [visible, limit])
  const remaining = visible.length - shown.length

  /* Group into day buckets for sticky headers. */
  const groups = useMemo(() => {
    const now = Date.now()
    const map = new Map<DayBucket, Conversation[]>()
    for (const c of shown) {
      const b = dayBucket(c.lastActiveAt, now)
      const arr = map.get(b)
      if (arr) arr.push(c)
      else map.set(b, [c])
    }
    return BUCKET_ORDER.filter(b => map.has(b)).map(b => ({ bucket: b, rows: map.get(b)! }))
  }, [shown])

  /* j/k navigation over the flattened list. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        setCursor(prev => {
          const next = e.key === 'j' ? Math.min(visible.length - 1, prev + 1) : Math.max(0, prev - 1)
          // Walking off the rendered page pulls the next one in.
          if (next >= limit) setLimit(l => l + PAGE_SIZE)
          const target = visible[next]
          if (target) {
            listRef.current?.querySelector(`[data-convo="${CSS.escape(convoKey(target))}"]`)
              ?.scrollIntoView({ block: 'nearest' })
          }
          return next
        })
      } else if (e.key === 'Enter' && cursor >= 0 && visible[cursor]) {
        e.preventDefault()
        void openThread(visible[cursor])
      } else if (e.key === 'Escape' && openId) {
        closeThread()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, cursor, openId, openThread, closeThread, limit])

  /* Auto-grow the composer with its content. */
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(200, el.scrollHeight)}px`
  }, [composer])

  const hasActiveThread = openId !== null
  const showIntel = !hasActiveThread || openId === '__intel__'
  /* Intel is a read-only view — it must not enable the composer. */
  const composable = Boolean(threadRef) || openId === '__new__'
  const canSend = openId === '__new__' ? Boolean(composer.trim()) : Boolean(threadRef && composer.trim())
  const submit = () => void (openId === '__new__' ? startNew() : sendContinue())
  const activeFilters = Boolean(filterDevice || filterProfile || filterSource)

  return (
    <>
      <SectionHead label="CHAT / ALL CONVERSATIONS" />
      <div className="v1-kicker">
        <span className="jp" lang="ja">通信</span>
        <span>Comms channel</span>
      </div>
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
              {q && <button className="cc-clear-q" onClick={() => setQ('')} aria-label="Clear search">✕</button>}
            </div>
            <button className="cc-intelbtn" onClick={() => { setShowNew(false); setThread([]); setThreadRef(null); setOpenId('__intel__') }} title="Archive stats">
              ◈ <span>INTEL</span>
            </button>
            <button className="cc-newbtn" onClick={() => { setShowNew(true); setThread([]); setThreadRef(null); setOpenId('__new__') }} disabled={busy}>
              <Icon name="ok" size={14} /> NEW
            </button>
          </div>

          {/* Stage D: Pinned agent slots — always visible, outside filtered buckets */}
          <div style={{
            display: 'flex',
            gap: '1px',
            borderBottom: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
            background: 'color-mix(in srgb, currentColor 3%, transparent)',
          }}>
            {(['jarvis', 'friday'] as const).map(agent => {
              const id = profiles.includes(agent) ? agent : agent
              const live = conversations.some(c => c.profile === id && c.active)
              return (
                <button
                  key={agent}
                  onClick={() => {
                    setNewProfile(id)
                    setShowNew(true)
                    setThread([])
                    setThreadRef(null)
                    setOpenId('__new__')
                  }}
                  disabled={busy}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5em',
                    padding: '0 10px',
                    minHeight: '44px',
                    background: 'none',
                    border: 'none',
                    borderRight: agent === 'jarvis' ? '1px solid color-mix(in srgb, currentColor 12%, transparent)' : 'none',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'inherit',
                    opacity: busy ? 0.4 : 1,
                  }}
                  aria-label={`Start new conversation with ${agent}`}
                >
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: live ? '#00e87a' : 'color-mix(in srgb, currentColor 30%, transparent)',
                    boxShadow: live ? '0 0 5px #00e87a' : 'none',
                  }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{agent.toUpperCase()}</span>
                  <span style={{ opacity: 0.45, fontSize: '9px', letterSpacing: '0.12em' }}>START</span>
                </button>
              )
            })}
          </div>

          {/* LIVE MIRROR — ongoing desktop chats, streamed in real time.
              Click a row for the inline thread; ⇱ jumps to the console view. */}
          <LiveChatMirror
            localDevice={devices.find(d => d.isLocal)?.name ?? 'local'}
            onOpen={c => { setShowNew(false); void openThread(c) }}
          />

          {/* Filters are ALWAYS mounted. They used to be gated on a filter
              already being set, which made them unreachable: the only controls
              that could set one were inside the block that needed one. */}
          <div className="cc-filters">
            <select value={filterProfile} onChange={e => setFilterProfile(e.target.value)} aria-label="Filter by agent">
              <option value="">agent: all</option>
              {profiles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterDevice} onChange={e => setFilterDevice(e.target.value)} aria-label="Filter by device">
              <option value="">device: all</option>
              {devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} aria-label="Filter by source">
              <option value="">source: all</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {activeFilters && (
              <button className="cc-clear" onClick={() => { setFilterDevice(''); setFilterProfile(''); setFilterSource('') }} aria-label="Clear filters">✕</button>
            )}
          </div>

          <div className="cc-listmeta">
            <span>{shown.length} shown · {visible.length} of {stats?.totalConversations ?? conversations.length}</span>
            {hiddenCount > 0 && (
              <button className="cc-showjunk" onClick={() => setShowJunk(v => !v)}>
                {showJunk ? 'hide' : `+${hiddenCount}`} empty
              </button>
            )}
            <span className="cc-listmeta-hint">j/k to move · ↵ open</span>
          </div>

          <div className="cc-list" ref={listRef}>
            {!loaded ? (
              <div className="cc-empty">loading conversations…</div>
            ) : visible.length === 0 ? (
              <div className="cc-empty">
                {q || activeFilters ? 'no matches — try clearing filters' : 'no conversations yet — start one with NEW'}
              </div>
            ) : (
              groups.map(g => (
                <div key={g.bucket} className="cc-group">
                  <div className="cc-group-head">{g.bucket}<span>{g.rows.length}</span></div>
                  {g.rows.map(c => (
                    <ConvoRow
                      key={convoKey(c)}
                      c={c}
                      active={openId === c.id}
                      cursor={cursor >= 0 && visible[cursor] === c}
                      onOpen={openThread}
                    />
                  ))}
                </div>
              ))
            )}
            {remaining > 0 && (
              <button className="cc-loadmore" onClick={() => setLimit(l => l + PAGE_SIZE)}>
                LOAD {Math.min(PAGE_SIZE, remaining)} MORE · {remaining} REMAINING
              </button>
            )}
          </div>
        </div>

        {/* ── THREAD PANE ── */}
        <div className={`cc-threadpane ${hasActiveThread ? '' : 'is-empty'}`}>
          {(threadRef || openId === '__intel__') && (
            <div className="cc-thread-head">
              <button className="cc-back" onClick={closeThread} aria-label="Back to conversations">⌃</button>
              <div className="cc-thread-title">
                <span className="cc-thread-name">
                  {threadRef ? (cleanTitle(threadRef.title) ?? threadRef.source ?? 'conversation') : 'CHAT INTEL'}
                </span>
                <span className="cc-thread-sub">
                  {threadRef ? (
                    <>
                      {sourceGlyph(threadRef.source)} {threadRef.source} · {threadRef.device} / {threadRef.profile}
                      {threadRef.model ? ` · ${threadRef.model.split('/').pop()}` : ''} · {threadRef.messageCount} msgs
                    </>
                  ) : `every conversation across ${stats?.byDevice.length ?? 0} devices`}
                </span>
              </div>
            </div>
          )}

          <div className="cc-thread" ref={threadRefEl} onScroll={onThreadScroll}>
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

            {/* Nothing selected → the archive at a glance, not dead space. */}
            {showIntel && stats && <ChatIntel stats={stats} onOpen={(id, profile, device) => {
              const match = conversations.find(c => c.id === id && c.profile === profile && c.device === device)
              if (match) void openThread(match)
            }} />}

            {threadLoading && <div className="cc-empty">loading thread…</div>}

            {(() => {
              let prevDay = ''
              return thread.map(m => {
                const day = new Date(m.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                const showDiv = day !== prevDay
                prevDay = day
                const divLabel = dayBucket(m.timestamp)
                const isUserOrAssistant = m.role === 'user' || m.role === 'assistant'
                return (
                  <div key={m.id}>
                    {showDiv && (
                      <div style={{
                        fontFamily: 'monospace',
                        fontSize: '9px',
                        letterSpacing: '0.24em',
                        textTransform: 'uppercase',
                        opacity: 0.5,
                        padding: '10px 12px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75em',
                      }}>
                        <span style={{ flex: 1, borderTop: '1px solid currentColor', opacity: 0.3 }} />
                        <span>{divLabel}</span>
                        <span style={{ flex: 1, borderTop: '1px solid currentColor', opacity: 0.3 }} />
                      </div>
                    )}
                    <div className={`cc-bubble is-${m.role}`}>
                      <div className="cc-bubble-head">
                        <span>{m.role === 'user' ? '▸ YOU' : m.role === 'assistant' ? '◂ AGENT' : m.role === 'tool' ? '⚙ TOOL' : '· NOTE'}</span>
                        {m.role === 'tool' && m.ms != null && (
                          <span style={{ opacity: 0.45, fontSize: '0.78em', fontFamily: 'monospace', marginLeft: '0.4em' }}>
                            {(m.ms / 1000).toFixed(1)}s
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto' }}>{fmtStamp(m.timestamp)}</span>
                        {isUserOrAssistant && <CopyButton text={m.content ?? ''} />}
                      </div>
                      <MessageBody m={m} />
                    </div>
                  </div>
                )
              })
            })()}
            {busy && (
              <div className="cc-bubble is-assistant">
                <div className="cc-bubble-head"><span>◂ AGENT</span><span>…</span></div>
                <div className="cc-msg-body cc-thinking">
                  thinking<span className="mc-boot-cursor" />
                  {elapsed > 0 && (
                    <span style={{ marginLeft: '0.5em', opacity: 0.6 }}>
                      {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div ref={threadBottomRef} />
          </div>

          {hasActiveThread && !atBottom && (
            <button className="cc-jump" onClick={() => threadBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>
              ↓ JUMP TO LATEST
            </button>
          )}

          {/* Composer */}
          <form className="cc-composer" onSubmit={e => { e.preventDefault(); submit() }}>
            <textarea
              ref={composerRef}
              value={composer}
              onChange={e => setComposer(e.target.value)}
              onKeyDown={e => {
                // Enter sends; Shift+Enter and Cmd/Ctrl+Enter both newline-or-send
                // in different apps, so support Cmd+Enter as an explicit send too.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); return }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              }}
              placeholder={
                openId === '__new__' ? 'First message to the agent…'
                  : threadRef ? `Continue “${cleanTitle(threadRef.title) ?? 'this conversation'}”…`
                    : 'Select a conversation, or press NEW to start one'
              }
              rows={2}
              maxLength={8000}
              disabled={busy || !composable}
              aria-label="Message"
            />
            <button type="submit" className="cc-send" disabled={busy || !canSend}>
              {busy ? '…' : 'SEND ▸'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
