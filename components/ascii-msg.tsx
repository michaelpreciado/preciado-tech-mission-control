import type { ReactNode } from 'react'
import './ascii-msg.css'

export function AsciiMsg({ who, side = 'agent', ts, idx, compact = false, children, actions, className = '' }: {
  who: string; side?: 'user' | 'agent' | 'system'; ts?: string; idx?: number
  compact?: boolean; children: ReactNode; actions?: ReactNode; className?: string
}) {
  return <article className={`amsg-frame amsg-${side}${compact ? ' amsg-compact' : ''} ${className}`}>
    <header className="amsg-head">
      <span className="amsg-tag">[{who.toUpperCase()}]</span>
      <span className="amsg-stamp">{ts ?? '—'}</span>
      {idx != null && <span className="amsg-index">#{String(idx).padStart(3, '0')}</span>}
      {actions}
    </header>
    <div className="amsg-body">{children}</div>
  </article>
}

export function AsciiPromptGutter({ empty }: { empty: boolean }) {
  return <span className="aprompt-gutter" aria-hidden="true">┃ &gt;<span className={`aprompt-cursor${empty ? ' aprompt-empty' : ''}`}>█</span></span>
}

export function messageSide(role: string, content?: string | null): 'user' | 'agent' | 'system' {
  if (content?.startsWith('[System:')) return 'system'
  return role === 'user' ? 'user' : role === 'assistant' ? 'agent' : 'system'
}
