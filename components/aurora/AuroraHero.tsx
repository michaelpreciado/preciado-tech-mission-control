import { AuroraSky, type AuroraSkyRow } from './AuroraSky'
import { Glyph, Prompt } from '../ui'
import { MiniHist } from '../charts/MiniHist'
import { hourCoverage } from '@/lib/glyph-series'
import styles from './aurora.module.css'

type HeroProps = {
  /** Pre-formatted on the server so the date never differs between server and client render. */
  dateLabel: string
  timeLabel: string
  headline: string
  error?: string | null
}

/** `desk:~$ status` — the spoken one-line summary of the day. */
export function AuroraHero({ dateLabel, timeLabel, headline, error }: HeroProps) {
  return (
    <section className={`mc-widget ${styles.hero}`}>
      <Prompt host="desk" cmd="status" meta={<>{dateLabel.toLowerCase()} · <span className={styles.num}>{timeLabel}</span></>} />
      <h1 aria-live="polite">{headline}</h1>
      {error && <p className={styles.err} role="alert"><Glyph g="err" /> {error}</p>}
    </section>
  )
}

type SkyProps = {
  timeLabel: string
  /** Server-formatted date ("Saturday, October 10"); its weekday labels the day boundary. */
  dateLabel?: string
  rows: AuroraSkyRow[]
  nowHour: number
  idleAgents?: string[]
  skyAvailable?: boolean
}

/** Agent-hours worked in each hour since midnight, summed across agents. */
function hourlyBusy(rows: AuroraSkyRow[]): number[] {
  const out = new Array<number>(24).fill(0)
  for (const row of rows) hourCoverage(row.spans, 24).forEach((v, h) => { out[h] += v })
  return out
}

/** `desk:~$ agents --today`: a 24-slot hourly histogram over the per-agent lane timeline.
 *  Phones pan a six-hour window of the lanes with "now" pinned near the right edge. */
export function AuroraSkyPanel({ timeLabel, dateLabel, rows, nowHour, idleAgents = [], skyAvailable = true }: SkyProps) {
  const dayLabel = dateLabel ? dateLabel.split(/[ ,]/)[0].slice(0, 3) : undefined
  const busy = hourlyBusy(rows)
  const busyHours = busy.reduce((a, b) => a + b, 0)
  const meta = skyAvailable ? `${rows.length} agent${rows.length === 1 ? '' : 's'} · now ${timeLabel}` : 'offline'
  return (
    <section className={`mc-widget ${styles.skyPanel}`} aria-labelledby="home-agents">
      <Prompt as="h2" id="home-agents" host="desk" cmd="agents --today" meta={meta} />
      {skyAvailable && rows.length > 0 && (
        <div className={styles.skyHist}>
          <span className={styles.skyHistKey}>24h</span>
          <MiniHist values={busy} days={24} label={`Agent-hours worked per hour today, 00 to 23: ${busy.map(v => v.toFixed(1)).join(', ')}`} />
          <span className={styles.skyHistVal}>{busyHours.toFixed(1)}h</span>
        </div>
      )}
      {skyAvailable ? (
        <AuroraSky rows={rows} nowHour={nowHour} dayLabel={dayLabel} />
      ) : (
        <div className={styles.skyEmpty} role="status">
          <strong><Glyph g="fail" /> agent activity unavailable</strong>
          No agent session stores could be read on this machine.
        </div>
      )}
      {rows.length > 0 && idleAgents.length > 0 && (
        <p className={styles.skyNote}><Glyph g="idle" /> quiet today: {idleAgents.join(', ')}</p>
      )}
    </section>
  )
}
