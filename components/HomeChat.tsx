'use client'

import { AsciiMsg, AsciiPromptGutter } from '@/components/ascii-msg'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import { HoloRing } from './HoloRing'
import { SectionRule } from './ui'
import styles from './HomeWorkspace.module.css'
import { apiFetch } from '@/lib/api-base'

type Message = { role: 'user' | 'assistant'; content: string; timestamp?: number }
const STORAGE = 'mc-home-chat-v1'
/** Keep the landing copy easy to tune: one dry operational readout per line. */
export const WELCOME_INTROS: string[] = [
  'Everything is synced. Ask, dispatch, or drill in — the bridge is listening.',
  'Systems nominal. The anomalies have been filed under “later.”',
  'The bridge is quiet, which is usually when it gets interesting.',
  'Telemetry is green. This is not a personality assessment.',
  'All channels are open. Please use one at a time.',
  'Mission Control is ready, pending a mission and a reasonable premise.',
  'I checked the queue. It has opinions, but no actionable items.',
  'Your operational horizon is clear. The paperwork remains undefeated.',
  'Nothing is on fire. I have checked the usual places.',
  'The systems are synchronized and mildly suspicious.',
  'You may proceed. I will document the consequences.',
  'The command deck awaits input and has no strong feelings about it.',
]
const INTRO_STORAGE = 'mc-home-intro'
/** The model pick is a standing preference, so it lives in localStorage rather
 *  than the per-tab chat session: choosing a model once should survive a reload
 *  and apply to the next chat too. */
