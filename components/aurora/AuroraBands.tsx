import Link from 'next/link'
import styles from './aurora.module.css'

export type BandAction = { label: string; href: string; primary?: boolean }
export type BandItem = {
  id: string
  title: string
  description?: string | null
  meta?: { text: string; num?: boolean }[]
  actions?: BandAction[]
  /** Status dot for the "Broke" band. */
  tone?: 'error' | 'warn'
}

type BandProps = {
  title: string
  count: number | null
  countTone?: 'error'
  linkLabel: string
  href: string
  items: BandItem[]
  /** How many items exist beyond the ones shown. */
  more?: { count: number; label: string; href: string }
  empty: { title: string; hint?: string }
  variant: 'waiting' | 'broke'
}

function Band({ title, count, countTone, linkLabel, href, items, more, empty, variant }: BandProps) {
  return (
    <article className={`${styles.band} ${variant === 'waiting' ? styles.waiting : styles.broke}`} data-glass="">
      <header>
        <h2><span className={styles.chev} aria-hidden="true">&gt;</span>{title}</h2>
        {count !== null && <span className={`${styles.count} ${countTone === 'error' && count > 0 ? styles.countErr : ''}`}>{count}</span>}
        <Link href={href}>{linkLabel}</Link>
      </header>
      {items.length === 0 ? (
        <div className={styles.empty}><strong>{empty.title}</strong>{empty.hint}</div>
      ) : (
        <ul className={styles.list} aria-label={title}>
          {items.map(it => (
            <li key={it.id} className={styles.item}>
              {variant === 'broke' && <i className={`${styles.dot} ${it.tone === 'warn' ? styles.dotWarn : styles.dotErr}`} aria-hidden="true" />}
              <div className={styles.itemMain}>
                <h3>{it.title}</h3>
                {it.description && <p>{it.description}</p>}
                {it.meta && it.meta.length > 0 && (
                  <div className={styles.meta}>{it.meta.map((m, i) => <span key={i} className={m.num ? styles.num : undefined}>{m.text}</span>)}</div>
                )}
              </div>
              {it.actions && it.actions.length > 0 && (
                <div className={styles.acts}>
                  {it.actions.map(a => (
                    <Link key={a.label} href={a.href} className={`${styles.btn} ${a.primary ? styles.btnPrimary : ''}`}>{a.label}</Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {more && more.count > 0 && <Link href={more.href} className={styles.more}>{more.count} {more.label}</Link>}
    </article>
  )
}

export function AuroraBands({ waiting, broke }: { waiting: Omit<BandProps, 'variant'>; broke: Omit<BandProps, 'variant'> }) {
  return (
    <section className={styles.bands}>
      <Band {...waiting} variant="waiting" />
      <Band {...broke} variant="broke" />
    </section>
  )
}
