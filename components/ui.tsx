'use client'

import React, { useCallback, useEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { AsciiTerminalArt } from '@/app/vf/Ascii'
import { Sparkline } from './Sparkline'
import styles from './ui.module.css'

export function fmtDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/* ── Button ────────────────────────────────────────────────
   The one shared clickable-control primitive (`.mc-btn` family in
   globals.css). Every button/link-styled-as-button in the app should render
   through this instead of hand-rolling a class list on a raw <button>/<a>.

   Variants (visual intent, not semantics elsewhere):
     ghost   — default. Transparent, border + text, glows on hover. Most
               controls (refresh, toggles, secondary actions).
     primary — filled accent. The one obvious next step (save, complete,
               send, create).
     danger  — destructive/irreversible action. Red border + text.
     confirm — an affirming action that isn't the primary CTA (e.g.
               unblock/approve inline in a list of actions).

   States: hover/active are handled by CSS; `loading` shows an inline
   spinner and implies disabled/aria-busy; `active` is a toggled/pressed
   visual state (e.g. a mode switch that is currently "on"), not the CSS
   `:active` pseudo-class.

   Renders a <button> by default, or an <a> when `href` is passed — same
   classes, same motion, so a link styled as a button is never a special
   case. */
export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'confirm'

type ButtonOwnProps = {
  variant?: ButtonVariant
  /** Toggled/pressed visual state — distinct from the CSS :active (press) state. */
  active?: boolean
  /** Shows an inline spinner; also disables the control while true. */
  loading?: boolean
  /** Render as an <a> instead of a <button>. */
  href?: string
  className?: string
  children?: React.ReactNode
}

export type ButtonProps = ButtonOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps>

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ variant = 'ghost', active, loading = false, href, className = '', children, disabled, type = 'button', ...rest }, ref) {
    const obVariant = variant === 'confirm' ? 'ob-btn-confirm' : `ob-btn-${variant}`
    const cls = [
      'mc-btn',
      `mc-btn-${variant}`,
      'ob-btn',
      obVariant,
      active ? 'is-on' : '',
      loading ? 'is-loading' : '',
      className,
    ].filter(Boolean).join(' ')

    const spinner = loading ? <span className="mc-btn-spinner" aria-hidden="true">↻</span> : null

    if (href) {
      // Anchor rendering shares onClick/etc with the button props type — cast
      // is safe because <a> accepts the same event-handler shapes we pass through.
      const anchorRest = rest as unknown as React.AnchorHTMLAttributes<HTMLAnchorElement>
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={cls}
          aria-disabled={disabled || loading || undefined}
          {...anchorRest}
        >
          {spinner}{children}
        </a>
      )
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={cls}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-pressed={active}
        {...rest}
      >
        {spinner}{children}
      </button>
    )
  },
)

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

/** Adds inert corner marks to a DOM surface or Window without a layout wrapper. */
export function TFrame({ children }: {
  children: React.ReactElement<{ className?: string; children?: React.ReactNode; frameCorners?: React.ReactNode }>
}) {
  const className = [children.props.className, 'tframe-surface'].filter(Boolean).join(' ')
  const corners = ['tl', 'tr', 'bl', 'br'].map(corner => (
    <span key={`tframe-${corner}`} className={`tframe-tick tframe-${corner}`} aria-hidden="true" />
  ))
  // Window keeps decorations outside its scroll body when floated into a portal.
  if (children.type === Window) return React.cloneElement(children, { className, frameCorners: corners })
  return React.cloneElement(children, { className }, children.props.children, ...corners)
}

