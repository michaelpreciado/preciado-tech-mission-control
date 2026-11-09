'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-base'
import type { BotsSnapshot } from '@/lib/collectors/bots'
import { botDisplay, HIDDEN_BOT_PROFILES } from '../views/BotsPanel'
import type { CrewView } from './useCrew'
import styles from './Roster.module.css'

const BOTS_POLL_MS = 20_000

/** `/api/bots` roster, polled while the tab is visible. Null until the first answer. */
function useBots(): { bots: BotsSnapshot['bots'] | null; error: boolean } {
  const [bots, setBots] = useState<BotsSnapshot['bots'] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const response = await apiFetch('/api/bots', { signal: controller.signal })
          if (!response.ok) throw new Error(String(response.status))
          const body: BotsSnapshot = await response.json()
          if (!controller.signal.aborted) { setBots(body.bots); setError(false) }
        } catch { if (!controller.signal.aborted) setError(true) }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), BOTS_POLL_MS)
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])
  return { bots, error }
}

/** A bot is working only on confirmed, fresh worker evidence — same rule as the crew rows. */
export const isWorking = (row: CrewView['rows'][number] | undefined) =>
  Boolean(row && row.worker.kind === 'confirmed-worker' && row.worker.freshness === 'fresh')

/**
 * BOT DESK — the launcher's charm card, text edition (the pixel office is optional
 * and has no sprite assets). One bot at a time, paged `1/2`; the header counts idle bots.
 * Joins `/api/bots` (who exists) with the crew view (who is provably working).
 */
export function BotDesk({ crew }: { crew: CrewView }) {
  const { bots, error } = useBots()
  const [index, setIndex] = useState(0)
  const desk = useMemo(() => (bots ?? []).filter(b => !HIDDEN_BOT_PROFILES.has(b.name)).map(bot => {
    const row = crew.rows.find(r => r.id.toLowerCase() === bot.name.toLowerCase() || r.name.toLowerCase() === bot.name.toLowerCase())
    const working = isWorking(row)
    const task = row?.currentTask?.title ?? row?.presence.reportedTask ?? null
    return { bot, display: botDisplay(bot.name), working, task }
  }), [bots, crew.rows])
  const idle = desk.filter(d => !d.working).length
  const at = desk.length ? Math.min(index, desk.length - 1) : 0
  const current = desk[at]
  return <section className={`mc-widget ${styles.desk}`} aria-label="Bot desk">
    <header className={styles.deskHead}>
      <h2 className={styles.deskTitle}>BOT DESK</h2>
      <span className={styles.deskCount}>{bots ? `${idle} idle` : error ? '× offline' : '…'}</span>
    </header>
    {current ? <>
      <div className={styles.deskBot}>
        <strong>{current.display.displayName.toUpperCase()}</strong>
        <button type="button" className={styles.deskPager} onClick={() => setIndex((at + 1) % desk.length)} aria-label={`Show next bot, ${at + 1} of ${desk.length}`} disabled={desk.length < 2}>{at + 1}/{desk.length}</button>
      </div>
      <p className={styles.deskTask}>{current.task ?? (current.display.role || 'no task reported')}</p>
      <p className={styles.deskState} data-working={current.working || undefined}>{current.working ? '▶ working · at the desk' : '· idle · roaming the office'}</p>
    </> : <p className={styles.deskTask} role={error ? 'alert' : 'status'}>{error ? '× could not load bots' : bots ? 'No bot profiles found.' : 'Loading bots…'}</p>}
  </section>
}
