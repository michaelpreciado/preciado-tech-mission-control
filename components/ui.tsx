'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

/* ── Floating window support ──────────────────────────────
   Every panel can pop out into a draggable, resizable window layered over
   the deck (desktop only). Floats portal to <body> because the themed
   .mc-main carries a CSS transform, which would hijack position:fixed. */
let topZ = 900
type FloatRect = { x: number; y: number; w: number; h: number }

function useDrag(onMove: (dx: number, dy: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return
    onMove(e.clientX - start.current.x, e.clientY - start.current.y)
    start.current = { x: e.clientX, y: e.clientY }
  }, [onMove])
  const onPointerUp = useCallback(() => { start.current = null }, [])
  return { onPointerDown, onPointerMove, onPointerUp }
}

export function Window({ tag, title, meta, children, style }: {
  tag?: string
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [float, setFloat] = useState<FloatRect | null>(null)
  const [z, setZ] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const popOut = () => {
    const w = Math.min(720, window.innerWidth - 80)
    const h = Math.min(520, window.innerHeight - 120)
    const offset = (topZ - 900) % 8
    setFloat({ x: 60 + offset * 24, y: 70 + offset * 20, w, h })
    setZ(++topZ)
  }
  const dock = () => setFloat(null)

  const clamp = (r: FloatRect): FloatRect => ({
    x: Math.min(Math.max(r.x, -r.w + 80), window.innerWidth - 60),
    y: Math.min(Math.max(r.y, 0), window.innerHeight - 40),
    w: Math.max(300, Math.min(r.w, window.innerWidth)),
    h: Math.max(160, Math.min(r.h, window.innerHeight)),
  })
  const drag = useDrag((dx, dy) => setFloat(f => f && clamp({ ...f, x: f.x + dx, y: f.y + dy })))
  const resize = useDrag((dx, dy) => setFloat(f => f && clamp({ ...f, w: f.w + dx, h: f.h + dy })))

  useEffect(() => {
    if (!float) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dock() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [float])

  const head = (floating: boolean) => (
    <div
      className="mc-window-head"
      style={floating ? { cursor: 'grab', touchAction: 'none' } : undefined}
      onDoubleClick={floating ? dock : undefined}
      {...(floating ? drag : {})}
    >
      <div className="mc-window-title">
        {tag && <span className="mc-win-tag">{tag}</span>}
        <span>{title}</span>
      </div>
      {meta && <div className="mc-window-meta">{meta}</div>}
      <button
        type="button"
        className="mc-win-float-btn"
        title={floating ? 'Dock back (Esc)' : 'Pop out as floating window'}
        aria-label={floating ? 'Dock window' : 'Float window'}
        onClick={floating ? dock : popOut}
        onPointerDown={e => e.stopPropagation()}
      >
        {floating ? '⇲' : '⧉'}
      </button>
    </div>
  )

  if (float && mounted) {
    return (
      <>
        <div className="mc-window mc-window-ghost" style={style}>
          <div className="mc-window-head">
            <div className="mc-window-title">
              {tag && <span className="mc-win-tag">{tag}</span>}
              <span>{title}</span>
            </div>
            <button type="button" className="mc-win-float-btn" title="Dock back" onClick={dock}>⇲</button>
          </div>
          <div className="mc-window-ghost-note">floating — press Esc or ⇲ to dock</div>
        </div>
        {createPortal(
          <div
            className="mc-window is-floating"
            style={{ left: float.x, top: float.y, width: float.w, height: float.h, zIndex: z }}
            onPointerDown={() => setZ(++topZ)}
          >
            {head(true)}
            <div className="mc-window-float-body">{children}</div>
            <div className="mc-window-resize" title="Resize" {...resize} />
          </div>,
          document.body,
        )}
      </>
    )
  }

  return (
    <div className="mc-window" style={style}>
      {head(false)}
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

/* ── SYS-02: expandable clamped text ─────────────────────
   Renders `text` clamped to `lines` with an ellipsis. When the content
   actually overflows it becomes a soft affordance (dotted underline) that
   opens a full-preview modal. The preview portals to <body> — .mc-main
   carries a CSS transform that would otherwise hijack position:fixed —
   so expanding never shifts the surrounding layout. A native title tooltip
   gives an affordance on any non-interactive host. */
export function Clamp({ text, lines = 2, label = 'FULL TEXT', className }: {
  text: string
  lines?: number
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [text, lines])

  const openPreview = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <span
        ref={ref}
        className={`mc-clamp ${overflows ? 'mc-clamp-btn' : ''} ${className ?? ''}`}
        style={{ WebkitLineClamp: lines }}
        title={text}
        onClick={overflows ? openPreview : undefined}
        onKeyDown={overflows ? (e) => { if (e.key === 'Enter' || e.key === ' ') openPreview(e) } : undefined}
        role={overflows ? 'button' : undefined}
        tabIndex={overflows ? 0 : undefined}
        aria-expanded={overflows ? open : undefined}
      >
        {text}
      </span>
      {open && mounted && createPortal(
        <div className="mc-modal-overlay" onClick={() => setOpen(false)}>
          <div className="mc-modal" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}>
            <button className="mc-modal-close" aria-label="Close preview" onClick={() => setOpen(false)}>✕</button>
            <h3>{label}</h3>
            <div className="mc-preview-body">{text}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
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
