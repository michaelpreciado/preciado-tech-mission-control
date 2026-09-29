'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field, IconButton, Input, Row, Segmented, Select, TextArea } from './ui'
import { Markdown } from './Markdown'
import { BotsPanel, ago } from './views/BotsPanel'
import { ChatContinuityFooter } from './ChatContinuityFooter'
import LiveChatMirror from './LiveChatMirror'
import { apiFetch } from '@/lib/api-base'
import type { HandoffReport } from '@/lib/handoff'
import { cleanTitle, isJunk } from '@/lib/conv-format'
import styles from './AgentConsole.module.css'
import shellStyles from './ChatShell.module.css'

type Agent = 'hermes' | 'pi'
type AgentStatus = { id: string; enabled: boolean; available: boolean }
type Conversation = {
  agent?: Agent; id: string; title: string; profile: string; device: string; source: string
  model: string | null; startedAt: number; lastActiveAt: number; messageCount: number; preview: string; active: boolean
}
type Message = { id: number; role: string; content: string | null; toolName?: string; timestamp: number }
type Device = { name: string; isLocal: boolean }
type Target = { id: string; profile: string; device: string; agent: Agent; title: string; model?: string | null; draft?: boolean }
type ModelOption = { id: string; provider?: string; note?: string }
type ModelGroup = { label: string; models: ModelOption[] }
type Index = { conversations: Conversation[]; devices: Device[]; profiles: string[] }
const keyOf = (c: Target | Conversation) => JSON.stringify([c.agent || 'hermes', c.device, c.profile, c.id])
const PAGE_SIZE = 60
const MESSAGE_PAGE_SIZE = 150
const THREAD_POLL_MS = 15_000
const MODEL_STORAGE = 'mc.chat.model'
const optionKey = (model: ModelOption) => `${model.provider ?? ''}::${model.id}`

function sameMessages(current: Message[], next: Message[]): boolean {
  if (current.length !== next.length) return false
  return current.every((message, index) => {
    const candidate = next[index]
    return message.id === candidate.id
      && message.role === candidate.role
      && message.content === candidate.content
      && message.toolName === candidate.toolName
      && message.timestamp === candidate.timestamp
  })
}

/**
 * Continuity keys. Both are read on mount so a reload — or the Android WebView
 * being resumed from the background — lands back in the same thread with the
 * same unsent text, instead of dropping the user on the conversation list.
 *
 *   mc.chat.session (localStorage)  — the last opened conversation + mode: a
 *     standing place, so it outlives the tab (mirrors mc.chat.model).
 *   mc.chat.draft (sessionStorage)  — unsent composer text, keyed per
 *     conversation: real state for this tab only, never a queue of stale text
 *     across browser restarts.
 */
const SESSION_STORAGE = 'mc.chat.session'
const DRAFT_STORAGE = 'mc.chat.draft'
type StoredSession = { agent: Agent; device: string; profile: string; id: string; mode: string }

/** Conversation ids are single path segments; reject anything else so a
 *  tampered storage value can never be spliced into a request URL. */
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.profile !== 'string') return null
    if (!ID_RE.test(parsed.id) || !/^[a-zA-Z0-9_-]{1,64}$/.test(parsed.profile)) return null
    return {
      agent: parsed.agent === 'pi' ? 'pi' : 'hermes',
      device: typeof parsed.device === 'string' ? parsed.device : '',
      profile: parsed.profile,
      id: parsed.id,
      mode: parsed.mode === 'herdr' || parsed.mode === 'codex' ? parsed.mode : 'chat',
    }
  } catch { return null }
}

function readDraft(id: string): string {
  try { return (sessionStorage.getItem(`${DRAFT_STORAGE}:${id}`) ?? '').slice(0, 4000) } catch { return '' }
}

/** Leaving a thread on purpose is not continuity — drop the resume pointer so
 *  the next reload lands on the list the user asked for. */
function forgetStoredSession() {
  try { localStorage.removeItem(SESSION_STORAGE) } catch { /* nothing to clear */ }
}

/**
 * A rejected fetch (offline, DNS failure, TLS reset, connection dropped
 * mid-stream) is a different failure from an HTTP error the server answered
 * with. It gets its own copy and its own retry, so the composer is never left
 * looking alive while sends silently evaporate.
 */
function isOffline(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null
  if (!err) return false
  return err.name === 'TypeError' || /failed to fetch|network\s?error|load failed|network request failed|err_(?:internet|network|connection)/i.test(err.message ?? '')
}

const offlineNotice = 'Connection lost — your message is saved below. Check the connection, then retry.'

async function* readSse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        const lines = frame.split('\n')
        const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')
        if (data) yield { event, data: JSON.parse(data) as { ok?: boolean; error?: string; reply?: string; messages?: Message[] } }
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
}

