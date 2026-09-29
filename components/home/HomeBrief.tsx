'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useLiveData } from '../LiveDataProvider'
import { useKanbanSnapshot } from '../KanbanSnapshot'
import { HomeChat } from '../HomeChat'
import { isFreshAlert, useAlertDismissals, useFeedRows } from '../ActionFeed'
import { Strip, StripEmpty, StripList, TaskStrip } from '../strip/Strip'
import { briefSentence, buildRoster, needsYouTasks, upNextTasks } from '@/lib/flight-strip'
import styles from './HomeBrief.module.css'

const SYSTEM_ROW = /^(svc|collector|warn|crew):/

function BriefHeading({ text, kind }: { text: string; kind: string }) {
  const parts = text.split(/(\d+ (?:is|are) running|\d+ (?:is|are) waiting on you)/)
  return (
    <h1 aria-live="polite" data-kind={kind}>
      {parts.map((part, i) => {
        if (/running$/.test(part) && /^\d/.test(part)) return <span key={i} className={styles.nRun}>{part}</span>
        if (/waiting on you$/.test(part) && /^\d/.test(part)) return <span key={i} className={styles.nYou}>{part}</span>
        return part
      })}
    </h1>
  )
}

export function HomeBrief() {
  const { tasks, summary, loading, error, lastUpdated, now } = useKanbanSnapshot()
  const { data } = useLiveData()
  const { rows } = useFeedRows()
  const { dismissedIds, dismiss, now: alertNow } = useAlertDismissals()

  const brief = briefSentence(summary, { loading, error })
  const needs = useMemo(() => needsYouTasks(tasks, 5), [tasks])
  const next = useMemo(() => upNextTasks(tasks, 3), [tasks])
  const roster = useMemo(() => buildRoster({ bots: [], crew: data?.crew ?? [], tasks, now }), [data?.crew, tasks, now])
  const alerts = rows.filter(r => SYSTEM_ROW.test(r.id) && !dismissedIds.has(r.id) && isFreshAlert(r, alertNow))

  const dash = '—'
  const runningAnswer = !summary ? dash : summary.runningLive === 0 ? 'Nothing live' : `${summary.runningLive} live`
  const runningSub = summary && summary.trackingOnly > 0 ? `${summary.trackingOnly} marked running, no live worker` : null
  const needsAnswer = !summary ? dash : summary.needsYou === 0 ? 'Nothing' : `${summary.needsYou} waiting`
  const nextAnswer = !summary ? dash : summary.upNext === 0 ? 'Queue is empty' : `${summary.upNext} queued`
  const when = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className={styles.home}>
      <header className={styles.brief}>
        <p className={styles.when}>{when}{lastUpdated ? ` · task board read ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        <BriefHeading text={brief.text} kind={brief.kind} />
        {brief.kind === 'unavailable' && <p className={styles.err} role="alert">{error}</p>}
      </header>

      <section className={styles.answers} aria-label="At a glance">
        <Link href="/kanban" className={styles.answer} data-tone="run">
          <span className={styles.q}>What is running?</span>
          <span className={styles.a}>{runningAnswer}</span>
          {runningSub && <span className={styles.sub}>{runningSub}</span>}
        </Link>
        <Link href="/kanban" className={styles.answer} data-tone="you">
          <span className={styles.q}>What needs me?</span>
          <span className={styles.a}>{needsAnswer}</span>
        </Link>
        <Link href="/kanban" className={styles.answer}>
          <span className={styles.q}>What is next?</span>
          <span className={styles.a}>{nextAnswer}</span>
        </Link>
      </section>

      <div className={styles.grid}>
        <div className={styles.col}>
          <section aria-labelledby="home-needs">
            <div className={styles.blockHead}>
              <h2 id="home-needs">Needs you</h2>
              <Link href="/kanban" className={styles.more}>All tasks</Link>
            </div>
            {!summary ? (
              <StripEmpty title={brief.kind === 'unavailable' ? 'Task board unavailable' : 'Loading tasks…'} hint={brief.kind === 'unavailable' ? 'Nothing is being hidden. The last read failed.' : undefined} />
            ) : needs.length === 0 ? (
              <StripEmpty title="Nothing is waiting on you" hint="Blocked, failed and review tasks appear here." />
            ) : (
              <StripList label="Tasks that need you">{needs.map(t => <TaskStrip key={t.id} task={t} now={now} />)}</StripList>
            )}
            {summary && summary.needsYou > needs.length && (
              <Link href="/kanban" className={styles.more}>{summary.needsYou - needs.length} more on the board</Link>
            )}
          </section>

          <section aria-labelledby="home-next">
            <div className={styles.blockHead}>
              <h2 id="home-next">Up next</h2>
            </div>
            {!summary ? (
              <StripEmpty title="Loading tasks…" />
            ) : next.length === 0 ? (
              <StripEmpty title="Queue is empty" />
            ) : (
              <StripList label="Up next">{next.map(t => <TaskStrip key={t.id} task={t} now={now} />)}</StripList>
            )}
          </section>
        </div>

        <div className={styles.col}>
          <section aria-labelledby="home-crew">
            <div className={styles.blockHead}>
              <h2 id="home-crew">Crew</h2>
              <Link href="/crew" className={styles.more}>Open crew</Link>
            </div>
            {roster.rows.length === 0 ? (
              <StripEmpty title={data ? 'No crew reported' : 'Loading crew…'} />
            ) : (
              <ul className={styles.crew}>
                {roster.rows.slice(0, 5).map(r => (
                  <li key={r.name} data-state={r.state}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.who}>{r.name}</span>
                    <span className={styles.doing}>{r.stateLabel} · {r.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {alerts.length > 0 && (
            <section aria-labelledby="home-system" id="home-system-telemetry">
              <div className={styles.blockHead}>
                <h2 id="home-system">System</h2>
                <Link href="/system" className={styles.more}>Open system</Link>
              </div>
              <StripList label="System alerts">
                {alerts.slice(0, 4).map(a => (
                  <li key={a.id} className={styles.alert}>
                    <Strip tone={a.tone === 'urgent' ? 'fail' : 'you'} callsign="system" title={a.text} state={a.tone === 'urgent' ? 'Down' : 'Warning'} href={a.href === '/' ? '/system' : a.href} asFragment />
                    <button type="button" className={styles.dismiss} aria-label={`Dismiss alert: ${a.text}`} onClick={() => dismiss(a.id)}>×</button>
                  </li>
                ))}
              </StripList>
            </section>
          )}

          <section aria-label="Chat">
            <div className={styles.blockHead}>
              <h2>Ask your agent</h2>
              <Link href="/chat" className={styles.more}>Open chat</Link>
            </div>
            <HomeChat compact />
          </section>
        </div>
      </div>
    </div>
  )
}
