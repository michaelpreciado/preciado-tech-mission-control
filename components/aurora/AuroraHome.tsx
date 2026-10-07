'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useKanbanSnapshot } from '../KanbanSnapshot'
import { useFeedRows } from '../ActionFeed'
import { AuroraHero } from './AuroraHero'
import { AuroraBands, type BandItem } from './AuroraBands'
import { heroHeadline } from '@/lib/aurora-copy'
import { isUnassigned, needsYouTasks, stateWord } from '@/lib/flight-strip'
import type { AgentTimeline } from '@/lib/agent-timeline'
import styles from './aurora.module.css'

const SHOWN = 5
const SKY_REFRESH_MS = 60_000

/** "Agent gateway :18789" -> "the agent gateway" for use mid-sentence. */
function nameClause(name: string): string {
  const base = name.replace(/\s*:\d+$/, '').trim()
  const soft = /^[A-Z][a-z]/.test(base) ? base.charAt(0).toLowerCase() + base.slice(1) : base
  return `the ${soft}`
}

function age(fromIso: string | undefined, now: number): string | null {
  const ms = fromIso ? Date.parse(fromIso) : NaN
  if (!Number.isFinite(ms) || now <= 0) return null
  const m = Math.max(0, Math.floor((now - ms) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

/** AURORA Home: hero headline + per-agent sky + "Waiting on me" / "Broke" bands, all from live data. */
export function AuroraHome({ timeline, dateLabel, timeLabel }: { timeline: AgentTimeline; dateLabel: string; timeLabel: string }) {
  const router = useRouter()
  const { tasks, summary, error, now } = useKanbanSnapshot()
  const { health, data } = useFeedRows()

  // The sky is server-rendered from the agents' session stores; re-read it while the tab is visible.
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, SKY_REFRESH_MS)
    return () => window.clearInterval(t)
  }, [router])

  const waitingItems = useMemo<BandItem[]>(() => needsYouTasks(tasks, SHOWN).map(t => {
    const callsign = isUnassigned(t.assignee) ? 'unassigned' : String(t.assignee)
    const fails = t.consecutiveFailures ?? 0
    const since = age(t.createdAt, now)
    return {
      id: t.id,
      title: t.title,
      description: fails > 0 ? `${fails} failed run${fails === 1 ? '' : 's'} before it stopped.` : null,
      meta: [{ text: callsign }, { text: stateWord(t, now) }, ...(since ? [{ text: since, num: true }] : [])],
      actions: [{ label: 'Open card', href: `/kanban?task=${encodeURIComponent(t.id)}`, primary: true }],
    }
  }), [tasks, now])

  const broke = useMemo(() => {
    const items: BandItem[] = []
    const clauses: string[] = []
    for (const svc of health?.services ?? []) {
      if (svc.status !== 'down' && svc.status !== 'warn') continue
      if (svc.id === 'pipeline-store' || svc.id === 'cron-jobs') continue // freshness probes, not outages
      const down = svc.status === 'down'
      clauses.push(`${nameClause(svc.name)} is ${down ? 'down' : 'degraded'}`)
      items.push({ id: `svc:${svc.id}`, tone: down ? 'error' : 'warn', title: `${svc.name} is ${down ? 'down' : 'degraded'}`, description: svc.detail, meta: [{ text: 'service health' }], actions: [{ label: 'Open system', href: '/system' }] })
    }
    for (const job of data?.cron ?? []) {
      if (!job.enabled || (job.lastRunStatus !== 'error' && job.lastRunStatus !== 'failed')) continue
      const since = age(job.lastRunAt, now)
      clauses.push(`the ${job.name} job failed`)
      items.push({ id: `cron:${job.id}`, tone: 'error', title: `Cron ${job.name} failed`, description: null, meta: [{ text: 'cron' }, ...(since ? [{ text: `${since} ago`, num: true }] : [])], actions: [{ label: 'Open system', href: '/system' }] })
    }
    for (const [collector, message] of Object.entries(data?.collectorErrors ?? {})) {
      clauses.push(`the ${collector} collector is failing`)
      items.push({ id: `collector:${collector}`, tone: 'error', title: `Collector ${collector} is failing`, description: String(message), meta: [{ text: 'collector' }] })
    }
    return { items, clauses }
  }, [health, data, now])

  const waiting = summary ? summary.needsYou : null
  const headline = heroHeadline({ waiting, broken: broke.clauses, boardError: !!error })

  return (
    <div className={styles.home}>
      <AuroraHero
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        headline={headline}
        error={error && !summary ? error : null}
        rows={timeline.rows}
        nowHour={timeline.nowHour}
        idleAgents={timeline.idleAgents}
        skyAvailable={timeline.available}
      />
      <AuroraBands
        waiting={{
          title: 'Waiting on me',
          count: waiting,
          linkLabel: 'Open board',
          href: '/kanban',
          items: summary ? waitingItems : [],
          more: summary && summary.needsYou > waitingItems.length ? { count: summary.needsYou - waitingItems.length, label: 'more on the board', href: '/kanban' } : undefined,
          empty: summary ? { title: 'Nothing is waiting on you', hint: 'Blocked, failed and review cards appear here.' } : { title: error ? 'Task board unavailable' : 'Loading tasks…', hint: error ? 'Nothing is being hidden. The last read failed.' : undefined },
        }}
        broke={{
          title: 'Broke',
          count: health || data ? broke.items.length : null,
          countTone: 'error',
          linkLabel: 'System',
          href: '/system',
          items: broke.items,
          empty: health ? { title: 'Nothing is broken', hint: 'Down services and failed jobs appear here.' } : { title: 'Checking system health…' },
        }}
      />
    </div>
  )
}
