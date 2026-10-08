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
      <p className={styles.date}><span className={styles.chev} aria-hidden="true">&gt;</span>{dateLabel}, <span className={styles.num}>{timeLabel}</span></p>
      <h1 aria-live="polite"><span key={headline} className={styles.headline}>{headline}</span><span className={styles.cursor} aria-hidden="true" /></h1>
      {error && <p className={styles.err} role="alert">{error}</p>}
      <div className={styles.skyPanel} data-glass="">
        <div className={styles.panelHead}>
          <span className={styles.lights} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.panelTitle}>Agent activity <span className={styles.panelPath}>· last 24h</span></span>
          <span className={styles.boot} aria-hidden="true">
            <span className={styles.bootInit}>initializing module…</span>
            <span className={styles.bootReady}>{skyAvailable ? `${rows.length} agent${rows.length === 1 ? '' : 's'} · now ${timeLabel}` : 'offline'}</span>
          </span>
        </div>
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
      </div>
    </section>
  )
}
