import { AuroraSky, type AuroraSkyRow } from './AuroraSky'
import styles from './aurora.module.css'

type Props = {
  /** Pre-formatted on the server so the date never differs between server and client render. */
  dateLabel: string
  timeLabel: string
  headline: string
  error?: string | null
  rows: AuroraSkyRow[]
  nowHour: number
  idleAgents?: string[]
  skyAvailable?: boolean
}

export function AuroraHero({ dateLabel, timeLabel, headline, error, rows, nowHour, idleAgents = [], skyAvailable = true }: Props) {
  return (
    <section className={styles.hero}>
      <p className={styles.date}>{dateLabel}, <span className={styles.num}>{timeLabel}</span></p>
      <h1 aria-live="polite">{headline}</h1>
      {error && <p className={styles.err} role="alert">{error}</p>}
      {skyAvailable ? (
        <AuroraSky rows={rows} nowHour={nowHour} />
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
