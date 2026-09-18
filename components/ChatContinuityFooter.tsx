'use client'

import { useEffect, useState } from 'react'
import type { ChatContinuity } from '@/lib/chat-continuity'
import { apiFetch } from '@/lib/api-base'
import { Button } from './ui'
import styles from './AgentConsole.module.css'

/** Read-only session details for the management sheet. Sending belongs to the single composer. */
export function ChatContinuityFooter({ session, profile }: { session: string; profile: string }) {
  const [record, setRecord] = useState<ChatContinuity | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    setLoading(true); setError(''); setRecord(null)
    void (async () => {
      try {
        const response = await apiFetch(`/api/chat?${new URLSearchParams({ session, profile })}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Continuity unavailable')
        if (alive) setRecord(body.continuity)
      } catch (e) { if (alive) setError((e as Error).message) }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false; controller.abort() }
  }, [session, profile, retry])
  return <section className={styles.stack} aria-label="Session location">
    <h3>Session location</h3>
    {loading ? <p role="status">Loading session details…</p> : error ? <div role="alert"><p>{error}</p><Button onClick={() => setRetry(v => v + 1)}>Retry</Button></div> : record ? <>
      <p>Conversation: <code>{record.mcConversationId}</code></p>
      <p>Hermes session: <code>{record.hermesSession}</code></p>
      <p>Profile: {record.profile}</p>
      <p>Herdr: {record.herdrPane || 'Not attached'}</p>
      {record.herdrPane && <Button href="/kanban">Open agent deck</Button>}
    </> : <p>No continuity record yet. Send a local Hermes message to register this session.</p>}
  </section>
}
