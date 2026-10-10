import Link from 'next/link'
import { AsciiWordmark } from '../ascii-viz'
import type { WordmarkId } from '@/lib/wordmarks'
import styles from './aurora.module.css'

export type BandAction = { label: string; href: string; primary?: boolean }
export type BandTone = 'error' | 'warn' | 'ok' | 'info' | 'muted'
export type BandItem = {
  id: string
  title: string
  description?: string | null
  meta?: { text: string; num?: boolean }[]
  actions?: BandAction[]
  /** Status dot (Broke / Moved bands). */
  tone?: BandTone
  /** Whole row is the link (compact rows, no action buttons). */
  href?: string
}

type BandProps = {
  /** Anchor the status strip scrolls to. */
  anchor: string
  wordmark: WordmarkId
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

const DOT: Record<BandTone, string> = { error: styles.dotErr, warn: styles.dotWarn, ok: styles.dotOk, info: styles.dotInfo, muted: '' }

function Band({ anchor, wordmark, count, countTone, linkLabel, href, items, more, empty, source, variant }: BandProps) {
  const dotted = variant !== 'waiting'
  return (
    <article id={anchor} className={`${styles.band} ${styles[variant]}`} data-glass="" aria-labelledby={`${anchor}-h`}>
      <header>
        <h2 id={`${anchor}-h`}><AsciiWordmark id={wordmark} className={styles.bandMark} /></h2>
        {count !== null && <span className={`${styles.count} ${countTone === 'error' && count > 0 ? styles.countErr : ''}`}>{count}</span>}
        <Link href={href}>{linkLabel}</Link>
      </header>
      {items.length === 0 ? (
        <div className={styles.empty}><strong>{empty.title}</strong>{empty.hint}</div>
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
            const dot = dotted && <i className={`${styles.dot} ${DOT[it.tone ?? 'muted']}`} aria-hidden="true" />
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
  /** Glyph trend under the number, e.g. moves per hour. */
  trend?: { glyphs: string; label: string }
  hint: string
}

/** The first fold on a phone: four counts that answer "what needs me, what broke, what moved". */
export function StatusStrip({ cells }: { cells: StatusCell[] }) {
  return (
    <nav className={styles.strip} aria-label="Status at a glance">
      {cells.map(c => {
        const lit = c.value != null && c.value > 0 && c.tone
        return (
          <a key={c.key} href={c.href} className={`${styles.cell} ${lit ? styles[`cell_${c.tone}`] : ''}`}>
            <span className={styles.cellLabel}>{c.label}</span>
            <span className={`${styles.cellValue} ${styles.num}`}>{c.value ?? '—'}</span>
            {c.trend
              ? <span className={styles.cellTrend} role="img" aria-label={c.trend.label}><span aria-hidden="true">{c.trend.glyphs}</span></span>
              : <span className={styles.cellHint}>{c.hint}</span>}
          </a>
        )
      })}
    </nav>
  )
}
