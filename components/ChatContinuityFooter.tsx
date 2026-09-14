'use client'
import { useEffect, useState } from 'react'
import type { ChatContinuity } from '@/lib/chat-continuity'

export function ChatContinuityFooter({ session, profile, busy, onBusy, onOutput }: {
  session: string; profile: string; busy: boolean; onBusy: (value: boolean) => void; onOutput: (text: string) => void
}) {
  const [record, setRecord] = useState<ChatContinuity | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const refresh = async () => {
    const response = await fetch(`/api/chat?${new URLSearchParams({ session, profile })}`, { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Continuity unavailable')
    setRecord(body.continuity)
  }
  useEffect(() => { void refresh().catch(e => setError(e.message)) }, [session, profile]) // keyed by the owning conversation
  async function send() {
    if (busy || !text.trim()) return
    onBusy(true); setError('')
    try {
      const response = await fetch('/api/herdr/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'continue-chat', session, profile, text }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Herdr continuation failed')
      setRecord(body.continuity); setText('')
      onOutput(`Herdr terminal snapshot (may include prompt and prior output):\n${body.terminalText}`)
    } catch (e) { setError((e as Error).message) }
    finally { await refresh().catch(() => {}); onBusy(false) }
  }
  return <footer className="cc-continuity" aria-label="Session location">
    <strong>~/chat / location</strong>
    {record ? <>
      <div>MC: {record.mcConversationId}</div>
      <div>Hermes {record.sessionName || record.selector === 'id' ? 'id' : 'name (id unresolved)'}: {record.hermesSession} · {record.profile}</div>
      <div>Herdr: {record.herdrPane || 'not attached'}</div>
      <label>Next message in Herdr<textarea value={text} maxLength={4000} disabled={busy} onChange={e => setText(e.target.value)} /></label>
      <button disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? 'Waiting for agent…' : 'Continue in herdr'}</button>
      {record.herdrPane && <a href="/kanban">Open agent deck</a>}
    </> : <span>Send a local Hermes message to register this session.</span>}
    {error && <p role="alert">{error}</p>}
  </footer>
}
