import { AuroraSky, type AuroraSkyRow } from './AuroraSky'
import { AsciiWordmark } from '../ascii-viz'
import styles from './aurora.module.css'

type HeroProps = {
  /** Pre-formatted on the server so the date never differs between server and client render. */
  dateLabel: string
  timeLabel: string
  headline: string
  error?: string | null
}

export function AuroraHero({ dateLabel, timeLabel, headline, error }: HeroProps) {
  return (
    <section className={styles.hero}>
      <AsciiWordmark id="missionControl" className={styles.wordmark} />
      <p className={styles.date}><span className={styles.chev} aria-hidden="true">&gt;</span>{dateLabel}, <span className={styles.num}>{timeLabel}</span></p>
      <h1 aria-live="polite"><span key={headline} className={styles.headline}>{headline}</span><span className={styles.cursor} aria-hidden="true" /></h1>
      {error && <p className={styles.err} role="alert">{error}</p>}
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

/** Agent activity since local midnight: the strand timeline, the same SVG on every screen.
 *  Phones pan a six-hour window of it with "now" pinned near the right edge. */
export function AuroraSkyPanel({ timeLabel, dateLabel, rows, nowHour, idleAgents = [], skyAvailable = true }: SkyProps) {
  const dayLabel = dateLabel ? dateLabel.split(/[ ,]/)[0].slice(0, 3) : undefined
  return (
    <section className={styles.skyPanel} data-glass="" aria-labelledby="home-agents">
      <div className={styles.panelHead}>
        <span className={styles.lights} aria-hidden="true"><i /><i /><i /></span>
        <h2 className={styles.panelTitle} id="home-agents">Agent activity <span className={styles.panelPath}>· today</span></h2>
        <span className={styles.boot} aria-hidden="true">
          <span className={styles.bootInit}>initializing module…</span>
          <span className={styles.bootReady}>{skyAvailable ? `${rows.length} agent${rows.length === 1 ? '' : 's'} · now ${timeLabel}` : 'offline'}</span>
        </span>
      </div>
      {skyAvailable ? (
        <AuroraSky rows={rows} nowHour={nowHour} dayLabel={dayLabel} />
      ) : (
        <div className={styles.skyEmpty} role="status">
          <strong>Agent activity is unavailable</strong>
          No agent session stores could be read on this machine.
        </div>
      )}
      {rows.length > 0 && idleAgents.length > 0 && (
        <p className={styles.skyNote}>Quiet today: {idleAgents.join(', ')}</p>
      )}
    </section>
  )
}
