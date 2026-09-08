'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import { Icon } from './icons'
import styles from './HomeWorkspace.module.css'

type Message = { role: 'user' | 'assistant'; content: string }
const STORAGE = 'mc-home-chat-v1'
// getRandomValues also works on the phone's plain-HTTP LAN connection.
const createSession = () => `home-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`

export function HomeChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [session, setSession] = useState('')
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const following = useRef(true)

  useEffect(() => {
    let saved: { session?: string; messages?: Message[]; draft?: string } = {}
    try { saved = JSON.parse(sessionStorage.getItem(STORAGE) || '{}') || {} } catch { /* storage may be unavailable */ }
    setSession(typeof saved.session === 'string' && /^home-[a-zA-Z0-9-]{1,40}$/.test(saved.session) ? saved.session : createSession())
    if (Array.isArray(saved.messages)) setMessages(saved.messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-100))
    if (typeof saved.draft === 'string') setDraft(saved.draft.slice(0, 4000))
    setReady(true)
    const controller = new AbortController()
    void fetch('/api/chat', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to check chat availability'); return r.json() })
      .then(data => setAvailable(Boolean(data.available)))
      .catch(e => { if (e.name !== 'AbortError') setError('Could not check the agent connection. You can still try sending a message.') })
    return () => { controller.abort(); abort.current?.abort() }
  }, [])

  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(STORAGE, JSON.stringify({ session, messages: messages.slice(-100), draft })) } catch { /* in-memory chat still works */ }
  }, [session, messages, draft, ready])

  useEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, busy])

  const send = async () => {
    const message = draft.trim()
    if (!message || lock.current || !ready || available === false) return
    lock.current = true
    setBusy(true); setError(''); setDraft(''); following.current = true
    setMessages(previous => [...previous, { role: 'user', content: message }])
    const controller = new AbortController()
    abort.current = controller
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session }), signal: controller.signal,
      })
      const result = await response.json()
      if (!response.ok || typeof result.reply !== 'string') throw new Error(result.error || 'The agent could not reply. Please try again.')
      setMessages(previous => [...previous, { role: 'assistant', content: result.reply }])
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
    setMessages([]); setDraft(''); setError(''); setSession(createSession())
    input.current?.focus()
  }

  const composerForm = (
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send() }}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {available === false && <p className={styles.error}>The configured agent is unavailable. <Link href="/setup">Open Setup</Link></p>}
      <div className={styles.inputBox}>
        <textarea ref={input} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Message your agent" placeholder="Message your agent…" rows={2} maxLength={4000} disabled={busy || !ready || available === false} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
        }} />
        <button type="submit" className={styles.send} aria-label="Send message" disabled={busy || !ready || !draft.trim() || available === false}>↑</button>
      </div>
      <div className={styles.composerHint}><span>Connected to your configured agent</span><span>{draft.length}/4000</span></div>
    </form>
  )

  return <section className={styles.chat} data-empty={messages.length === 0} aria-label="Mission Control chat">
    <header className={styles.chatHeader}>
      <div><span className={styles.kicker}>MISSION CONTROL</span><span className={styles.connection}>{available === false ? 'Agent unavailable' : available ? 'Agent connected' : 'Connecting…'}</span></div>
      <div className={styles.chatActions}><Link href="/chat" aria-label="Open chat history">History</Link><button onClick={newChat} disabled={busy || !ready} aria-label="Start a new chat">＋ New chat</button></div>
    </header>
    <div className={styles.messages} ref={log} role="log" aria-label="Conversation" onScroll={() => {
      const el = log.current
      if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }}>
      {messages.length === 0 && <div className={styles.welcome}>
        <div className={styles.orb} aria-hidden="true"><Icon name="brand" size={30} /></div>
        <span className={styles.kicker}>YOUR COMMAND SPACE</span>
        <h1>What are we working on?</h1>
        <p>Think it through. Make a plan. Move the mission forward.</p>
        {composerForm}
        <div className={styles.suggestions}>{['Help me prioritize my tasks', 'Check on my system', 'Let’s plan something new'].map(text => <button key={text} onClick={() => { setDraft(text); input.current?.focus() }}>{text}<span aria-hidden="true">↗</span></button>)}</div>
      </div>}
      {messages.map((message, i) => <article key={i} className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}><span className={styles.speaker}>{message.role === 'user' ? 'You' : 'Assistant'}</span><Markdown text={message.content} /></article>)}
      {busy && <p className={styles.thinking} role="status">Working on your message…</p>}
    </div>
    {messages.length > 0 && composerForm}
  </section>
}