export function SectionRule({ label, index, post, id }: {
  label: string; index?: number; post?: React.ReactNode; id?: string
}) {
  return <div className="srule-section">
    <div className="srule-line">
      <span className="srule-stroke srule-lead" aria-hidden="true" />
      <h2 className="srule-label" id={id}>{label}</h2>
      <span className="srule-stroke" aria-hidden="true" />
      {index != null && <span className="srule-index" aria-hidden="true">[{String(index).padStart(2, '0')}]</span>}
    </div>
    {post && <div className="srule-meta">{post}</div>}
  </div>
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

export function Window({ tag, title, meta, children, style, className = '', frameCorners }: {
  tag?: string
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  frameCorners?: React.ReactNode
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
      <div className="mc-window-dots" aria-hidden="true">
        <span className="mc-window-dot mc-window-dot--red" />
        <span className="mc-window-dot mc-window-dot--amber" />
        <span className="mc-window-dot mc-window-dot--green" />
      </div>
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
            <div className="mc-window-dots" aria-hidden="true">
              <span className="mc-window-dot mc-window-dot--red" />
              <span className="mc-window-dot mc-window-dot--amber" />
              <span className="mc-window-dot mc-window-dot--green" />
            </div>
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
            className={`mc-window is-floating ${className}`}
            style={{ left: float.x, top: float.y, width: float.w, height: float.h, zIndex: z }}
            onPointerDown={() => setZ(++topZ)}
          >
            {frameCorners}
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
    <div className={`mc-window ${className}`} style={style}>
      {frameCorners}
      {head(false)}
      {children}
    </div>
  )
}

export function SkeletonPanel({ label }: { label: string }) {
  return (
    <div className="mc-window" role="status" aria-live="polite">
      <div className="mc-skel" aria-hidden="true">
        <span className="mc-skel-line" style={{ width: '42%' }} />
        <span className="mc-skel-line" style={{ width: '76%' }} />
        <span className="mc-skel-line" style={{ width: '58%' }} />
      </div>
      <span className="mc-skel-label">{label}…</span>
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
      <AsciiTerminalArt />
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

/* ── Foundation primitives ────────────────────────────────────────────────
   These are the component-owned surfaces and controls for new work. The
   legacy exports above intentionally keep their existing class contracts. */

export type CardTone = 'default' | 'raised' | 'sunken'
export type CardPad = 'none' | 'sm' | 'md'
export type CardProps = {
  as?: 'div' | 'section' | 'article' | 'header'
  tone?: CardTone
  pad?: CardPad
  className?: string
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { as: Element = 'div', tone = 'default', pad = 'none', className = '', children, ...rest },
  ref,
) {
  const toneClass = tone === 'raised' ? styles.cardRaised : tone === 'sunken' ? styles.cardSunken : ''
  const padClass = pad === 'sm' ? styles.cardPadSm : pad === 'md' ? styles.cardPadMd : styles.cardPadNone
  return React.createElement(Element, {
    ...rest,
    ref,
    className: [styles.card, toneClass, padClass, className].filter(Boolean).join(' '),
  }, children)
})

export type CardHeadProps = {
  title: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export const CardHead = React.forwardRef<HTMLDivElement, CardHeadProps>(function CardHead(
  { title, sub, right, className = '' },
  ref,
) {
  return (
    <div ref={ref} className={[styles.cardHead, className].filter(Boolean).join(' ')}>
      <div className={styles.cardHeadCopy}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {sub ? <p className={styles.cardSub}>{sub}</p> : null}
      </div>
      {right ? <div className={styles.cardRight}>{right}</div> : null}
    </div>
  )
})

export type FieldProps = {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, hint, error, className = '', children },
  ref,
) {
  const controlId = useId()
  const child = React.isValidElement(children)
    ? children as React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
    : null
  const childId = child?.props.id ?? controlId
  const describedBy = [child?.props['aria-describedby'], hint ? `${controlId}-hint` : '', error ? `${controlId}-error` : ''].filter(Boolean).join(' ') || undefined
  const control = child
    ? React.cloneElement(child, { id: childId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : child.props['aria-invalid'] })
    : children
  return (
    <div ref={ref} className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.fieldLabel} htmlFor={childId}>{label}</label>
      <div className={styles.fieldControl}>{control}</div>
      {error ? <p className={styles.fieldError} id={`${controlId}-error`} role="alert">{error}</p> : hint ? <p className={styles.fieldHint} id={`${controlId}-hint`}>{hint}</p> : null}
    </div>
  )
})

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & { className?: string }

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={[styles.input, className].filter(Boolean).join(' ')} {...rest} />
})

export type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { className?: string }

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={[styles.textArea, className].filter(Boolean).join(' ')} {...rest} />
})

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { className?: string }

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className = '', ...rest }, ref) {
  return <select ref={ref} className={[styles.select, className].filter(Boolean).join(' ')} {...rest} />
})

export type SegmentedOption = { value: string; label: React.ReactNode }
export type SegmentedProps = {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  className?: string
}

export const Segmented = React.forwardRef<HTMLDivElement, SegmentedProps>(function Segmented(
  { options, value, onChange, size = 'md', className = '' },
  ref,
) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const move = (index: number) => {
    const next = options[index]
    if (!next) return
    onChange(next.value)
    itemRefs.current[index]?.focus()
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex != null && options.length > 0) {
      event.preventDefault()
      move(nextIndex)
    }
  }
  return (
    <div ref={ref} className={[styles.segmented, size === 'sm' ? styles.segmentedSm : styles.segmentedMd, className].filter(Boolean).join(' ')} role="radiogroup">
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={node => { itemRefs.current[index] = node }}
            type="button"
            className={[styles.segmentedItem, selected ? styles.segmentedItemSelected : ''].filter(Boolean).join(' ')}
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === 0 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={event => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
})

