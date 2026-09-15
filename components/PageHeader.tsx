import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <header className="ob-pagehead">
      <div className="ob-pagehead-copy">
        {eyebrow && <div className="ob-pagehead-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="ob-pagehead-actions">{actions}</div>}
    </header>
  )
}
