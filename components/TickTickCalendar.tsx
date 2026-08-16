'use client'

/**
 * Weekly calendar sourced from TickTick (lib/ticktick.ts → /api/ticktick).
 *
 * Terminal aesthetic, but a real CSS grid rather than a fixed-width <pre>:
 * monospace ASCII columns forced every title to a hard character budget, so
 * anything longer than ~18 chars was truncated and the 7th day fell off the
 * edge. The grid keeps the box-drawing look while letting titles wrap.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, SkeletonPanel } from './ui'
import { EmptyState } from './EmptyState'
import type { TickTickTask, TickTickWeekData } from '@/lib/types'

const POLL_MS = 60_000
const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

type WeekDay = { key: string; name: string; dayNum: number; isToday: boolean; isWeekend: boolean }

/** Local-time YYYY-MM-DD. Avoids toISOString(), which shifts across UTC. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildWeek(offset: number): { days: WeekDay[]; monday: Date } {
  const now = new Date()
  const dow = now.getDay() // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + offset * 7)
  const todayKey = dayKey(now)
  const days = DAY_NAMES.map((name, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return {
      key: dayKey(d),
      name,
      dayNum: d.getDate(),
      isToday: dayKey(d) === todayKey,
      isWeekend: i >= 5,
    }
  })
  return { days, monday }
}

function bucketByDay(tasks: TickTickTask[]): Map<string, TickTickTask[]> {
  const map = new Map<string, TickTickTask[]>()
  for (const t of tasks) {
    // TickTick returns a fixed +0000 offset; render in the viewer's local zone.
    const d = new Date(t.date)
    if (Number.isNaN(d.getTime())) continue
    const key = dayKey(d)
    const arr = map.get(key)
    if (arr) arr.push(t)
    else map.set(key, [t])
  }
  for (const arr of map.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  return map
}

function timeLabel(t: TickTickTask): string | null {
  if (t.isAllDay) return null
  const d = new Date(t.date)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')
}

function rangeLabel(monday: Date): string {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const a = `${MONTHS[monday.getMonth()]} ${monday.getDate()}`
  const b = monday.getMonth() === sunday.getMonth()
    ? `${sunday.getDate()}`
    : `${MONTHS[sunday.getMonth()]} ${sunday.getDate()}`
  return `${a}–${b}`
}

type ViewMode = 'grid' | 'agenda'

export function TickTickCalendar() {
  const [data, setData] = useState<TickTickWeekData | null>(null)
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<ViewMode>('grid')
  const { days, monday } = useMemo(() => buildWeek(offset), [offset])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ticktick', { cache: 'no-store' })
      return (await res.json()) as TickTickWeekData
    } catch {
      return { configured: true, tasks: [], error: 'could not reach /api/ticktick' } as TickTickWeekData
    }
  }, [])

  useEffect(() => {
    let alive = true
    const run = () => { void load().then(j => { if (alive) setData(j) }) }
    run()
    const t = setInterval(() => { if (document.visibilityState === 'visible') run() }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [load])

  const byDay = useMemo(() => bucketByDay(data?.tasks ?? []), [data])
  const weekCount = useMemo(
    () => days.reduce((n, d) => n + (byDay.get(d.key)?.length ?? 0), 0),
    [days, byDay],
  )

  if (!data) return <SkeletonPanel label="loading ticktick" />

  if (!data.configured) {
    return (
      <div className="mc-connect-card">
        <div className="mc-connect-title">◇ CONNECT TICKTICK</div>
        <p>Add your TickTick Open API bearer token in Setup to show this week&apos;s tasks here.</p>
        <Button variant="ghost" href="/setup">🛠 OPEN SETUP</Button>
      </div>
    )
  }

  return (
    <div className="mc-week">
      <div className="mc-week-bar">
        <span className="mc-week-title">▦ TICKTICK</span>
        <span className="mc-week-range">{rangeLabel(monday)}</span>
        <span className="mc-week-count">{weekCount} {weekCount === 1 ? 'task' : 'tasks'}</span>
        <span className="mc-week-view-toggle">
          <button
            className={view === 'grid' ? 'is-active' : ''}
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
          >
            ▦ GRID
          </button>
          <button
            className={view === 'agenda' ? 'is-active' : ''}
            onClick={() => setView('agenda')}
            aria-pressed={view === 'agenda'}
          >
            ☰ LIST
          </button>
        </span>
        <span className="mc-week-nav">
          <button onClick={() => setOffset(o => o - 1)} aria-label="Previous week">◂</button>
          <button onClick={() => setOffset(0)} disabled={offset === 0}>today</button>
          <button onClick={() => setOffset(o => o + 1)} aria-label="Next week">▸</button>
        </span>
      </div>

      {data.error && <div className="mc-week-error" role="alert">⚠ {data.error}</div>}

      {weekCount === 0 ? (
        <EmptyState
          glyph="▦"
          title="No events this week"
          desc="This week is clear — nothing scheduled. Add a task in TickTick and it appears here, or step to another week."
          actions={[
            { label: 'Add to TickTick ↗', href: 'https://www.ticktick.com/webapp/#q/all/today', primary: true },
            { label: '◂ Last week', onClick: () => setOffset(o => o - 1) },
            { label: 'Next week ▸', onClick: () => setOffset(o => o + 1) },
          ]}
        />
      ) : view === 'grid' ? (
        <div className="mc-week-grid">
          {days.map(d => {
            const items = byDay.get(d.key) ?? []
            return (
              <div key={d.key} className={`mc-week-day ${d.isToday ? 'is-today' : ''} ${d.isWeekend ? 'is-weekend' : ''} ${items.length === 0 ? 'is-empty' : ''}`} aria-current={d.isToday ? 'date' : undefined}>
                <div className="mc-week-dayhead">
                  <span className="mc-week-dayname">{d.name}</span>
                  <span className="mc-week-daynum">{d.dayNum}</span>
                </div>
                <div className="mc-week-daybody">
                  {items.length === 0 ? (
                    <a className="mc-week-add" href="https://www.ticktick.com/webapp/#q/all/today" aria-label="Add an event to this day" title="Add an event">
                      + add
                    </a>
                  ) : items.map(t => (
                    <div key={t.id} className={`mc-week-task ${t.status === 2 ? 'is-done' : ''}`} title={t.projectName}>
                      <span className="mc-week-mark">{t.status === 2 ? '✓' : '▸'}</span>
                      <span className="mc-week-tasktext">
                        {timeLabel(t) && <span className="mc-week-time">{timeLabel(t)} </span>}
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mc-week-agenda">
          {days.map(d => {
            const items = byDay.get(d.key) ?? []
            return (
              <div key={d.key} className={`mc-week-agenda-day ${d.isToday ? 'is-today' : ''} ${d.isWeekend ? 'is-weekend' : ''}`} aria-current={d.isToday ? 'date' : undefined}>
                <div className="mc-week-agenda-dayhead">
                  <span className="mc-week-dayname">{d.name}</span>
                  <span className="mc-week-daynum">{d.dayNum}</span>
                </div>
                <div className="mc-week-agenda-tasks">
                  {items.length === 0 ? (
                    <span className="mc-week-agenda-empty">—</span>
                  ) : items.map(t => (
                    <div key={t.id} className={`mc-week-task ${t.status === 2 ? 'is-done' : ''}`} title={t.projectName}>
                      <span className="mc-week-mark">{t.status === 2 ? '✓' : '▸'}</span>
                      <span className="mc-week-tasktext">
                        {timeLabel(t) && <span className="mc-week-time">{timeLabel(t)} </span>}
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
