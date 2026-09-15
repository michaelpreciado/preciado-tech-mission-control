'use client'

import { useEffect, useRef } from 'react'

const GLYPHS = 'アィウエオカキクケコサシスセソタチツテトナニヌネノ01<>[]{}+=*'
const FONT_SIZE = 15

type Drop = { y: number; speed: number; seed: number }

function speedForState(state: string | undefined): number {
  if (state === 'surge') return 2.2
  if (state === 'hot') return 2.6
  if (state === 'active') return 1.7
  return 1
}

/** Full-viewport, low-contrast matrix texture. The canvas never participates in layout. */
export function MatrixRainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let dpr = 1
    let columns: Drop[] = []
    let frame = 0
    let previous = performance.now()
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let state = document.documentElement.dataset.obOrbState
    let cssSpeed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-rain-speed')) || 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.ceil(width / FONT_SIZE)
      columns = Array.from({ length: count }, (_, index) => ({
        y: -((index * 37) % 70),
        speed: 0.35 + ((index * 17) % 80) / 100,
        seed: index * 13,
      }))
      draw(0)
    }

    const glyph = (seed: number, now: number) => GLYPHS[Math.abs(Math.floor(now / 180) + seed) % GLYPHS.length]
    const draw = (elapsed: number) => {
      if (!width || !height) return
      const delta = Math.min(48, elapsed ? elapsed - previous : 16)
      previous = elapsed || previous
      const speed = cssSpeed || speedForState(state)
      context.clearRect(0, 0, width, height)
      context.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, monospace`
      for (let index = 0; index < columns.length; index += 1) {
        const drop = columns[index]
        if (!reduced) drop.y += drop.speed * speed * delta * 0.045
        const y = (drop.y % (height / FONT_SIZE)) * FONT_SIZE
        context.fillStyle = 'rgba(190,220,255,0.55)'
        context.fillText(glyph(drop.seed, elapsed), index * FONT_SIZE, y)
        for (let trail = 1; trail <= 7; trail += 1) {
          const trailY = y - trail * FONT_SIZE
          context.fillStyle = `rgba(30,144,255,${(0.18 * (1 - trail / 8)).toFixed(3)})`
          context.fillText(glyph(drop.seed + trail * 7, elapsed), index * FONT_SIZE, trailY)
        }
      }
      if (!reduced && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }

    const restart = () => {
      if (frame) cancelAnimationFrame(frame)
      previous = performance.now()
      draw(previous)
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') restart()
      else if (frame) cancelAnimationFrame(frame)
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => { reduced = motion.matches; restart() }
    const observer = new MutationObserver(() => {
      const next = document.documentElement.dataset.obOrbState
      const nextSpeed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-rain-speed')) || speedForState(next)
      if (next !== state || nextSpeed !== cssSpeed) { state = next; cssSpeed = nextSpeed; restart() }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ob-orb-state', 'style'] })
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    motion.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', visibility)
    resize()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      motion.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="ob-matrix-rain" aria-hidden="true" />
}
