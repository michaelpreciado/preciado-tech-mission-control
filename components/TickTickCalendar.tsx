'use client'

/**
 * Weekly/monthly calendar sourced from TickTick (lib/ticktick.ts → /api/ticktick).
 *
 * Widget theme (docs/polish-plan-2026-11-09.md): flat `.mc-widget` cards, mono
 * type, today = white chip. A real CSS grid rather than a fixed-width <pre>:
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
import { Button, Divider, Glyph, Kv, KvRow, Prompt, SkeletonPanel } from './ui'
import type { TickTickTask, TickTickWeekData } from '@/lib/types'
import { apiFetch } from '@/lib/api-base'
import styles from './calendar.module.css'

const POLL_MS = 60_000
const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DOW_SHORT = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTHS_LONG = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const ADD_URL = 'https://www.ticktick.com/webapp/#q/all/today'

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
  return { cells, label: `${MONTHS_LONG[month]} ${year}` }
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

type Summary = { todayOpen: number; late: number; weekOpen: number; next: { title: string; when: string } | null }

/** Open-task summary. TickTick's open API only returns *open* tasks, so there is
 *  no done/streak data to show — only what is due, late and next. */
function summarize(tasks: TickTickTask[], byDay: Map<string, TickTickTask[]>, weekKeys: string[], now: Date): Summary {
  const todayKey = dayKey(now)
  const open = tasks.filter(t => t.status !== 2)
  const todayOpen = (byDay.get(todayKey) ?? []).filter(t => t.status !== 2).length
  const late = open.filter(t => {
    const d = new Date(t.date)
    if (Number.isNaN(d.getTime())) return false
    return t.isAllDay ? dayKey(d) < todayKey : d.getTime() < now.getTime()
  }).length
  const weekOpen = weekKeys.reduce((n, k) => n + (byDay.get(k)?.filter(t => t.status !== 2).length ?? 0), 0)
  const upcoming = open
    .map(t => ({ t, d: new Date(t.date) }))
    .filter(({ t, d }) => !Number.isNaN(d.getTime()) && (t.isAllDay ? dayKey(d) >= todayKey : d.getTime() >= now.getTime()))
    .sort((a, b) => a.d.getTime() - b.d.getTime())[0]
  let next: Summary['next'] = null
  if (upcoming) {
    const key = dayKey(upcoming.d)
    const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const day = key === todayKey ? 'today' : key === tomorrow ? 'tomorrow' : DAY_NAMES[(upcoming.d.getDay() + 6) % 7]
    const time = timeLabel(upcoming.t)
    next = { title: upcoming.t.title, when: time ? `${day} ${time}` : day }
  }
  return { todayOpen, late, weekOpen, next }
}

