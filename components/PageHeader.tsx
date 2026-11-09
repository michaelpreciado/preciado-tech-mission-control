import type { ReactNode } from 'react'
import { Card, Prompt, type PromptHost } from './ui'
import styles from './ui.module.css'

/** Route header: a `desk:~$ <command>` prompt over a mono title. The eyebrow
 * rides the prompt's right-hand meta; the subtitle hides at ≤820px. */
export function PageHeader({ eyebrow, title, subtitle, actions, command, host = 'desk' }: {
  eyebrow?: string
  title: string
  subtitle: string
  actions?: ReactNode
  /** Prompt command; defaults to the lowercased title. */
  command?: string
  host?: PromptHost
}) {
  return (
    <Card as="header" className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        <Prompt host={host} cmd={command ?? title.toLowerCase()} meta={eyebrow?.toLowerCase()} className={styles.pageHeaderEyebrow} />
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className={styles.pageHeaderActions}>{actions}</div>}
    </Card>
  )
}
