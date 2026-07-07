'use client'

import React from 'react'

export function fmtDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function SectionHead({ label, pre, post }: { label: string; pre?: React.ReactNode; post?: React.ReactNode }) {
  return (
    <div className="mc-ascii-head">
      {pre ? <span>{pre}</span> : null}
      <span className="rule" />
      <span className="label">{label}</span>
      <span className="rule" />
      {post ? <span>{post}</span> : null}
    </div>
  )
}

export function Window({ tag, title, meta, children, style }: {
  tag?: string
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="mc-window" style={style}>
      <div className="mc-window-head">
        <div className="mc-window-dots"><span /><span /><span /></div>
        <div className="mc-window-title">
          {tag && <span className="mc-win-tag">{tag}</span>}
          <span>{title}</span>
        </div>
        {meta && <div className="mc-window-meta">{meta}</div>}
      </div>
      {children}
    </div>
  )
}

export function SkeletonPanel({ label }: { label: string }) {
  return (
    <div className="mc-window" role="status" aria-live="polite">
      <div style={{ padding: 14, color: 'var(--pt-text-dim)', fontSize: 11, letterSpacing: '0.14em' }}>
        {label}...
      </div>
    </div>
  )
}

export function EmptyTerminal({ label }: { label: string }) {
  return (
    <div className="mc-window" style={{ padding: 24, textAlign: 'center' }}>
      <pre style={{ color: 'var(--pt-text-dim)', fontSize: 11, marginBottom: 8 }}>{`  .----.\n / zZ /\\\n'----'  '`}</pre>
      <div style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--pt-text-mute)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

/* Legacy aliases for backward compat */
export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return <SectionHead label={title.toUpperCase()} post={right} />
}

export function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: string }) {
  return <span className="mc-task-tag" data-tone={tone}>{children}</span>
}