export type ChipTone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad' | 'accent'
export type ChipProps = {
  tone?: ChipTone
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { tone = 'neutral', icon, children, className = '' },
  ref,
) {
  const toneClass = {
    neutral: styles.chipNeutral,
    info: styles.chipInfo,
    ok: styles.chipOk,
    warn: styles.chipWarn,
    bad: styles.chipBad,
    accent: styles.chipAccent,
  }[tone]
  return <span ref={ref} className={[styles.chip, toneClass, className].filter(Boolean).join(' ')} data-tone={tone}>{icon ? <span aria-hidden="true">{icon}</span> : null}{children}</span>
})

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'> & {
  'aria-label': string
  className?: string
  children?: React.ReactNode
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', type = 'button', children, ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={[styles.iconButton, className].filter(Boolean).join(' ')} {...rest}>{children}</button>
})

export type StatProps = {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: ChipTone
  size?: 'hero' | 'lg' | 'md'
  series?: number[]
  className?: string
}

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(function Stat(
  { label, value, sub, tone = 'neutral', size = 'md', series, className = '' },
  ref,
) {
  const toneClass = tone === 'info' ? styles.statInfo : tone === 'ok' ? styles.statOk : tone === 'warn' ? styles.statWarn : tone === 'bad' ? styles.statBad : tone === 'accent' ? styles.statAccent : ''
  const sparkColor = tone === 'ok' ? 'var(--pt-ok-ink)' : tone === 'warn' ? 'var(--pt-warn-ink)' : tone === 'bad' ? 'var(--pt-error-ink)' : tone === 'info' ? 'var(--pt-info-ink)' : 'var(--pt-neon)'
  return (
    <div ref={ref} className={[styles.stat, size === 'hero' ? styles.statHero : size === 'lg' ? styles.statLg : styles.statMd, toneClass, className].filter(Boolean).join(' ')}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {sub ? <span className={styles.statSub}>{sub}</span> : null}
      {series ? <div className={styles.statSparkline}><Sparkline points={series} color={sparkColor} /></div> : null}
    </div>
  )
})

export type RowProps = {
  leading?: React.ReactNode
  title: React.ReactNode
  sub?: React.ReactNode
  trailing?: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLElement>
  href?: string
  className?: string
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children' | 'title' | 'onClick'>

export const Row = React.forwardRef<HTMLElement, RowProps>(function Row(
  { leading, title, sub, trailing, onClick, href, className = '', ...rest },
  ref,
) {
  const content = (
    <>
      {leading ? <span className={styles.rowLeading}>{leading}</span> : null}
      <span className={styles.rowBody}><span className={styles.rowTitle}>{title}</span>{sub ? <span className={styles.rowSub}>{sub}</span> : null}</span>
      {trailing ? <span className={styles.rowTrailing}>{trailing}</span> : null}
    </>
  )
  const rowClass = [styles.row, onClick || href ? styles.rowInteractive : '', className].filter(Boolean).join(' ')
  if (href) return <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={rowClass} onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>} {...rest as React.AnchorHTMLAttributes<HTMLAnchorElement>}>{content}</a>
  if (onClick) return <button ref={ref as React.Ref<HTMLButtonElement>} type="button" className={rowClass} onClick={onClick as React.MouseEventHandler<HTMLButtonElement>} {...rest as React.ButtonHTMLAttributes<HTMLButtonElement>}>{content}</button>
  return <div ref={ref as React.Ref<HTMLDivElement>} className={rowClass} {...rest}>{content}</div>
})

export type SheetProps = {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  size?: 'auto' | 'tall'
}

export const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  { open, onClose, title, children, size = 'auto' },
  forwardedRef,
) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const assignRef = useCallback((node: HTMLDivElement | null) => {
    sheetRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const main = document.querySelector('main')
    const wasInert = main?.inert ?? false
    if (main) main.inert = true
    const controls = () => Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(control => !(control as HTMLButtonElement).disabled)
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = controls()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (main) main.inert = wasInert
      previousFocus?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className={styles.sheetLayer}>
      <div className={styles.sheetBackdrop} aria-hidden="true" onClick={onClose} />
      <div ref={assignRef} className={[styles.sheet, size === 'tall' ? styles.sheetTall : ''].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <h2 className={styles.sheetTitle} id={titleId}>{title}</h2>
          <IconButton aria-label={`Close ${typeof title === 'string' ? title.toLowerCase() : 'sheet'}`} onClick={onClose}>×</IconButton>
        </div>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>,
    document.body,
  )
})