function MessageBody({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  if (message.role === 'tool') return <div className={styles.tool}>
    <Button className={shellStyles.toolChip} aria-expanded={open} onClick={() => setOpen(v => !v)}>{message.toolName || 'Tool output'} {open ? '−' : '+'}</Button>
    {open && <pre>{message.content}</pre>}
  </div>
  return <Markdown text={message.content || ''} />
}

export default function ChatConsole() {
  const [index, setIndex] = useState<Index | null>(null)
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload(v => v + 1), [])
  const [profile, setProfile] = useState('')
  const [q, setQ] = useState('')
  const [device, setDevice] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [source, setSource] = useState('')
  const [filters, setFilters] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [stage, setStage] = useState<'roster' | 'conversations' | 'thread'>('roster')
  const [target, setTarget] = useState<Target | null>(null)
  const [thread, setThread] = useState<Message[]>([])
  const [messageLimit, setMessageLimit] = useState(MESSAGE_PAGE_SIZE)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [threadRetry, setThreadRetry] = useState(0)
  const [composer, setComposer] = useState('')
  const [mode, setMode] = useState('chat')
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([])
  const [modelPick, setModelPick] = useState('')
  const [modelsLoading, setModelsLoading] = useState(true)
  const [handoffs, setHandoffs] = useState<Record<string, { task: string; report: HandoffReport }[]>>({})
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [sendError, setSendError] = useState('')
  const [connectionLost, setConnectionLost] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [remoteComplete, setRemoteComplete] = useState(false)
  const [settings, setSettings] = useState(false)
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityRetry, setAvailabilityRetry] = useState(0)
  const [management, setManagement] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'sessions' | 'bots'>('bots')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const messagesEl = useRef<HTMLDivElement>(null)
  const earlierScroll = useRef<{ height: number; top: number } | null>(null)
  const requestKey = useRef('')
  const threadRevision = useRef(0)
  const threadRequest = useRef<AbortController | null>(null)
  const sendRequest = useRef<AbortController | null>(null)
  const deepLink = useRef<{ session: string; profile: string; device: string; agent: Agent } | null>(null)
  const restored = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const preset = params.get('profile') || ''
    if (preset) { setProfile(preset); setStage('conversations') }
    if (params.get('session')) deepLink.current = { session: params.get('session')!, profile: preset, device: params.get('device') || '', agent: params.get('agent') === 'pi' ? 'pi' : 'hermes' }
    return () => { threadRequest.current?.abort(); sendRequest.current?.abort() }
  }, [])

  // Size to the actual visual viewport, including Android keyboard/pan changes.
  // The shell owns navigation; reserve only the space its visible bottom bar occupies.
  useEffect(() => {
    const page = root.current?.parentElement
    if (!page) return
    let frame = 0
    const fit = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const viewport = window.visualViewport
        const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0)
        const keyboardOpen = Boolean(viewport && viewport.height < window.innerHeight - 80)
        // PageHeader is rendered by the shared shell (its module class is
        // `pageHeader`, not the old chat-local `pageHead`).  Reclaim it while
        // the IME is open; leaving the header in the flex track makes the
        // composer overflow the visible viewport even when the page height is
        // fitted to visualViewport.
        const pageHeader = page.querySelector<HTMLElement>('[class*="pageHeader"]')
        if (pageHeader) pageHeader.style.display = keyboardOpen ? 'none' : ''
        const nav = document.querySelector<HTMLElement>('[data-mobile-nav]')
        const navRect = nav?.getBoundingClientRect()
        const reserve = nav && navRect && getComputedStyle(nav).display !== 'none' && navRect.top < bottom
          ? Math.min(bottom - navRect.top, navRect.height)
          : 0
        page.style.height = `${Math.max(0, bottom - page.getBoundingClientRect().top - reserve)}px`
      })
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    window.addEventListener('pageshow', fit)
    document.addEventListener('visibilitychange', fit)
    window.visualViewport?.addEventListener('resize', fit)
    window.visualViewport?.addEventListener('scroll', fit)
    const observer = new ResizeObserver(fit)
    const nav = document.querySelector('[data-mobile-nav]')
    if (nav) observer.observe(nav)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
      window.removeEventListener('pageshow', fit)
      document.removeEventListener('visibilitychange', fit)
      window.visualViewport?.removeEventListener('resize', fit)
      window.visualViewport?.removeEventListener('scroll', fit)
      observer.disconnect()
      const pageHeader = page.querySelector<HTMLElement>('[class*="pageHeader"]')
      if (pageHeader) pageHeader.style.removeProperty('display')
      page.style.removeProperty('height')
    }
  }, [])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    setAvailabilityError('')
    void (async () => {
      try {
        const response = await apiFetch('/api/chat', { signal: controller.signal })
        if (!response.ok) throw new Error(`Agent availability could not be loaded (${response.status})`)
        const data = await response.json()
        if (alive) setAgents(data.agents || [])
      } catch (e) { if (alive) setAvailabilityError(isOffline(e) ? 'Connection lost — agent availability could not be checked. Retry when you are back online.' : (e as Error).message) }
    })()
    return () => { alive = false; controller.abort() }
  }, [availabilityRetry])

  // Model selection is a UI preference only. The catalogue is optional: if it
  // is unavailable, the agent's configured default remains the chat default.
  useEffect(() => {
    try { setModelPick(localStorage.getItem(MODEL_STORAGE) || '') } catch { /* default remains usable */ }
    const controller = new AbortController()
    void apiFetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('model catalogue unavailable')
        return response.json() as Promise<{ groups?: ModelGroup[] }>
      })
      .then(data => setModelGroups(Array.isArray(data.groups) ? data.groups.filter(group => Array.isArray(group.models) && group.models.length > 0) : []))
      .catch(() => { /* model picker is an enhancement; default chat still works */ })
      .finally(() => setModelsLoading(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    setListLoading(true); setListError('')
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (profile) params.set('profile', profile)
        if (device) params.set('device', device)
        if (agentFilter) params.set('agent', agentFilter)
        const response = await apiFetch(`/api/conversations?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `Could not load conversations (${response.status})`)
        if (alive) setIndex({ conversations: data.conversations ?? [], devices: data.devices ?? [], profiles: data.profiles ?? [] })
      } catch (e) { if (alive) setListError(isOffline(e) ? 'Connection lost — the conversation archive could not be reached. Retry when you are back online.' : (e as Error).message) }
      finally { if (alive) setListLoading(false) }
    }, q ? 250 : 0)
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [q, profile, device, agentFilter, reload])
  useEffect(() => { const timer = setInterval(refresh, 20_000); return () => clearInterval(timer) }, [refresh])
  useEffect(() => setLimit(PAGE_SIZE), [q, profile, device, agentFilter, source, showEmpty])

  const selectTarget = useCallback((next: Target) => {
    if (busyRef.current) return
    threadRequest.current?.abort()
    requestKey.current = keyOf(next)
    setTarget(next); setThread([]); setMessageLimit(MESSAGE_PAGE_SIZE); setThreadError(''); setSendError(''); setConnectionLost(false)
    setComposer(next.draft ? '' : readDraft(next.id))
    setSidebarTab('sessions'); setMode('chat'); setInitialized(false); setRemoteComplete(false); setSettings(false); setAtBottom(true)
    setThreadLoading(!next.draft); setStage('thread')
  }, [])
  const openThread = useCallback((c: Conversation) => selectTarget({ id: c.id, profile: c.profile, device: c.device, agent: c.agent || 'hermes', title: cleanTitle(c.title) || 'Conversation', model: c.model }), [selectTarget])

  useEffect(() => {
    if (!index || listLoading || listError) return
    // One shot: the archive refreshes every 20s, and re-running this after the
    // user deliberately went back to the list would trap them in the thread.
    if (restored.current) return
    restored.current = true
    // A deep link wins; otherwise fall back to the conversation the user last
    // had open, so a reload resumes the thread instead of the roster.
    const link = deepLink.current
    if (link) {
      deepLink.current = null
      const found = index.conversations.find(c => c.id === link.session && (!link.profile || c.profile === link.profile) && (!link.device || c.device === link.device) && (c.agent || 'hermes') === link.agent)
      if (found) { setProfile(found.profile); openThread(found) }
      else if (link.profile) selectTarget({ id: link.session, profile: link.profile, device: link.device, agent: link.agent, title: 'Conversation' })
      else { setStage('conversations'); setListError('The linked conversation was not found. Search the archive or choose a bot.') }
      return
    }
    const saved = readStoredSession()
    if (!saved) return
    // Only resume a conversation the archive still knows about; a deleted or
    // renamed thread falls back to the list rather than an error screen.
    const found = index.conversations.find(c => c.id === saved.id && (c.agent || 'hermes') === saved.agent && c.profile === saved.profile && c.device === saved.device)
    if (!found) return
    setProfile(found.profile)
    openThread(found)
    if (saved.mode !== 'chat') setMode(saved.mode)
  }, [index, listLoading, listError, openThread, selectTarget])

  // Remember the open thread (and its mode) across reloads and WebView resumes.
  useEffect(() => {
    if (!target || target.draft) return
    try {
      localStorage.setItem(SESSION_STORAGE, JSON.stringify({ agent: target.agent, device: target.device, profile: target.profile, id: target.id, mode }))
    } catch { /* the archive list still works without continuity */ }
  }, [target, mode])

  // Keep unsent text per conversation, in this tab only.
  useEffect(() => {
    if (!target) return
    const key = `${DRAFT_STORAGE}:${target.id}`
    try {
      if (composer) sessionStorage.setItem(key, composer.slice(0, 4000))
      else sessionStorage.removeItem(key)
    } catch { /* the in-memory composer still works */ }
  }, [composer, target])

  useEffect(() => {
    if (!target || target.draft) return
    const key = keyOf(target)
    const controller = new AbortController()
    threadRequest.current = controller
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async (initial: boolean) => {
      if (busyRef.current) { timer = setTimeout(() => void load(false), THREAD_POLL_MS); return }
      const revision = threadRevision.current
      try {
        const params = new URLSearchParams({ profile: target.profile, device: target.device, agent: target.agent })
        const response = await apiFetch(`/api/conversations/${encodeURIComponent(target.id)}?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `Could not load this conversation (${response.status})`)
        // Key, lifetime and sending guards apply to success, errors and loading state.
        if (alive && requestKey.current === key && revision === threadRevision.current && !busyRef.current) {
          const nextMessages = (data.messages ?? []) as Message[]
          setThread(current => sameMessages(current, nextMessages) ? current : nextMessages)
          setThreadError('')
        }
      } catch (e) { if (alive && requestKey.current === key && revision === threadRevision.current && !busyRef.current) setThreadError(isOffline(e) ? 'Connection lost — this conversation could not be loaded. Check the connection, then retry.' : (e as Error).message) }
      finally {
        if (alive && requestKey.current === key) { if (initial) setThreadLoading(false); timer = setTimeout(() => void load(false), THREAD_POLL_MS) }
      }
    }
    setThreadLoading(true); setThreadError('')
    void load(true)
    return () => { alive = false; controller.abort(); clearTimeout(timer) }
  }, [target, threadRetry])

  useEffect(() => {
    const el = messagesEl.current
    if (el && atBottom) el.scrollTop = el.scrollHeight
  }, [thread, handoffs, threadLoading, busy, atBottom])
  useLayoutEffect(() => {
    const el = messagesEl.current
    const snapshot = earlierScroll.current
    if (!el || !snapshot) return
    el.scrollTop = snapshot.top + el.scrollHeight - snapshot.height
    earlierScroll.current = null
  }, [messageLimit])
  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const selectBot = (name: string, canonicalSessionId?: string | null) => {
    if (busyRef.current) return
    forgetStoredSession()
    setSidebarTab('sessions')
    setProfile(name); setQ(''); setSource(''); setDevice(''); setAgentFilter(''); setStage('conversations')
    if (canonicalSessionId) {
      selectTarget({ id: canonicalSessionId, profile: name, device: '', agent: 'hermes', title: 'Bot Chat' })
    } else {
      setTarget(null); requestKey.current = ''; threadRequest.current?.abort(); setThread([]); setComposer('')
    }
  }
  const newChat = () => selectTarget({ id: crypto.randomUUID(), profile: profile || index?.profiles[0] || 'default', device: '', agent: 'hermes', title: 'New conversation', draft: true })
  const remote = Boolean(target?.agent === 'hermes' && target?.device && index?.devices.some(d => d.name === target.device && !d.isLocal))
  const modelOptions = modelGroups.flatMap(group => group.models)
  const pickedModel = modelOptions.find(model => optionKey(model) === modelPick) ?? null
  // Hermes is the only adapter with model/provider support. Remote Hermes uses
  // the same validated flags over the existing conversation SSE bridge;
  // Pi/Codex and Herdr keep their existing defaults explicitly disabled here.
  const modelSelectionSupported = Boolean(target?.agent === 'hermes' && mode === 'chat')
  const localAvailable = agents.some(a => a.id === target?.agent && a.enabled && a.available)
  const available = mode === 'codex' ? agents.some(a => a.id === 'codex' && a.enabled && a.available) : remote || mode === 'herdr' || localAvailable
  const canCompose = Boolean(target && !threadLoading && !threadError && !remoteComplete)
  const back = () => {
    if (busyRef.current) return
    forgetStoredSession()
    setStage('conversations'); setTarget(null); requestKey.current = ''; threadRequest.current?.abort()
    setThread([]); setComposer(''); setSendError(''); setConnectionLost(false)
  }

  async function send() {
    const text = composer.trim()
    if (!target || !text || busyRef.current || !canCompose || !available) return
    busyRef.current = true; threadRevision.current += 1; setBusy(true); setSendError('')
    const current = target
    const controller = new AbortController(); sendRequest.current = controller
    const message: Message = { id: Date.now(), role: 'user', content: text, timestamp: Date.now() }
    if (mode !== 'codex') setThread(items => [...items, message])
    setComposer('')
    try {
      if (mode === 'codex') {
        const response = await apiFetch('/api/handoff', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: current.id, agent: 'codex', task: text, sourceAgent: current.agent, profile: current.profile, device: current.device }) })
        const report = await response.json()
        if (!response.ok) throw new Error(report.error || 'Codex handoff failed')
        const key = keyOf(current)
        setHandoffs(all => ({ ...all, [key]: [...(all[key] || []), { task: text, report }] }))
        setAtBottom(true)
        return
      }
      let reply = ''
      let replacement: Message[] | undefined
      if (mode === 'herdr') {
        const response = await apiFetch('/api/herdr/agent', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'continue-chat', session: current.id, profile: current.profile, text }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Herdr continuation failed')
        reply = `Herdr terminal snapshot (may include prompt and prior output):\n${data.terminalText || ''}`
      } else if (remote) {
        const response = await apiFetch(current.draft ? '/api/conversations/new' : `/api/conversations/${encodeURIComponent(current.id)}`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, profile: current.profile, device: current.device, ...(pickedModel ? { model: pickedModel.id, provider: pickedModel.provider } : {}) }) })
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Send failed') }
        if (!response.body) throw new Error('No response stream received')
        let completed = false
        for await (const event of readSse(response.body)) {
          if (event.event !== 'done') continue
          if (!event.data.ok) throw new Error(event.data.error || 'Send failed')
          completed = true; reply = event.data.reply || ''; replacement = event.data.messages
        }
        if (!completed) throw new Error('Connection ended before the agent finished. Check the conversation before retrying.')
        // The remote creation contract returns no session ID. Require selection
        // from the authoritative list before continuing, never silently start another chat.
        if (current.draft) setRemoteComplete(true)
      } else {
        const response = await apiFetch('/api/chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: current.agent, session: current.id, createSession: Boolean(current.draft && !initialized), message: text, profile: current.agent === 'hermes' ? current.profile : undefined, ...(pickedModel && modelSelectionSupported ? { model: pickedModel.id, provider: pickedModel.provider } : {}) }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Send failed')
        reply = data.reply || ''; setInitialized(true)
      }
      if (requestKey.current === keyOf(current)) {
        if (replacement) setThread(replacement)
        else setThread(items => [...items, { id: Date.now(), role: mode === 'herdr' ? 'tool' : 'assistant', content: reply, timestamp: Date.now() }])
        setAtBottom(true)
      }
    } catch (e) {
      if (!controller.signal.aborted && requestKey.current === keyOf(current)) {
        setThread(items => items.filter(item => item !== message)); setComposer(text)
        // A dropped connection is not the agent refusing: keep the text, say
        // so plainly, and offer the retry the user actually wants.
        const offline = isOffline(e)
        setConnectionLost(offline)
        setSendError(offline ? offlineNotice : (e as Error).message)
      }
    } finally {
      busyRef.current = false; setBusy(false); sendRequest.current = null; refresh()
    }
  }

  const filtered = useMemo(() => (index?.conversations || []).filter(c => (!profile || c.profile === profile) && (!source || c.source === source)), [index, profile, source])
  // Count independently of visibility, so Show empty can always be switched off.
  const emptyCount = filtered.filter(isJunk).length
  const visible = showEmpty ? filtered : filtered.filter(c => !isJunk(c))
  const hiddenMessageCount = Math.max(0, thread.length - messageLimit)
  const visibleThread = hiddenMessageCount ? thread.slice(hiddenMessageCount) : thread
  const sources = Array.from(new Set((index?.conversations || []).map(c => c.source).filter(Boolean)))
  const changeDraft = (changes: Partial<Target>) => {
    if (!target || busyRef.current || initialized) return
    const next = { ...target, ...changes, id: crypto.randomUUID() }
    requestKey.current = keyOf(next); setTarget(next)
  }
  const sessionDetails = target && management === target.profile ? <section className={styles.stack}>
    <h3>Current conversation</h3><p>Session: <code>{target.id}</code></p><p>Agent: {target.agent}</p><p>Device: {target.device || 'Local'}</p>
    {target.agent === 'hermes' && !remote && <ChatContinuityFooter session={target.id} profile={target.profile} />}
    {!target.draft && !remote && <Button disabled={busy || !agents.some(a => a.id === 'codex' && a.enabled && a.available)} onClick={() => { setMode('codex'); setManagement(null) }}>Use composer for Codex handoff</Button>}
  </section> : undefined

  return <div ref={root} className={`${styles.console} ${shellStyles.shell}`} data-stage={stage}>
    <LiveChatMirror onActivity={refresh} />
    <Card className={`${styles.rail} ${shellStyles.sidebar} ${sidebarExpanded ? shellStyles.sidebarExpanded : ''}`}>
      <nav className={shellStyles.sidebarTabs} aria-label="Chat navigation" role="tablist">
        <Button className={shellStyles.sidebarTab} active={sidebarTab === 'sessions'} role="tab" aria-selected={sidebarTab === 'sessions'} onClick={() => { setSidebarTab('sessions'); setSidebarExpanded(true); setStage('conversations') }}>
          <span className={shellStyles.sidebarTabIcon} aria-hidden="true">◈</span><span className={shellStyles.sidebarTabLabel}>SESSIONS</span>
        </Button>
        <Button className={shellStyles.sidebarTab} active={sidebarTab === 'bots'} role="tab" aria-selected={sidebarTab === 'bots'} onClick={() => { setSidebarTab('bots'); setSidebarExpanded(true); setStage('roster') }}>
          <span className={shellStyles.sidebarTabIcon} aria-hidden="true">◎</span><span className={shellStyles.sidebarTabLabel}>BOTS</span>
        </Button>
        <Button className={shellStyles.railClose} aria-label="Collapse chat sidebar" onClick={() => setSidebarExpanded(false)}>×</Button>
      </nav>
      <div className={shellStyles.sidebarBody}>
        {sidebarTab === 'bots' ? <div className={`${styles.rosterPane} ${shellStyles.botPane}`}>
          <div className={shellStyles.terminalLabel}>~/bots</div>
          <BotsPanel selected={profile} onSelect={selectBot} disabled={busy} management={management} onManage={setManagement} details={sessionDetails} />
        </div> : <section className={`${styles.conversations} ${shellStyles.sessionPane}`} aria-label="Conversations">
          <div className={`${styles.sectionHead} ${shellStyles.paneHead}`}><div><span className={shellStyles.terminalLabel}>~/group-chats</span><h2>{profile || 'All conversations'}</h2></div><Button variant="primary" disabled={busy} onClick={newChat}>New chat</Button></div>
        <div className={`${styles.search} ${shellStyles.searchBar}`}>
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search bots and group chats…" aria-label="Search bots and group chats" />
          <Button aria-expanded={filters} aria-controls="chat-filters" onClick={() => setFilters(v => !v)} active={filters}>Filters</Button>
        </div>
        {filters && <div id="chat-filters" className={styles.filters}>
          <Field label="Agent"><Select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}><option value="">All agents</option><option value="hermes">Hermes</option><option value="pi">Pi</option><option value="codex">Codex</option></Select></Field>
          <Field label="Profile"><Select value={profile} disabled={busy} onChange={e => setProfile(e.target.value)}><option value="">All profiles</option>{index?.profiles.map(p => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Device"><Select value={device} onChange={e => setDevice(e.target.value)}><option value="">All devices</option>{index?.devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}</Select></Field>
          <Field label="Source"><Select value={source} onChange={e => setSource(e.target.value)}><option value="">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</Select></Field>
          <Button active={showEmpty} onClick={() => setShowEmpty(v => !v)}>{showEmpty ? 'Hide empty' : 'Show empty'} ({emptyCount})</Button>
          <Button onClick={() => { setDevice(''); setAgentFilter(''); setSource(''); setShowEmpty(false); setQ('') }}>Reset filters</Button>
        </div>}
        <div className={styles.conversationList} aria-busy={listLoading}>
          {listError ? <div role="alert" className={styles.notice}><p>{listError}</p><Button onClick={refresh}>Retry</Button></div> : listLoading && !index ? <p className={styles.notice} role="status">Loading conversations…</p> : <>
            {visible.slice(0, limit).map(c => <Row key={keyOf(c)} className={`${styles.conversationRow} ${shellStyles.sessionRow}`} title={<Button className={`${styles.conversationButton} ${shellStyles.sessionButton}`} disabled={busy} active={Boolean(target && keyOf(c) === keyOf(target))} onClick={() => openThread(c)}>
              <span className={styles.rowTop}><span className={shellStyles.rowMarker} aria-hidden="true">{target && keyOf(c) === keyOf(target) ? '>' : ' '}</span><strong>{cleanTitle(c.title) || 'Untitled conversation'}</strong><span className={styles.rowMeta}>{ago(c.lastActiveAt)}</span></span>
              <span className={styles.preview}>{c.preview || 'No messages yet'}</span>
              <span className={styles.rowMeta}>{c.active ? 'Active · ' : ''}{profile ? c.source : c.profile}{c.device ? ` · ${c.device}` : ''}</span>
            </Button>} />)}
            {!listLoading && visible.length === 0 && <p className={styles.notice}>{q || source || device || agentFilter ? 'No matching conversations. Try changing the search or filters.' : emptyCount && !showEmpty ? 'Only empty conversations. Use Filters → Show empty to see them.' : 'No conversations yet. Start a new chat.'}</p>}
            {visible.length > limit && <Button onClick={() => setLimit(v => v + PAGE_SIZE)}>Show more conversations</Button>}
          </>}
        </div>
        <div className={styles.mobileBack}><Button disabled={busy} onClick={() => { setSidebarTab('bots'); setStage('roster') }}>‹ Bots</Button></div>
        </section>}
      </div>
    </Card>
    <Card className={`${styles.threadPane} ${shellStyles.thread}`} aria-label="Conversation">
      {target ? <>
        <div className={`${styles.threadHead} ${shellStyles.threadHeader}`}><div><h2>{target.title}</h2><div className={shellStyles.identityLine}><span className={shellStyles.avatarDot} data-status={busy ? 'busy' : available ? 'running' : 'stopped'} aria-hidden="true" /> <span>{target.profile}</span><Select className={shellStyles.modelPicker} value={modelPick} disabled={busy || modelsLoading || !modelSelectionSupported} onChange={event => {
          const next = event.target.value
          setModelPick(next)
          try {
            if (next) localStorage.setItem(MODEL_STORAGE, next)
            else localStorage.removeItem(MODEL_STORAGE)
          } catch { /* the current pick still applies in memory */ }
        }} aria-label="AI model for this chat" title={!modelSelectionSupported ? 'Model selection is unavailable for this destination' : 'AI model for this chat'}>
          <option value="">{modelsLoading ? 'Loading models…' : `MODEL · ${target.model || `${target.agent} default`}`}</option>
          {modelGroups.map(group => <optgroup key={group.label} label={group.label}>{group.models.map(model => <option key={optionKey(model)} value={optionKey(model)}>{model.id}{model.provider ? ` · ${model.provider}` : ''}{model.note ? ` · ${model.note}` : ''}</option>)}</optgroup>)}
        </Select></div></div><IconButton aria-label={`Manage ${target.profile} and session details`} disabled={busy} onClick={() => setManagement(target.profile)}>⋯</IconButton></div>
        {target.draft && !initialized && !remoteComplete && <div className={styles.draftSettings}>
          <Button aria-expanded={settings} aria-controls="new-chat-options" disabled={busy} onClick={() => setSettings(v => !v)}>Chat options</Button>
          {settings && <div id="new-chat-options" className={styles.filters}>
            <Field label="Profile"><Select value={target.profile} disabled={busy} onChange={e => changeDraft({ profile: e.target.value })}>{Array.from(new Set([target.profile, ...(index?.profiles || [])])).map(p => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Agent"><Select value={target.agent} disabled={busy} onChange={e => changeDraft({ agent: e.target.value as Agent, device: '' })}><option value="hermes">Hermes</option><option value="pi" disabled={!agents.some(a => a.id === 'pi' && a.enabled && a.available)}>Pi</option></Select></Field>
            {target.agent === 'hermes' && <Field label="Device"><Select value={target.device} disabled={busy} onChange={e => changeDraft({ device: e.target.value })}><option value="">Local</option>{index?.devices.filter(d => !d.isLocal).map(d => <option key={d.name} value={d.name}>{d.name}</option>)}</Select></Field>}
          </div>}
        </div>}
        <div ref={messagesEl} className={`${styles.messages} ${shellStyles.messageStream}`} role="log" aria-label="Messages" aria-live="polite" aria-busy={threadLoading} onScroll={() => { const el = messagesEl.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100) }}>
          {threadLoading && <p role="status">Loading conversation…</p>}
          {threadError && <div role="alert" className={styles.notice}><p>{threadError}</p><Button onClick={() => setThreadRetry(v => v + 1)}>Retry</Button></div>}
          {!threadLoading && !threadError && thread.length === 0 && <p className={styles.emptyThread}>{target.draft ? `What would you like to ask ${target.profile}?` : 'No messages in this conversation yet.'}</p>}
          {hiddenMessageCount > 0 && <Button className={styles.earlier} onClick={() => {
            const el = messagesEl.current
            if (el) earlierScroll.current = { height: el.scrollHeight, top: el.scrollTop }
            setMessageLimit(value => value + MESSAGE_PAGE_SIZE)
          }}>Show earlier messages ({hiddenMessageCount})</Button>}
          {visibleThread.map((m, i) => <article key={`${m.id}:${hiddenMessageCount + i}`} className={`${styles.message} ${shellStyles.messageCard} ${m.role === 'user' ? styles.userMessage : styles.agentMessage}`}>
            <div className={styles.messageMeta}><span>{m.role === 'user' ? 'You' : m.role === 'assistant' ? target.profile : m.role === 'tool' ? 'Tool' : 'System'}</span><time dateTime={new Date(m.timestamp).toISOString()}>{new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
            <MessageBody message={m} />
          </article>)}
          {(handoffs[keyOf(target)] || []).map((handoff, i) => <Card key={i} pad="sm" className={styles.handoff} role="status" aria-label="handoff result" data-handoff-state={handoff.report.ok ? 'done' : 'failed'}>
            <strong>Handoff result · Codex · {handoff.report.ok ? 'Done' : 'Failed'}</strong>
            <p>New agent context seeded from this conversation; this is not a resumed session.</p>
            <p>{handoff.task}</p><p>Process exit code: {handoff.report.exitCode ?? 'unavailable'}. Process evidence does not verify task completion.</p>
            <h3>Repository diff evidence</h3><pre>{handoff.report.diffStat || 'No diff reported'}</pre>
            <h3>Output tail</h3><pre>{handoff.report.outputTail || 'No output'}</pre>
          </Card>)}
          {busy && <p role="status">Waiting for {mode === 'codex' ? 'Codex' : mode === 'herdr' ? 'Herdr' : target.profile}… {elapsed}s</p>}
        </div>
        {!atBottom && <Button className={`${styles.latest} ${shellStyles.latestJump}`} onClick={() => setAtBottom(true)}>↓ Latest messages</Button>}
        <form className={`${styles.composer} ${shellStyles.composerBar}`} onSubmit={e => { e.preventDefault(); void send() }}>
          <div className={`${styles.composerTools} ${shellStyles.composerTools}`}>
            <Button disabled={busy} aria-describedby={busy ? 'chat-send-status' : undefined} onClick={back} aria-label="Back to conversations">‹ Conversations</Button>
            {((target.agent === 'hermes' && !remote && (!target.draft || initialized)) || mode === 'codex') && <fieldset disabled={busy} className={styles.mode} aria-label="Message destination"><Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'chat', label: 'Chat' }, ...(target.agent === 'hermes' ? [{ value: 'herdr', label: 'Herdr' }] : []), ...(mode === 'codex' ? [{ value: 'codex', label: 'Codex' }] : [])]} /></fieldset>}
            {busy && <span className={shellStyles.busyChip} aria-hidden="true">● {mode === 'codex' ? 'Codex' : mode === 'herdr' ? 'Herdr' : target.profile} · {elapsed}s</span>}
          </div>
          <p id="chat-composer-hint" className={styles.muted}>Enter sends · Shift+Enter adds a line.</p>
          {busy && <p id="chat-send-status" className={styles.muted} role="status">Navigation is paused while your message sends.</p>}
          {availabilityError && <div role="alert" className={styles.inlineNotice}>{availabilityError}<Button onClick={() => setAvailabilityRetry(v => v + 1)}>Retry</Button></div>}
          {!available && !availabilityError && <p className={styles.muted}>This agent is unavailable. <Button onClick={() => setAvailabilityRetry(v => v + 1)}>Retry availability</Button></p>}
          {sendError && <p role="alert" className={styles.error}>{sendError} Your message is kept below; check the thread before sending again. {connectionLost && <Button onClick={() => { setSendError(''); setConnectionLost(false); void send() }}>Retry</Button>}</p>}
          {mode === 'codex' && <p className={styles.muted}>Send a task to Codex with a brief from this conversation.</p>}
          {remoteComplete && <p role="status">Conversation created. Open it from Conversations to continue.</p>}
          <div className={`${styles.composerInput} ${shellStyles.composerRow}`}>
            <span className={shellStyles.composerPrompt} aria-hidden="true">&gt;</span>
            <TextArea value={composer} onChange={e => setComposer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} rows={2} maxLength={remote && mode === 'chat' ? 8000 : 4000} disabled={busy || !canCompose} aria-label="Message" aria-describedby="chat-composer-hint" placeholder={mode === 'codex' ? 'Task for Codex…' : mode === 'herdr' ? 'Continue this chat in Herdr…' : 'Message…'} />
            <Button className={shellStyles.composerAffordance} type="button" disabled aria-label="Voice input unavailable">⌁</Button>
            <Button variant="primary" type="submit" disabled={!composer.trim() || !canCompose || !available} loading={busy}>Send</Button>
          </div>
        </form>
      </> : <div className={styles.emptyThread}><h2>Choose a conversation</h2><p>Select a bot to pick up where you left off.</p><Button variant="primary" onClick={newChat}>New chat</Button></div>}
    </Card>
  </div>
}