const MODEL_STORAGE = 'mc.chat.model'
type ModelOption = { id: string; provider?: string; note?: string }
type ModelGroup = { label: string; models: ModelOption[] }
const QUICK_PROMPTS = [
  'Summarize what needs attention',
  'Show my active and pending tasks',
  'Run a system health check',
  'Dispatch a Codex agent for urgent work',
]
// getRandomValues also works on the phone's plain-HTTP LAN connection.
const createSession = () => `home-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
const randomIntroIndex = (current?: number) => {
  let next = Math.floor(Math.random() * WELCOME_INTROS.length)
  if (WELCOME_INTROS.length > 1 && next === current) next = (next + 1) % WELCOME_INTROS.length
  return next
}

/** One key per pick: the provider is part of the identity because the same id
 *  can exist on two providers. */
const optionKey = (model: ModelOption) => `${model.provider ?? ''}::${model.id}`

export function HomeChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [session, setSession] = useState('')
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const [welcomeIntro, setWelcomeIntro] = useState<number | null>(null)
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [pick, setPick] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [highlightedPick, setHighlightedPick] = useState('')
  const lock = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLSpanElement>(null)
  const pickerTrigger = useRef<HTMLButtonElement>(null)
  const following = useRef(true)

  const storeWelcomeIntro = (index: number) => {
    setWelcomeIntro(index)
    try { sessionStorage.setItem(INTRO_STORAGE, String(index)) } catch { /* the current pick still works */ }
  }

  useEffect(() => {
    let saved: { session?: string; messages?: Message[]; draft?: string } = {}
    try { saved = JSON.parse(sessionStorage.getItem(STORAGE) || '{}') || {} } catch { /* storage may be unavailable */ }
    let savedIntro: number | null = null
    try {
      const rawIntro = sessionStorage.getItem(INTRO_STORAGE)
      const parsedIntro = rawIntro === null ? NaN : Number(rawIntro)
      if (Number.isInteger(parsedIntro) && parsedIntro >= 0 && parsedIntro < WELCOME_INTROS.length) savedIntro = parsedIntro
    } catch { /* storage may be unavailable */ }
    storeWelcomeIntro(savedIntro ?? randomIntroIndex())
    try { setPick(localStorage.getItem(MODEL_STORAGE) || '') } catch { /* the agent default still applies */ }
    setSession(typeof saved.session === 'string' && /^home-[a-zA-Z0-9-]{1,40}$/.test(saved.session) ? saved.session : createSession())
    if (Array.isArray(saved.messages)) setMessages(saved.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-100))
    if (typeof saved.draft === 'string') setDraft(saved.draft.slice(0, 4000))
    setNow(new Date())
    setReady(true)
    const controller = new AbortController()
    void apiFetch('/api/chat', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to check chat availability'); return r.json() })
      .then(data => setAvailable(Boolean(data.available)))
      .catch(e => { if (e.name !== 'AbortError') setError('Could not check the agent connection. You can still try sending a message.') })
    // The picker is an enhancement: if the catalogue is unavailable the chat
    // still works on the agent's own default, so a failure here stays silent.
    void apiFetch('/api/models', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('models unavailable'); return r.json() })
      .then(data => { if (Array.isArray(data?.groups)) setGroups(data.groups.filter((g: ModelGroup) => Array.isArray(g.models) && g.models.length > 0)) })
      .catch(() => { /* no picker this session */ })
    return () => { controller.abort(); abort.current?.abort() }
  }, [])

  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(STORAGE, JSON.stringify({ session, messages: messages.slice(-100), draft })) } catch { /* in-memory chat still works */ }
  }, [session, messages, draft, ready])

  useEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, busy])

  const options = groups.flatMap(group => group.models)
  const picked = options.find(model => optionKey(model) === pick) ?? null
  const pickerKeys = ['', ...options.map(optionKey)]
  const pickerDisabled = busy || !ready || available === false
  const highlightedIndex = Math.max(0, pickerKeys.indexOf(highlightedPick))

  useEffect(() => {
    if (pickerDisabled) {
      setPickerOpen(false)
      return
    }
    if (!pickerOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) {
        setPickerOpen(false)
        pickerTrigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [pickerDisabled, pickerOpen])

  const chooseModel = (key: string) => {
    setPick(key)
    try {
      if (key) localStorage.setItem(MODEL_STORAGE, key)
      else localStorage.removeItem(MODEL_STORAGE)
    } catch { /* the pick still applies to this tab */ }
  }

  const selectModel = (key: string) => {
    chooseModel(key)
    setHighlightedPick(key)
    setPickerOpen(false)
    pickerTrigger.current?.focus()
  }

  const movePickerHighlight = (direction: 1 | -1) => {
    const currentKey = pickerOpen ? highlightedPick : (pickerKeys.includes(pick) ? pick : '')
    const index = pickerKeys.indexOf(currentKey)
    const nextIndex = (Math.max(0, index) + direction + pickerKeys.length) % pickerKeys.length
    setHighlightedPick(pickerKeys[nextIndex])
  }

  const send = async (messageOverride?: string) => {
    const message = (messageOverride ?? draft).trim()
    if (!message || lock.current || !ready || available === false) return
    lock.current = true
    // An empty local transcript means this generated session has never been
    // sent to Hermes; the server needs the creation flag for this first turn.
    const createSessionOnSend = messages.length === 0
    setBusy(true); setError(''); setDraft(''); following.current = true
    setMessages(previous => [...previous, { role: 'user', content: message, timestamp: Date.now() }])
    const controller = new AbortController()
    abort.current = controller
    try {
      // The model rides the request, not the shell: the server passes it to the
      // CLI as a per-invocation override, so config.yaml is never rewritten.
      const response = await apiFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session, ...(createSessionOnSend ? { createSession: true } : {}), ...(picked ? { model: picked.id, provider: picked.provider } : {}) }), signal: controller.signal,
      })
      const result = await response.json()
      // Preserve the server's bounded CLI diagnostic verbatim so a failed turn
      // tells the operator what Hermes actually reported, not a second generic
      // "check server logs" message.
      const serverError = typeof result?.error === 'string' && result.error.trim() ? result.error : 'The agent could not reply. Please try again.'
      if (!response.ok || typeof result.reply !== 'string') throw new Error(serverError)
      setMessages(previous => [...previous, { role: 'assistant', content: result.reply, timestamp: Date.now() }])
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Unable to send your message.')
      setMessages(previous => previous.slice(0, -1))
      setDraft(message)
    } finally {
      lock.current = false; setBusy(false); abort.current = null
    }
  }

  const newChat = () => {
    if (lock.current) return
    setMessages([]); setDraft(''); setError(''); setSession(createSession()); storeWelcomeIntro(randomIntroIndex(welcomeIntro ?? undefined))
    input.current?.focus()
  }

  const greeting = now ? (now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening') : 'Welcome back'
  const dateLine = now ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Today'

  const composerForm = (
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send() }}>
      {error && <AsciiMsg who="SYS" side="system" compact className={styles.composerError}><p role="alert">{error}</p></AsciiMsg>}
      {available === false && <AsciiMsg who="SYS" side="system" compact>The configured agent is unavailable. <Link href="/setup">Open Setup</Link></AsciiMsg>}
      <div className="aprompt-line">
        <AsciiPromptGutter empty={draft.length === 0} />
        <textarea ref={input} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Message your agent" placeholder="Message your agent…" rows={2} maxLength={4000} disabled={busy || !ready || available === false} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
        }} />
        <button type="submit" className="aprompt-send" aria-label="Send message" disabled={busy || !ready || !draft.trim() || available === false}>[ SEND ]</button>
      </div>
      <div className={styles.composerHint}>
        <span>{picked ? `Model · ${picked.id}` : 'Connected to your configured agent'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {options.length > 0 && (
            // This wrapper is the only positioning context; its size comes from
            // the fixed trigger, so the absolute menu cannot reflow the composer.
            <span ref={picker} style={{ position: 'relative', display: 'block', width: 'min(190px, 100%)', minWidth: 0, flex: '0 1 190px' }}>
              <button
                ref={pickerTrigger}
                type="button"
                disabled={pickerDisabled}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-controls="home-model-picker"
                aria-label="AI model for this chat"
                title={picked?.id ?? 'agent default'}
                onClick={() => {
                  setHighlightedPick(pickerKeys.includes(pick) ? pick : '')
                  setPickerOpen(open => !open)
                }}
                onKeyDown={event => {
                  if (event.key === 'Escape' && pickerOpen) {
                    event.preventDefault()
                    setPickerOpen(false)
                    pickerTrigger.current?.focus()
                  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    if (!pickerOpen) {
                      setHighlightedPick(pickerKeys.includes(pick) ? pick : '')
                      setPickerOpen(true)
                    }
                    movePickerHighlight(event.key === 'ArrowDown' ? 1 : -1)
                  } else if (event.key === 'Enter' && pickerOpen) {
                    event.preventDefault()
                    selectModel(pickerKeys[highlightedIndex])
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
                  minHeight: 34, padding: '4px 8px',
                  background: 'var(--pt-surface-2)', border: '1px solid var(--pt-border-dim)',
                  borderRadius: 8, color: 'var(--pt-text)', font: 'inherit', fontSize: 11,
                  textAlign: 'left', whiteSpace: 'nowrap', cursor: pickerDisabled ? 'default' : 'pointer',
                }}
              >
                <span aria-hidden="true" style={{ flex: '0 0 auto', color: 'var(--pt-text-dim)', fontSize: 9, letterSpacing: '.12em' }}>MODEL</span>
                <span style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked?.id ?? 'agent default'}</span>
                <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: 13, lineHeight: 1 }}>⌄</span>
              </button>
              {pickerOpen && (
                <span
                  id="home-model-picker"
                  role="listbox"
                  aria-label="AI model for this chat"
                  style={{
                    position: 'absolute', display: 'block', right: 0, bottom: 'calc(100% + 6px)', zIndex: 50,
                    width: '190px', maxWidth: 'calc(100vw - 24px)', maxHeight: 280,
                    overflowY: 'auto', overscrollBehaviorY: 'auto', boxSizing: 'border-box',
                    padding: 6, background: 'var(--pt-surface-2, #07111d)',
                    border: '1px solid var(--pt-border-dim)', borderRadius: 12,
                    boxShadow: '0 12px 28px rgba(0, 0, 0, .35)', color: 'var(--pt-text)',
                    fontFamily: 'var(--pt-font-mono, monospace)', fontSize: 10,
                  }}
                >
                  <span
                    id="home-model-option-0"
                    role="option"
                    aria-selected={pick === ''}
                    data-highlighted={highlightedIndex === 0}
                    onMouseEnter={() => setHighlightedPick('')}
                    onClick={() => selectModel('')}
                    style={{
                      display: 'flex', alignItems: 'center', minHeight: 36, padding: '6px 8px',
                      borderRadius: 7, color: 'var(--pt-text)', cursor: 'pointer',
                      background: highlightedIndex === 0 ? 'rgba(118, 118, 128, .22)' : 'transparent',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>agent default</span>
                    {pick === '' && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
                  </span>
                  {groups.map((group, groupIndex) => (
                    <span key={group.label} style={{ display: 'block' }}>
                      <span style={{ display: 'block', padding: groupIndex === 0 ? '9px 8px 4px' : '11px 8px 4px', color: 'var(--pt-text-dim)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase' }}>{group.label}</span>
                      {group.models.map((model, modelIndex) => {
                        const key = optionKey(model)
                        const optionIndex = modelIndex + 1 + groups.slice(0, groupIndex).reduce((count, current) => count + current.models.length, 0)
                        return <span
                          key={key}
                          id={`home-model-option-${optionIndex}`}
                          role="option"
                          aria-selected={pick === key}
                          data-highlighted={highlightedIndex === optionIndex}
                          onMouseEnter={() => setHighlightedPick(key)}
                          onClick={() => selectModel(key)}
                          style={{
                            display: 'flex', alignItems: 'center', minHeight: 36, padding: '6px 8px',
                            borderRadius: 7, color: 'var(--pt-text)', cursor: 'pointer',
                            background: highlightedIndex === optionIndex ? 'rgba(118, 118, 128, .22)' : 'transparent',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.id}</span>
                          {pick === key && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
                        </span>
                      })}
                    </span>
                  ))}
                </span>
              )}
            </span>
          )}
          <span>{draft.length}/4000</span>
        </span>
      </div>
    </form>
  )

  return <section className={`${styles.chat} amsg-surface amsg-container`} data-empty={messages.length === 0} aria-label="Mission Control chat">
    {messages.length > 0 && <header className={`${styles.chatHeader} srule-home-header`}>
      <SectionRule label="MISSION CONTROL" index={1} />
      <div><span className={styles.connection}><span className={styles.connectionDot} data-status={available === false ? 'unavailable' : available ? 'connected' : 'connecting'} aria-hidden="true" />{available === false ? 'Agent unavailable' : available ? 'Agent connected' : 'Connecting…'}</span></div>
      <div className={styles.chatActions}><Link href="/chat" aria-label="Open chat history">History</Link><button onClick={newChat} disabled={busy || !ready} aria-label="Start a new chat">＋ New chat</button></div>
    </header>}
    <div className={styles.messages} ref={log} role="log" aria-label="Conversation" onScroll={() => {
      const el = log.current
      if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }}>
      {messages.length === 0 && <div className={styles.welcome}>
        <HoloRing />
        <span className={styles.kicker}>PRECIADO TECH · MISSION CONTROL</span>
        <div className={styles.greetingGlow}>
          <div className={styles.halo} aria-hidden="true" />
          <h1>{greeting}, Michael</h1>
        </div>
        <p className={styles.dateLine}>{dateLine}</p>
        <p>{WELCOME_INTROS[welcomeIntro ?? 0]}</p>
        {composerForm}
        <div className={styles.suggestions} aria-label="Quick prompts">{QUICK_PROMPTS.map(text => <button type="button" key={text} disabled={busy || !ready || available === false} onClick={() => void send(text)}>{text}</button>)}</div>
      </div>}
      {messages.map((message, i) => <AsciiMsg key={i} compact who={message.role === 'user' ? 'MICHAEL' : 'AGENT'} side={message.role === 'user' ? 'user' : 'agent'} idx={i + 1} ts={message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : undefined}><Markdown text={message.content} /></AsciiMsg>)}
      {busy && <AsciiMsg who="SYS" side="system" compact><p role="status">Working on your message…</p></AsciiMsg>}

    </div>
    {messages.length > 0 && composerForm}
  </section>
}
