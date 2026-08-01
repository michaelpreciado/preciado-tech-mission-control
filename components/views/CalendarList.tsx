'use client'

import { useLiveData } from '../LiveDataProvider'
import { EmptyTerminal, SkeletonPanel, fmtDate } from '../ui'

/* ── Calendar / Scheduler ─────────────────────────────── */

/* The Calendar tab shows only the TickTick week now; the Google "upcoming
   events" panel and the Scheduler filter view that used to sit here were
   removed. Cron jobs are still surfaced by <CalendarList /> on the Deck. */

export function CalendarList({ limit }: { limit?: number } = {}) {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading scheduler" />
  const crons = limit ? data.cron.slice(0, limit) : data.cron
  if (!crons.length) return <EmptyTerminal label="no cron jobs configured" />
  return (
    <>
      {crons.map(s => (
        <div key={s.id} className="mc-cal-card">
          <div className="mc-cal-card-head">
            <span className="mc-cal-card-name">{s.name}</span>
            <span className="mc-cal-card-tag">{s.cadence}</span>
          </div>
          <div className="mc-cron">
            <span className="cron-fields">{s.schedule}</span>
            {s.timezone && <span className="tz">[{s.timezone}]</span>}
          </div>
          {s.description && <div className="mc-cal-desc">{s.description}</div>}
          <div className="mc-cal-foot">
            {s.lastRunStatus && <span>last: {s.lastRunStatus}</span>}
            {s.nextRunAt && <span>next: {fmtDate(s.nextRunAt)}</span>}
          </div>
        </div>
      ))}
    </>
  )
}
