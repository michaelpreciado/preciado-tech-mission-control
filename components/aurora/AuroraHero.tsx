import { AuroraSky, type AuroraSkyRow } from './AuroraSky'
import { AsciiHourRun, AsciiWordmark } from '../ascii-viz'
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
  rows: AuroraSkyRow[]
  nowHour: number
  idleAgents?: string[]
  skyAvailable?: boolean
}

/** The hour ruler under the phone glyph runs, one character per hour like the runs themselves. */
const HOUR_RULER = '00    06    12    18    '

/** Agent activity since local midnight. Desktop draws the SVG strands; phones get one
 *  glyph per hour per agent, which fits a 360px screen without sideways scrolling. */
export function AuroraSkyPanel({ timeLabel, rows, nowHour, idleAgents = [], skyAvailable = true }: SkyProps) {
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
      {skyAvailable && rows.length === 0 ? (
        <AuroraSky rows={rows} nowHour={nowHour} />
      ) : skyAvailable ? (
        <>
          <div className={styles.skyDesktop}><AuroraSky rows={rows} nowHour={nowHour} /></div>
          <div className={styles.skyGlyphs}>
            <ul aria-label="Agent activity by hour, today">
              {rows.map(row => (
                <li key={row.agent}>
                  <span className={styles.glyphAgent}>{row.agent}</span>
                  <AsciiHourRun spans={row.spans} nowHour={nowHour} label={row.agent} />
                </li>
              ))}
            </ul>
            <p className={styles.glyphRuler} aria-hidden="true"><span />{HOUR_RULER}</p>
            <p className={styles.glyphKey}>▁ to █ = share of the hour busy · ✕ = failed run</p>
          </div>
        </>
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
