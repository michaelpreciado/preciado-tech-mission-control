'use client'

import { useEffect, useRef } from 'react'

const GLYPHS = Array.from('アィウエオカキクケコサシスセソタチツテトナニヌネノ01<>[]{}+=*')
const FONT_SIZE = 15
const FONT = `${FONT_SIZE}px ui-monospace, SFMono-Regular, monospace`
const STEP = 1 / 120
const MAX_STEPS = 8
const CALM_SPEED = 0.55
const BRIGHTNESS_EASE = 1 - Math.exp(-STEP / 0.7)
const BASE_SPEED = 0.045 * 1000 * FONT_SIZE
const STREAK = 48
const HEAD = 'rgba(30,144,255,0.65)'
const TRAIL_TIP = 'rgba(30,144,255,0.24)'
const TRAIL_END = 'rgba(30,144,255,0)'

type Drop = { y: number; previousY: number; speed: number; seed: number; trail: CanvasGradient }

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
    let accumulator = 0
    let simulationTime = 0
    let brightness = 0.84
    let previousBrightness = brightness
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let state = document.documentElement.dataset.obOrbState
    let cssSpeed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ob-rain-speed')) || speedForState(state)
    // Reuse the shooting drop's storage; timers count visible simulation time.
    let shotColumn = -1
    let shotY = 0
    let shotPreviousY = 0
    let shotDelay = 12 + Math.random() * 13

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.font = FONT
      const count = Math.ceil(width / FONT_SIZE)
      columns = Array.from({ length: count }, (_, index) => {
        const trail = context.createLinearGradient(0, -STREAK, 0, 0)
        trail.addColorStop(0, TRAIL_END)
        trail.addColorStop(1, TRAIL_TIP)
        const y = -((index * 37) % 70) * FONT_SIZE
        return { y, previousY: y, speed: 0.35 + ((index * 17) % 80) / 100, seed: index * 13, trail }
      })
      shotColumn = -1
      render()
    }

    const step = () => {
      const distance = (cssSpeed || speedForState(state)) * CALM_SPEED * BASE_SPEED * STEP
      simulationTime += STEP
      previousBrightness = brightness
      const target = state === 'surge' || state === 'hot' ? 1 : 0.84
      brightness += (target - brightness) * BRIGHTNESS_EASE
      for (let index = 0; index < columns.length; index += 1) {
        const drop = columns[index]
        drop.previousY = drop.y
        drop.y += drop.speed * distance
        if (drop.y > height + STREAK) {
          drop.y -= height + STREAK + FONT_SIZE
          drop.previousY -= height + STREAK + FONT_SIZE
        }
      }
      shotDelay -= STEP
      if (shotColumn < 0 && shotDelay <= 0 && columns.length) {
        shotColumn = Math.floor(Math.random() * columns.length)
        shotY = shotPreviousY = -FONT_SIZE
        shotDelay = 12 + Math.random() * 13
      }
      if (shotColumn >= 0) {
        shotPreviousY = shotY
        shotY += distance * 3.5
        if (shotY > height + STREAK * 3) shotColumn = -1
      }
    }

    const render = () => {
      if (!width || !height) return
      const blend = accumulator / STEP
      const alpha = reduced ? 0.84 : previousBrightness + (brightness - previousBrightness) * blend
      const glyphTick = Math.floor(simulationTime / 0.18)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)
      context.globalAlpha = alpha
      for (let index = 0; index < columns.length; index += 1) {
        const drop = columns[index]
        const y = reduced ? drop.y : drop.previousY + (drop.y - drop.previousY) * blend
        // Cached local-space gradients travel with the head, with no new paths
        // or gradient/color/font allocations in the frame loop.
        context.setTransform(dpr, 0, 0, dpr, index * FONT_SIZE * dpr, y * dpr)
        context.fillStyle = drop.trail
        context.fillRect(FONT_SIZE / 2, -STREAK, 1.5, STREAK)
        context.fillStyle = HEAD
        context.fillText(GLYPHS[(glyphTick + drop.seed) % GLYPHS.length], 0, 0)
      }
      if (!reduced && shotColumn >= 0) {
        const y = shotPreviousY + (shotY - shotPreviousY) * blend
        context.globalAlpha = Math.max(0, Math.min(1, (height + STREAK * 3 - y) / (STREAK * 3)))
        context.setTransform(dpr, 0, 0, dpr * 3, shotColumn * FONT_SIZE * dpr, y * dpr)
        context.fillStyle = columns[shotColumn].trail
        context.fillRect(FONT_SIZE / 2, -STREAK, 2.5, STREAK)
        context.setTransform(dpr, 0, 0, dpr, shotColumn * FONT_SIZE * dpr, y * dpr)
        context.fillStyle = '#bedeff'
        context.fillText(GLYPHS[columns[shotColumn].seed % GLYPHS.length], 0, 0)
      }
      context.globalAlpha = 1
    }

    const draw = (elapsed: number) => {
      // Bound catch-up work after stalls while carrying fractional time forward.
      accumulator += Math.min(STEP * MAX_STEPS, Math.max(0, (elapsed - previous) / 1000))
      previous = elapsed
      let steps = 0
      while (!reduced && accumulator >= STEP && steps < MAX_STEPS) {
        step()
        accumulator -= STEP
        steps += 1
      }
      render()
      if (!reduced && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }

    const restart = () => {
      if (frame) cancelAnimationFrame(frame)
      previous = performance.now()
      if (reduced) { accumulator = 0; shotColumn = -1 }
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
    restart()

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
