'use client'

import { useState } from 'react'
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
  const [showParked, setShowParked] = useState(false)
  if (!data) return <SkeletonPanel label="loading scheduler" />
  const crons = data.cron ?? []
  if (!crons.length) return <EmptyTerminal label="no cron jobs configured" />

  // Split live vs parked. A job is "parked" (dead weight) if it's disabled or
  // its next run is >7 days in the past — it no longer needs Michael's eyes.
  const PARK_MS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const isParked = (s: typeof crons[number]) =>
    s.enabled === false || (!!s.nextRunAt && now - Date.parse(s.nextRunAt) > PARK_MS)
  const live = crons.filter(s => !isParked(s))
  const parked = crons.filter(isParked)
  const shown = (limit ? live.slice(0, limit) : live)
  const hideLimit = limit ? live.length > limit : false

  return (
    <>
      {shown.length === 0 && (
        <div className="mc-cal-card mc-cal-parked">
          <div className="mc-cal-card-head">
            <span className="mc-cal-card-name">NO ACTIVE CRON JOBS</span>
            <span className="mc-cal-card-tag">all clear</span>
          </div>
          <div className="mc-cal-desc">Only live scheduled jobs appear here.</div>
        </div>
      )}
      {shown.map(s => (
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
      {hideLimit && (
        <div className="mc-cal-card mc-cal-parked">
          <div className="mc-cal-desc">{live.length - shown.length} more live job(s) — see the Calendar tab.</div>
        </div>
      )}
      {parked.length > 0 && (
        <div className="mc-cal-card mc-cal-parked">
          <div className="mc-cal-card-head" role="button" tabIndex={0}
            onClick={() => setShowParked(v => !v)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowParked(v => !v) } }}
            aria-expanded={showParked} aria-label="Toggle parked cron jobs">
            <span className="mc-cal-card-name">◴ {parked.length} PARKED JOB{parked.length > 1 ? 'S' : ''}</span>
            <span className="mc-cal-card-tag">{showParked ? 'hide' : 'show'}</span>
          </div>
          <div className="mc-cal-desc">Disabled or dormant since {parked.length && fmtDate(parked[0].lastRunAt ?? parked[0].nextRunAt)} — not active.</div>
          {showParked && parked.map(s => (
            <div key={s.id} className="mc-cal-parked-row">
              <span className="mc-cal-parked-name">{s.name}</span>
              <span className="mc-cal-parked-last">last {s.lastRunStatus ?? 'never'} · {fmtDate(s.lastRunAt ?? s.nextRunAt)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