export function TickTickCalendar() {
  const [data, setData] = useState<TickTickWeekData | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [offset, setOffset] = useState(0)       // weeks (grid/agenda)
  const [monthOffset, setMonthOffset] = useState(0) // months (month view)
  const [view, setView] = useState<ViewMode>('grid')
  const { days, monday } = useMemo(() => buildWeek(offset), [offset])
  const { cells: monthCells, label: monthLabel } = useMemo(() => buildMonth(monthOffset), [monthOffset])

  // A non-OK answer (401 / 429 / 5xx) is a failed read, not "TickTick is not
  // configured": keep whatever was last loaded and say what happened.
  const load = useCallback(async (): Promise<{ data?: TickTickWeekData; error?: string }> => {
    try {
      const res = await apiFetch('/api/ticktick', { cache: 'no-store' })
      if (!res.ok) return { error: `ticktick ${res.status}` }
      return { data: (await res.json()) as TickTickWeekData }
    } catch {
      return { error: 'could not reach /api/ticktick' }
    }
  }, [])

  useEffect(() => {
    let alive = true
    const run = () => {
      void load().then(result => {
        if (!alive) return
        if (result.data) { setData(result.data); setFetchError('') }
        else setFetchError(result.error ?? 'ticktick unavailable')
      })
    }
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
  const summary = useMemo(
    () => summarize(data?.tasks ?? [], byDay, buildWeek(0).days.map(d => d.key), new Date()),
    [data, byDay],
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

  if (!data && !fetchError) return <SkeletonPanel label="loading ticktick" />

  if (!data) {
    return (
      <section className={`mc-widget ${styles.connect}`} role="alert">
        <Prompt host="desk" cmd="ticktick" />
        <p><Glyph g="err" /> {fetchError}</p>
        <p className={styles.dim}>TickTick could not be read. The calendar retries every minute.</p>
      </section>
    )
  }

  if (!data.configured) {
    return (
      <section className={`mc-widget ${styles.connect}`}>
        <Prompt host="desk" cmd="ticktick" />
        <Divider label="connect ticktick" />
        <p>Add your TickTick Open API bearer token in Setup to show this week&apos;s tasks here.</p>
        <Button variant="ghost" href="/setup">&gt; open setup</Button>
      </section>
    )
  }

  const stepBack = () => (view === 'month' ? setMonthOffset(o => o - 1) : setOffset(o => o - 1))
  const stepForward = () => (view === 'month' ? setMonthOffset(o => o + 1) : setOffset(o => o + 1))
  const stepToday = () => (view === 'month' ? setMonthOffset(0) : setOffset(0))
  const isTodayOffset = view === 'month' ? monthOffset === 0 : offset === 0
  const rangeShown = view === 'month' ? monthLabel : rangeLabel(monday).toUpperCase()
  const countShown = view === 'month' ? monthCount : weekCount
  const now = new Date()
  const todayChip = `${DAY_NAMES[(now.getDay() + 6) % 7]} ${now.getDate()}`
  const cleared = summary.todayOpen === 0 && summary.late === 0

  const taskRow = (t: TickTickTask) => (
    <div key={t.id} className={`${styles.task} ${t.status === 2 ? styles.done : ''}`} title={t.projectName ?? undefined}>
      <span className={styles.dot} style={t.projectColor ? { backgroundColor: t.projectColor } : undefined} />
      <span className={styles.mark}>{t.status === 2 ? '×' : '▸'}</span>
      <span className={styles.taskText}>
        {timeLabel(t) && <span className={styles.time}>{timeLabel(t)} </span>}
        {t.title}
      </span>
    </div>
  )

  return (
    <div className={styles.layout}>
      <section className={`mc-widget ${styles.summary}`} aria-label="Today">
        <div className={styles.summaryHead}>
          <h2 className={styles.summaryTitle}>TODAY</h2>
          <span className={cleared ? styles.clear : styles.dim}>{cleared ? 'all clear' : `${summary.todayOpen} open`}</span>
        </div>
        <Kv keyWidth="7ch">
          <KvRow k="today" v={`${summary.todayOpen} open`} r={summary.late ? `${summary.late} late` : ''} />
          <KvRow k="week" v={`${summary.weekOpen} open`} r="" />
        </Kv>
        <div className={styles.next}>
          <span className={styles.nextLabel}>NEXT</span>
          {summary.next
            ? <span className={styles.nextBody}><Glyph g="todo" /> <span className={styles.nextTitle}>{summary.next.title}</span><span className={styles.nextWhen}>{summary.next.when}</span></span>
            : <span className={styles.dim}>nothing scheduled</span>}
        </div>
        <Prompt host="desk" foot meta={fetchError ? <span className={styles.err}>× {fetchError}</span> : '↻ 60s'} />
      </section>

      <section className={`mc-widget ${styles.cal}`} aria-label="TickTick calendar">
        <Prompt host="desk" cmd="ticktick" />
        <div className={styles.bar}>
          <span className={styles.range}>{rangeShown}</span>
          <span className={styles.count}>{countShown} {countShown === 1 ? 'task' : 'tasks'}</span>
          <span className={styles.dim}>{todayChip}</span>
          <span className={styles.toggle} role="group" aria-label="Calendar view">
            {(['grid', 'agenda', 'month'] as const).map(v => (
              <button key={v} type="button" className={view === v ? styles.active : ''} onClick={() => setView(v)} aria-pressed={view === v}>
                {v === 'agenda' ? 'list' : v}
              </button>
            ))}
          </span>
          <span className={styles.nav}>
            <button type="button" onClick={stepBack} aria-label={view === 'month' ? 'Previous month' : 'Previous week'}>◂</button>
            <button type="button" onClick={stepToday} disabled={isTodayOffset}>today</button>
            <button type="button" onClick={stepForward} aria-label={view === 'month' ? 'Next month' : 'Next week'}>▸</button>
          </span>
        </div>

        {data.error && <div className={styles.error} role="alert"><Glyph g="fail" /> {data.error}</div>}

        {view === 'month' ? (
          <>
            {monthCount === 0 && <p className={styles.note}>no tasks this month</p>}
            <div className={styles.month}>
              {DOW_SHORT.map(n => <div key={n} className={styles.dow}>{n}</div>)}
              {monthCells.map((c, i) =>
                c === null ? (
                  <div key={`blank-${i}`} className={styles.blank} />
                ) : (
                  <div
                    key={c.key}
                    className={`${styles.cell} ${c.isToday ? styles.today : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.key}${(byDay.get(c.key)?.length ?? 0) > 0 ? `, ${byDay.get(c.key)?.length} tasks` : ', no tasks'}`}
                    onClick={() => jumpToWeek(c.key)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToWeek(c.key) } }}
                  >
                    <span className={styles.cellNum}>{c.dayNum}</span>
                    {(byDay.get(c.key)?.length ?? 0) > 0 && <span className={styles.cellCount}>{byDay.get(c.key)!.length}</span>}
                  </div>
                ),
              )}
            </div>
          </>
        ) : weekCount === 0 ? (
          <div className={styles.empty}>
            <Divider label="no events this week" />
            <p className={styles.dim}>This week is clear — nothing scheduled. Add a task in TickTick and it appears here, or step to another week.</p>
            <div className={styles.emptyActions}>
              <Button variant="primary" href={ADD_URL}>&gt; add to ticktick ↗</Button>
              <Button onClick={() => setOffset(o => o - 1)}>◂ last week</Button>
              <Button onClick={() => setOffset(o => o + 1)}>next week ▸</Button>
            </div>
          </div>
        ) : view === 'grid' ? (
          <div className={styles.week}>
            {days.map(d => {
              const items = byDay.get(d.key) ?? []
              return (
                <div key={d.key} className={`${styles.day} ${d.isToday ? styles.today : ''} ${items.length === 0 ? styles.emptyDay : ''}`} aria-current={d.isToday ? 'date' : undefined}>
                  <div className={styles.dayHead}>
                    <span className={styles.dayName}>{d.name}</span>
                    <span className={styles.dayNum}>{d.dayNum}</span>
                  </div>
                  <div className={styles.dayBody}>
                    {items.length === 0 ? (
                      <a className={styles.add} href={ADD_URL} aria-label="Add an event to this day" title="Add an event">+ add</a>
                    ) : items.map(taskRow)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className={styles.agenda}>
            {days.map(d => {
              const items = byDay.get(d.key) ?? []
              return (
                <div key={d.key} className={`${styles.agendaDay} ${d.isToday ? styles.today : ''}`} aria-current={d.isToday ? 'date' : undefined}>
                  <div className={styles.dayHead}>
                    <span className={styles.dayName}>{d.name}</span>
                    <span className={styles.dayNum}>{d.dayNum}</span>
                  </div>
                  <div className={styles.agendaTasks}>
                    {items.length === 0 ? <span className={styles.dim}>—</span> : items.map(taskRow)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <Prompt host="desk" foot meta={`${countShown} ${countShown === 1 ? 'task' : 'tasks'}`} />
      </section>
    </div>
  )
}
