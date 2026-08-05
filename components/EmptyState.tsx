'use client'

/**
 * Shared contextual empty state.
 *
 * Replaces the old "tall empty rectangle + thin `— empty —` line" pattern across
 * Calendar, Chat, Approvals, and Kanban with a compact guidance card: it explains
 * WHY the view is empty, offers a clear next action where one exists, and fills
 * the space with a subtle dot pattern instead of a void.
 *
 * Style lives in app/globals.css under `.mc-empty`. Kept dumb and theme-agnostic
 * so it can be dropped into any tab without pulling in per-tab CSS.
 */
import type { ReactNode } from 'react'

export type EmptyStateAction = {
  label: string
  onClick?: () => void
  /** Render the action as a link instead of a button. */
  href?: string
  /** Filled, high-contrast treatment for the single most-likely next step. */
  primary?: boolean
}

export function EmptyState({
  glyph = '◇',
  title,
  desc,
  actions = [],
  compact = false,
  tone = 'neutral',
}: {
  /** Single glyph that stands in for the section (no emoji nav — one token). */
  glyph?: string
  /** One short line naming the state, uppercase treatment by default in CSS. */
  title: string
  /** One or two sentences of guidance: why it's empty and what to do. */
  desc?: ReactNode
  actions?: EmptyStateAction[]
  /** Inline (in-column) rendering with tighter padding for nested empties. */
  compact?: boolean
  tone?: 'neutral' | 'success' | 'info' | 'error'
}) {
  return (
    <div className={`mc-empty is-${tone}${compact ? ' is-compact' : ''}`} role="status" aria-live="polite">
      <span className="mc-empty-glyph" aria-hidden>{glyph}</span>
      <span className="mc-empty-title">{title}</span>
      {desc && <p className="mc-empty-desc">{desc}</p>}
      {actions.length > 0 && (
        <div className="mc-empty-actions">
          {actions.map((a, i) => {
            const cls = `mc-empty-btn${a.primary ? ' is-primary' : ''}`
            return a.href ? (
              <a key={i} className={cls} href={a.href} onClick={a.onClick}>{a.label}</a>
            ) : (
              <button key={i} type="button" className={cls} onClick={a.onClick}>{a.label}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}
