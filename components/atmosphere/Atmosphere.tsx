'use client'

import { useEffect, useRef } from 'react'
import styles from './Atmosphere.module.css'

/* Environmental depth behind the whole shell: a dim grid, slow data columns,
   and a sparse neural constellation that wakes up near the pointer.

   Cost model (Phase B):
   - Rain and node pulses are CSS transform/opacity animations — compositor only,
     paused by MotionVisibility when the page is hidden, removed under reduced motion.
   - No rAF loop. Pointer and scroll handlers coalesce into one rAF per event burst
     and go idle when input stops.
   - The pointer layer (glow, node proximity, glass reflection) only binds on fine pointers. */

const GLYPHS = '0101010110100101ABCDEF0123456789:/'

/* Deterministic PRNG so server and client render identical markup. */
function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Column = { left: number; dur: number; delay: number; size: number; tone: 1 | 2 | 3; text: string }

const COLUMN_COUNT = 22
const COLUMNS: Column[] = (() => {
  const rand = prng(20261007)
  return Array.from({ length: COLUMN_COUNT }, (_, i) => {
    let text = ''
    for (let c = 0; c < 96; c++) text += rand() < 0.78 ? (rand() < 0.5 ? '0' : '1') : GLYPHS[Math.floor(rand() * GLYPHS.length)]
    return {
      left: ((i + 0.15 + rand() * 0.7) / COLUMN_COUNT) * 100,
      dur: 46 + Math.round(rand() * 44),
      delay: -Math.round(rand() * 90),
      size: 10 + Math.round(rand() * 3),
      tone: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
      text,
    }
  })
})()

/* Neural constellation in percent space. Edges connect each node to its nearest
   neighbours once, computed at module load. */
const NODES: [number, number][] = [
  [6, 14], [17, 31], [11, 63], [24, 84], [33, 12], [41, 47], [52, 26], [58, 71],
  [66, 9], [72, 42], [81, 22], [88, 58], [94, 34], [78, 86], [46, 92], [92, 8],
]
const PULSING = new Set([1, 6, 9, 13])
const EDGES: [number, number][] = (() => {
  const seen = new Set<string>()
  const out: [number, number][] = []
  NODES.forEach(([x, y], i) => {
    NODES.map(([x2, y2], j) => ({ j, d: Math.hypot(x2 - x, (y2 - y) * 0.62) }))
      .filter(n => n.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (!seen.has(key)) { seen.add(key); out.push([i, j]) }
      })
  })
  return out
})()

const NEAR_PX = 190

export function Atmosphere() {
  const rootRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const depthRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const html = document.documentElement
    const fine = window.matchMedia('(pointer: fine)')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const motionOff = () => reduce.matches || html.dataset.motion === 'off' || html.dataset.motion === 'reduced'

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-node]'))
    let centers: { x: number; y: number }[] = []
    const measure = () => {
      centers = nodes.map(n => {
        const r = n.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
    }

    let px = -1, py = -1, target: Element | null = null
    let glass: HTMLElement | null = null
    let frame = 0
    const flush = () => {
      frame = 0
      if (glowRef.current) glowRef.current.style.transform = `translate3d(${px}px, ${py}px, 0)`
      for (let i = 0; i < nodes.length; i++) {
        const c = centers[i]
        const near = !!c && Math.abs(c.x - px) < NEAR_PX && Math.abs(c.y - py) < NEAR_PX && Math.hypot(c.x - px, c.y - py) < NEAR_PX
        if (near !== (nodes[i].dataset.near === 'true')) nodes[i].dataset.near = String(near)
      }
      const next = (target?.closest?.('[data-glass]') as HTMLElement | null) ?? null
      if (glass && glass !== next) { glass.style.removeProperty('--gx'); glass.style.removeProperty('--gy') }
      glass = next
      if (glass) {
        const r = glass.getBoundingClientRect()
        glass.style.setProperty('--gx', `${Math.round(px - r.left)}px`)
        glass.style.setProperty('--gy', `${Math.round(py - r.top)}px`)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      px = e.clientX; py = e.clientY; target = e.target as Element | null
      root.dataset.pointer = 'on'
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const onLeave = () => {
      root.dataset.pointer = 'off'
      nodes.forEach(n => { n.dataset.near = 'false' })
      if (glass) { glass.style.removeProperty('--gx'); glass.style.removeProperty('--gy'); glass = null }
    }

    /* Gentle parallax: depth layers drift a few px against the main pane's scroll. */
    const main = document.getElementById('mc-main-content')
    let scrollFrame = 0
    const onScroll = () => {
      if (scrollFrame) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0
        const y = Math.min(main?.scrollTop ?? 0, 4000)
        depthRef.current?.style.setProperty('transform', `translate3d(0, ${(-y * 0.03).toFixed(1)}px, 0)`)
      })
    }

    let bound = false
    const bind = () => {
      const want = fine.matches && !motionOff()
      if (want === bound) return
      bound = want
      if (want) {
        measure()
        window.addEventListener('pointermove', onMove, { passive: true })
        document.documentElement.addEventListener('pointerleave', onLeave)
        window.addEventListener('resize', measure, { passive: true })
        main?.addEventListener('scroll', onScroll, { passive: true })
      } else {
        window.removeEventListener('pointermove', onMove)
        document.documentElement.removeEventListener('pointerleave', onLeave)
        window.removeEventListener('resize', measure)
        main?.removeEventListener('scroll', onScroll)
        onLeave()
        depthRef.current?.style.removeProperty('transform')
      }
    }
    bind()
    fine.addEventListener('change', bind)
    reduce.addEventListener('change', bind)
    const mo = new MutationObserver(bind)
    mo.observe(html, { attributes: true, attributeFilter: ['data-motion'] })

    return () => {
      fine.removeEventListener('change', bind)
      reduce.removeEventListener('change', bind)
      mo.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', measure)
      main?.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      if (scrollFrame) cancelAnimationFrame(scrollFrame)
    }
  }, [])

  return (
    <div ref={rootRef} className={styles.field} aria-hidden="true" data-mx-atmosphere="" data-pointer="off">
      <div className={styles.grid} />
      <div ref={depthRef} className={styles.depth}>
        <div className={styles.rain}>
          {COLUMNS.map((c, i) => (
            <span
              key={i}
              className={`${styles.col} ${styles[`tone${c.tone}`]}`}
              style={{ left: `${c.left.toFixed(2)}%`, fontSize: c.size, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` } as React.CSSProperties}
            >
              {c.text}{c.text}
            </span>
          ))}
        </div>
        <svg className={styles.edges} viewBox="0 0 100 100" preserveAspectRatio="none">
          {EDGES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {NODES.map(([x, y], i) => (
          <span
            key={i}
            data-node=""
            data-near="false"
            className={`${styles.node} ${PULSING.has(i) ? styles.pulse : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-i * 1.7}s` }}
          />
        ))}
      </div>
      <div ref={glowRef} className={styles.glow} />
      <div className={styles.vignette} />
    </div>
  )
}
