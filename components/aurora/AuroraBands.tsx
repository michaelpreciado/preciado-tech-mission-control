import Link from 'next/link'
import { Divider, Glyph, Verdict, type GlyphName } from '../ui'
import { MiniHist } from '../charts/MiniHist'
import styles from './aurora.module.css'

export type BandAction = { label: string; href: string; primary?: boolean }
export type BandTone = 'error' | 'warn' | 'ok' | 'info' | 'muted'
export type BandItem = {
  id: string
  title: string
  description?: string | null
  meta?: { text: string; num?: boolean }[]
  actions?: BandAction[]
  /** Status glyph (Broke / Moved bands). */
  tone?: BandTone
  /** Whole row is the link (compact rows, no action buttons). */
  href?: string
}

type BandProps = {
  /** Anchor the status strip scrolls to. */
  anchor: string
  /** Divider label, lowercase: `-- needs you 2 ------`. */
  label: string
  count: number | null
  countTone?: 'error'
  linkLabel: string
  href: string
  items: BandItem[]
  /** How many items exist beyond the ones shown. */
  more?: { count: number; label: string; href: string }
  empty: { title: string; hint?: string }
  /** Provenance line under the list: where the rows came from. */
  source?: string
  variant: 'waiting' | 'broke' | 'moved'
}

/** done `>` · failed `×` · started `↻` · created `·`; amber × is degraded, red × is down. */
const GLYPH: Record<BandTone, GlyphName> = { error: 'err', warn: 'fail', ok: 'ok', info: 'retry', muted: 'idle' }

function Band({ anchor, label, count, countTone, linkLabel, href, items, more, empty, source, variant }: BandProps) {
  const dotted = variant !== 'waiting'
  const lit = count !== null && count > 0 ? (countTone === 'error' ? styles.countErr : variant === 'waiting' ? styles.countWarn : '') : ''
  return (
    <article id={anchor} className={`mc-widget ${styles.band} ${styles[variant]}`} aria-labelledby={`${anchor}-h`}>
      <header>
        <Divider as="h2" id={`${anchor}-h`} className={styles.bandDivider} label={<>{label}{count !== null && <> <span className={`${styles.count} ${lit}`}>{count}</span></>}</>} />
        <Link href={href}>{linkLabel.toLowerCase()} ›</Link>
      </header>
      {items.length === 0 ? (
        <div className={styles.empty}><strong><Glyph g={variant === 'waiting' ? 'ok' : 'idle'} /> {empty.title.toLowerCase()}</strong>{empty.hint}</div>
      ) : (
        <ul className={styles.list}>
          {items.map(it => {
            const main = (
              <div className={styles.itemMain}>
                <h3>{it.title}</h3>
                {it.description && <p>{it.description}</p>}
                {it.meta && it.meta.length > 0 && (
                  <div className={styles.meta}>{it.meta.map((m, i) => <span key={i} className={m.num ? styles.num : undefined}>{m.text}</span>)}</div>
                )}
              </div>
            )
            const dot = dotted && <Glyph g={GLYPH[it.tone ?? 'muted']} className={styles.dot} />
            if (it.href) return (
              <li key={it.id} className={`${styles.item} ${styles.itemLink}`}>
                <Link href={it.href}>{dot}{main}<span className={styles.chevR} aria-hidden="true">›</span></Link>
              </li>
            )
            return (
            <li key={it.id} className={styles.item}>
              {dot}
              {main}
              {it.actions && it.actions.length > 0 && (
                <div className={styles.acts}>
                  {it.actions.map(a => (
                    <Link key={a.label} href={a.href} className={`${styles.btn} ${a.primary ? styles.btnPrimary : ''}`}>{a.label}</Link>
                  ))}
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}
      {more && more.count > 0 && <Link href={more.href} className={styles.more}>{more.count} {more.label}</Link>}
      {source && <p className={styles.source}>{source}</p>}
    </article>
  )
}

export function AuroraBands({ waiting, broke, moved }: {
  waiting: Omit<BandProps, 'variant'>
  broke: Omit<BandProps, 'variant'>
  moved: Omit<BandProps, 'variant'>
}) {
  return (
    <section className={styles.bands}>
      <Band {...waiting} variant="waiting" />
      <Band {...broke} variant="broke" />
      <Band {...moved} variant="moved" />
    </section>
  )
}

export type StatusCell = {
  key: string
  label: string
  /** null = not read yet; rendered as an em dash, never as 0. */
  value: number | null
  href: string
  tone?: 'alert' | 'error' | 'live'
  /** Mini histogram under the number, e.g. moves per hour (oldest first). */
  trend?: { values: number[]; label: string }
  hint: string
}

const CELL_TONE = { alert: 'warn', error: 'crit', live: undefined } as const

/** The first fold on a phone: four verdict numerals that answer "what needs me, what broke,
 *  what moved". A lit cell is the only colour on the strip; zero stays quiet. */
export function StatusStrip({ cells }: { cells: StatusCell[] }) {
  return (
    <nav className={styles.strip} aria-label="Status at a glance">
      {cells.map(c => {
        const lit = c.value != null && c.value > 0 && c.tone ? c.tone : null
        return (
          <a key={c.key} href={c.href} className={`mc-widget mc-widget--tight ${styles.cell}`} data-lit={lit ?? undefined}>
            <Verdict className={styles.cellValue} tone={lit ? CELL_TONE[lit] : undefined}>{c.value ?? '—'}</Verdict>
            <span className={styles.cellLabel}>{lit === 'live' && <Glyph g="live" />}{c.label.toLowerCase()}</span>
            {c.trend
              ? <MiniHist values={c.trend.values} days={c.trend.values.length} label={c.trend.label} className={styles.cellTrend} />
              : <span className={styles.cellHint}>{c.hint}</span>}
          </a>
        )
      })}
    </nav>
  )
}
