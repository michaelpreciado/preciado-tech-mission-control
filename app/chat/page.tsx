'use client'

/**
 * Chat — talk to your agent (Hermes-compatible CLI) from the deck.
 * History lives in localStorage only; the conversation itself is a named
 * agent session (`--continue`), so the agent keeps context across turns.
 */
import { useEffect, useRef, useState } from 'react'
import { SectionHead } from '@/components/ui'

type Msg = { role: 'you' | 'agent' | 'system'; text: string; at: number; elapsedMs?: number }

const STORE_KEY = 'friday-chat-v1'

function loadStore(): { session: string; messages: Msg[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '')
    if (raw && typeof raw.session === 'string' && Array.isArray(raw.messages)) return raw
  } catch { /* fresh start */ }
  return { session: `dash-${Date.now().toString(36)}`, messages: [] }
}

export default function ChatPage() {
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [command, setCommand] = useState('')
  const [session, setSession] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = loadStore()
    setSession(s.session)
    setMessages(s.messages)
    setReady(true)
    fetch('/api/chat', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { setAvailable(Boolean(j.available)); setCommand(String(j.command || '')) })
      .catch(() => setAvailable(false))
  }, [])

  useEffect(() => {
    if (ready) localStorage.setItem(STORE_KEY, JSON.stringify({ session, messages: messages.slice(-200) }))
  }, [ready, session, messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => { clearInterval(t); setElapsed(0) }
  }, [busy])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(m => [...m, { role: 'you', text, at: Date.now() }])
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setMessages(m => [...m, { role: 'agent', text: j.reply, at: Date.now(), elapsedMs: j.elapsedMs }])
    } catch (err) {
      setMessages(m => [...m, { role: 'system', text: `⚠ ${(err as Error).message}`, at: Date.now() }])
    } finally {
      setBusy(false)
    }
  }

  function newChat() {
    setSession(`dash-${Date.now().toString(36)}`)
    setMessages([])
  }

  return (
    <>
      <SectionHead label="CHAT / TALK TO YOUR AGENT" />
      <div className="mc-chat">
        <div className="mc-chat-bar">
          <span className={`mc-led ${available ? 'green' : available === false ? 'red' : ''}`} />
          <span className="mc-chat-agent">{available ? `${command} · session ${session}` : available === false ? 'agent CLI unavailable' : 'checking agent…'}</span>
          <button className="mc-refresh-btn" onClick={newChat} disabled={busy}>✚ NEW CHAT</button>
        </div>

        {available === false && (
          <div className="mc-connect-card">
            <div className="mc-connect-title">◇ CONNECT AN AGENT</div>
            <p>The /chat tab drives a local agent CLI in one-shot mode (Hermes-compatible: <code>{command || 'hermes'} -z &lt;prompt&gt;</code>).
            Install Hermes or point <code>chat.command</code> in data/config.json at your own agent binary.</p>
          </div>
        )}

        <div className="mc-chat-log" aria-live="polite">
          {messages.length === 0 && available && (
            <div className="mc-chat-empty">No messages yet — the agent keeps context for this whole session. Ask it about its tasks, memory, or anything on the deck.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`mc-chat-msg is-${m.role}`}>
              <div className="mc-chat-msg-head">
                <span>{m.role === 'you' ? '▸ YOU' : m.role === 'agent' ? '◂ AGENT' : '· SYSTEM'}</span>
                <span>{new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{m.elapsedMs ? ` · ${(m.elapsedMs / 1000).toFixed(1)}s` : ''}</span>
              </div>
              <div className="mc-chat-msg-body">{m.text}</div>
            </div>
          ))}
          {busy && (
            <div className="mc-chat-msg is-agent">
              <div className="mc-chat-msg-head"><span>◂ AGENT</span><span>{elapsed}s</span></div>
              <div className="mc-chat-msg-body mc-chat-thinking">thinking<span className="mc-boot-cursor" /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="mc-chat-input" onSubmit={e => { e.preventDefault(); void send() }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder={available ? 'Message your agent… (Enter to send, Shift+Enter for newline)' : 'agent unavailable'}
            disabled={!available || busy}
            rows={2}
            maxLength={4000}
          />
          <button type="submit" className="mc-refresh-btn primary" disabled={!available || busy || !input.trim()}>
            {busy ? `${elapsed}s…` : 'SEND ▸'}
          </button>
        </form>
      </div>
    </>
  )
}
