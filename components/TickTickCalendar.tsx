'use client'

/**
 * Weekly/monthly calendar sourced from TickTick (lib/ticktick.ts → /api/ticktick).
 *
 * Terminal aesthetic, but a real CSS grid rather than a fixed-width <pre>:
 * monospace ASCII columns forced every title to a hard character budget, so
 * anything longer than ~18 chars was truncated and the 7th day fell off the
 * edge. The grid keeps the box-drawing look while letting titles wrap.
 *
 * Views: GRID (7-day week grid), LIST (7-day agenda), MONTH (month grid with
 * per-day count chips). All three bucket the same task set by local-day key,
 * so a task's day is consistent across views. Task marks carry a project color
 * dot when TickTick's /project response provides a color.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, SkeletonPanel } from './ui'
import { EmptyState } from './EmptyState'
import type { TickTickTask, TickTickWeekData } from '@/lib/types'

const POLL_MS = 60_000
const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

type WeekDay = { key: string; name: string; dayNum: number; isToday: boolean; isWeekend: boolean }
type MonthCell = { key: string; dayNum: number; isToday: boolean; isWeekend: boolean } | null
type ViewMode = 'grid' | 'agenda' | 'month'

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

/** Month grid, MON-first. Leading/trailing days of adjacent months are null. */
function buildMonth(offset: number): { cells: MonthCell[]; label: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = first.getFullYear()
  const month = first.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // MON=0..SUN=6
  const todayKey = dayKey(now)
  const cells: MonthCell[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dow = date.getDay()
    cells.push({
      key: dayKey(date),
      dayNum: d,
      isToday: dayKey(date) === todayKey,
      isWeekend: dow === 0 || dow === 6,
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return { cells, label: `${MONTHS[month]} ${year}` }
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

export function TickTickCalendar() {
  const [data, setData] = useState<TickTickWeekData | null>(null)
  const [offset, setOffset] = useState(0)       // weeks (grid/agenda)
  const [monthOffset, setMonthOffset] = useState(0) // months (month view)
  const [view, setView] = useState<ViewMode>('grid')
  const { days, monday } = useMemo(() => buildWeek(offset), [offset])
  const { cells: monthCells, label: monthLabel } = useMemo(() => buildMonth(monthOffset), [monthOffset])

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
  const monthCount = useMemo(
    () => monthCells.reduce((n, c) => n + (c ? (byDay.get(c.key)?.length ?? 0) : 0), 0),
    [monthCells, byDay],
  )

  /** Jump from a month cell to that day's week in GRID view. */
  const jumpToWeek = (key: string) => {
    const d = new Date(`${key}T00:00:00`)
    if (Number.isNaN(d.getTime())) return
    const now = new Date()
    const nowDow = now.getDay()
    const curMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nowDow === 0 ? -6 : 1 - nowDow))
    const dDow = d.getDay()
    const dayMonday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dDow === 0 ? -6 : 1 - dDow))
    const diff = Math.round((dayMonday.getTime() - curMonday.getTime()) / (7 * 86400000))
    setOffset(diff)
    setView('grid')
  }

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

  const stepBack = () => (view === 'month' ? setMonthOffset(o => o - 1) : setOffset(o => o - 1))
  const stepForward = () => (view === 'month' ? setMonthOffset(o => o + 1) : setOffset(o => o + 1))
  const stepToday = () => (view === 'month' ? setMonthOffset(0) : setOffset(0))
  const isTodayOffset = view === 'month' ? monthOffset === 0 : offset === 0
  const rangeShown = view === 'month' ? monthLabel : rangeLabel(monday)
  const countShown = view === 'month' ? monthCount : weekCount

  return (
    <div className="mc-week">
      <div className="mc-week-bar">
        <span className="mc-week-title">▦ TICKTICK</span>
        <span className="mc-week-range">{rangeShown}</span>
        <span className="mc-week-count">{countShown} {countShown === 1 ? 'task' : 'tasks'}</span>
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
          <button
            className={view === 'month' ? 'is-active' : ''}
            onClick={() => setView('month')}
            aria-pressed={view === 'month'}
          >
            ▤ MONTH
          </button>
        </span>
        <span className="mc-week-nav">
          <button onClick={stepBack} aria-label={view === 'month' ? 'Previous month' : 'Previous week'}>◂</button>
          <button onClick={stepToday} disabled={isTodayOffset}>today</button>
          <button onClick={stepForward} aria-label={view === 'month' ? 'Next month' : 'Next week'}>▸</button>
        </span>
      </div>

      {data.error && <div className="mc-week-error" role="alert">⚠ {data.error}</div>}

      {view === 'month' ? (
        <>
          {monthCount === 0 && <div className="mc-week-month-note">no tasks this month</div>}
          <div className="mc-week-scroll">
            <div className="mc-week-month">
              {DAY_NAMES.map(n => <div key={n} className="mc-week-month-dow">{n}</div>)}
              {monthCells.map((c, i) =>
                c === null ? (
                  <div key={`blank-${i}`} className="mc-week-month-day is-blank" />
                ) : (
                  <div
                    key={c.key}
                    className={`mc-week-month-day ${c.isToday ? 'is-today' : ''} ${c.isWeekend ? 'is-weekend' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.key}${(byDay.get(c.key)?.length ?? 0) > 0 ? `, ${byDay.get(c.key)?.length} tasks` : ', no tasks'}`}
                    onClick={() => jumpToWeek(c.key)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToWeek(c.key) } }}
                  >
                    <span className="mc-week-month-daynum">{c.dayNum}</span>
                    {(byDay.get(c.key)?.length ?? 0) > 0 && (
                      <span className="mc-week-month-chip">{byDay.get(c.key)!.length}</span>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        </>
      ) : weekCount === 0 ? (
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
                    <div key={t.id} className={`mc-week-task ${t.status === 2 ? 'is-done' : ''}`} title={t.projectName ?? undefined}>
                      <span className="mc-week-dot" style={t.projectColor ? { backgroundColor: t.projectColor } : undefined} />
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
                    <div key={t.id} className={`mc-week-task ${t.status === 2 ? 'is-done' : ''}`} title={t.projectName ?? undefined}>
                      <span className="mc-week-dot" style={t.projectColor ? { backgroundColor: t.projectColor } : undefined} />
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