'use client'

import { useLiveData } from '../LiveDataProvider'
import { EmptyTerminal, SkeletonPanel, fmtDate } from '../ui'

/* ── Calendar / Scheduler ─────────────────────────────── */

/* The Calendar tab shows only the TickTick week now; the Google "upcoming
   events" panel and the Scheduler filter view that used to sit here were
   removed. Cron jobs are still surfaced by <CalendarList /> on the Deck. */

/** Map a cron last-run status string to a semantic tone (ok/warn/error/info). */
function lastRunTone(s?: string): string {
  const v = (s || '').toLowerCase()
  if (!v) return ''
  if (/error|fail|down|offline|crash|timeout|unreachable|not found|404|5\d\d/.test(v)) return 'error'
  if (/warn|rate.?limit|retry|overdue|degraded|slow/.test(v)) return 'warn'
  if (/ok|done|success|up|healthy|live|ran/.test(v)) return 'ok'
  return 'info'
}

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
            {s.lastRunStatus
              ? <span className={`mc-cal-run ${lastRunTone(s.lastRunStatus)}`}><span className="mc-led" />last: {s.lastRunStatus}</span>
              : <span className="mc-cal-run"><span className="mc-led dim" />never run</span>}
            {s.nextRunAt && <span className="mc-cal-next">next: {fmtDate(s.nextRunAt)}</span>}
          </div>
        </div>
      ))}
    </>
  )
}
