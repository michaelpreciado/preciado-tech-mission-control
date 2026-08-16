'use client'

/**
 * Tilt — a lightweight holographic 3D-tilt wrapper.
 *
 * Wraps a card in a pointer-tracked rotate/perspective layer so it leans
 * toward the cursor like a physical holo-tile, with a softened edge highlight
 * that tracks the same angle. Uses transform-gpu (no layout thrash), a coarse
 * guard (touch users get no tilt, saving battery/curiosity), and never on
 * reduced-motion. Pure CSS transforms + a rAF-throttled mousemove — no r3f,
 * so it's the cheapest lane in the batch.
 *
 * Usage: <Tilt><Card/></Tilt>
 */
import { useCallback, useRef, type ReactNode } from 'react'
import { useUiSettings } from './ui-settings'
import { wantsStaticMotion } from '@/lib/motion-pref'

const MAX = 7 // degrees

export function Tilt({ children, className = '', max = MAX }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const { motion } = useUiSettings()

  const onMove = useCallback((e: React.MouseEvent) => {
    // wantsStaticMotion already covers coarse pointers alongside prefers-reduced-motion
    // and the explicit Setup → UI CUSTOMIZATION override.
    if (wantsStaticMotion(motion)) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    const rx = -py * max
    const ry = px * max
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`
      el.style.setProperty('--tilt-rx', `${rx.toFixed(2)}deg`)
      el.style.setProperty('--tilt-ry', `${ry.toFixed(2)}deg`)
    })
  }, [max])

  const onLeave = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)'
  }, [])

  return (
    <div
      ref={ref}
      className={`mc-tilt ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {children}
    </div>
  )
}
