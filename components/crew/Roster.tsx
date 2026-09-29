'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { useKanbanSnapshot } from '../KanbanSnapshot'
import { apiFetch } from '@/lib/api-base'
import { buildRoster, type RosterRow } from '@/lib/flight-strip'
import type { Bot } from '@/lib/collectors/bots'
import styles from './Roster.module.css'

const POLL_MS = 30_000

/** Only display-safe fields are kept; /api/bots also returns credentials and session ids that must never reach the DOM. */
function safeBots(input: unknown): Bot[] {
  if (!Array.isArray(input)) return []
  return input.map((raw): Bot => {
    const { telegramToken: _t, canonicalSessionId: _s, ...rest } = raw as Record<string, unknown>
    void _t; void _s
    return rest as unknown as Bot
  })
}

function seen(at: number | null, now: number): string {
  if (!at) return 'no activity recorded'
  const ms = at < 10_000_000_000 ? at * 1000 : at
  const age = Math.max(0, now - ms)
  if (age < 60_000) return 'just now'
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`
  return `${Math.floor(age / 86_400_000)}d ago`
}

function tone(state: RosterRow['state']): string {
  return state === 'working' ? styles.run : state === 'attention' ? styles.you : state === 'degraded' ? styles.fail : styles.idle
}

export function Roster() {
  const { data } = useLiveData()
  const snap = useKanbanSnapshot()
  const [bots, setBots] = useState<Bot[]>([])
  const [botsState, setBotsState] = useState<'loading' | 'ok' | 'error'>('loading')

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await apiFetch('/api/bots', { cache: 'no-store', signal })
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      setBots(safeBots(body?.bots))
      setBotsState('ok')
    } catch {
      if (!signal?.aborted) setBotsState('error')
    }
  }, [])

  useEffect(() => {
    const c = new AbortController()
    void load(c.signal)
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(c.signal) }, POLL_MS)
    return () => { c.abort(); window.clearInterval(t) }
  }, [load])

  const now = snap.now || 0
  const roster = useMemo(
    () => buildRoster({ bots, crew: data?.crew ?? [], tasks: snap.tasks, now: now || Date.now() }),
    [bots, data?.crew, snap.tasks, now],
  )
  const clock = now || 0
  const anyData = botsState === 'ok' || (data?.crew?.length ?? 0) > 0

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Now · Crew</p>
        <h1 className={styles.title}>Crew</h1>
        <p className={styles.sub}>Who is actually working, who needs you, and who is idle. “Working” means a live worker with a fresh heartbeat; marked-running cards without one are tracking only.</p>
      </header>

      {botsState === 'loading' && !anyData && <p className={styles.note} role="status">Loading crew…</p>}
      {botsState === 'error' && <p className={styles.note} role="alert">Gateway status is unavailable{anyData ? '; showing crew data from the live feed only.' : '.'}</p>}
      {snap.error && <p className={styles.note} role="alert">Task board unavailable ({snap.error}); current-task and counts may be missing.</p>}
      {botsState === 'ok' && roster.rows.length === 0 && <p className={styles.note}>No agents are configured.</p>}

      {roster.rows.length > 0 && (
        <table className={styles.table}>
          <caption className={styles.sr}>Agent roster</caption>
          <thead><tr><th scope="col">Agent</th><th scope="col">State</th><th scope="col">Model</th><th scope="col">Current task</th><th scope="col">Last seen</th></tr></thead>
          <tbody>
            {roster.rows.map(row => (
              <tr key={row.name} className={`${styles.row} ${tone(row.state)}`}>
                <th scope="row" data-label="Agent"><span className={styles.name}>{row.name}</span>{row.role && <span className={styles.role}>{row.role}</span>}</th>
                <td data-label="State"><span className={styles.state}>{row.stateLabel}</span><span className={styles.detail}>{row.detail}</span></td>
                <td data-label="Model" className={styles.mono}>{row.model ?? '—'}</td>
                <td data-label="Current task">
                  {row.task
                    ? <Link href={`/kanban?task=${encodeURIComponent(row.task.id)}`} className={styles.task}>{row.task.title}</Link>
                    : <span className={styles.detail}>{row.counts.tracked ? `${row.counts.tracked} tracked, no live worker` : 'None'}</span>}
                </td>
                <td data-label="Last seen" className={styles.mono}>{seen(row.lastActiveAt, clock || Date.now())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {roster.unowned.count > 0 && (
        <section className={styles.unowned} aria-label="Unassigned tasks">
          <h2>Unassigned</h2>
          <p>{roster.unowned.count} task{roster.unowned.count === 1 ? '' : 's'} have no owner. <Link href="/kanban">Open the board</Link></p>
        </section>
      )}
    </div>
  )
}
