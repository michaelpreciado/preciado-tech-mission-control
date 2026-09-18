import type { ReactNode } from 'react'
import { Card } from './ui'
import styles from './ui.module.css'

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <Card as="header" className={styles.pageHeader}>
      <div className={styles.pageHeaderCopy}>
        {eyebrow && <div className={styles.pageHeaderEyebrow}>{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className={styles.pageHeaderActions}>{actions}</div>}
    </Card>
  )
}
