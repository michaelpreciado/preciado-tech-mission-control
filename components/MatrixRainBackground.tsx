'use client'

import { useEffect, useRef } from 'react'

const GLYPHS = Array.from('アィウエオカキクケコサシスセソタチツテトナニヌネノ01<>[]{}+=*')
/** Reference column pitch. Per-depth glyph sizes live in TIERS. */
const BASE_FONT_SIZE = 12
const STEP = 1 / 120
const MAX_STEPS = 8
const CALM_SPEED = 0.55
/** Half the original fall rate: the field reads as snowfall, not rainfall.
 *  Applied uniformly so the orb-state multipliers (surge/hot/active) and the
 *  `--ob-rain-speed` override keep their relative meaning. */
const SNOWFALL_SCALE = 0.5
const BRIGHTNESS_EASE = 1 - Math.exp(-STEP / 0.7)
const BASE_SPEED = 0.045 * 1000 * BASE_FONT_SIZE
const STREAK = 48
const TRAIL_TIP = 'rgba(30,144,255,0.24)'
const TRAIL_END = 'rgba(30,144,255,0)'
const GLOW_RGB = '30,144,255'

/**
 * Depth tiers, farthest first. A tier owns everything that changes with
 * distance — glyph size, brightness, fall speed, streak geometry and glow
 * radius — so every sprite and gradient below is built once per resize and the
 * frame loop only interpolates and draws.
 */
const TIERS = [
  { font: 9, alpha: 0.34, speed: 0.5, width: 1.0, trail: 0.5, glow: 0 },
  { font: 12, alpha: 0.5, speed: 0.75, width: 1.3, trail: 0.75, glow: 9 },
  { font: 15, alpha: 0.7, speed: 1.05, width: 1.7, trail: 1.0, glow: 15 },
  { font: 19, alpha: 0.92, speed: 1.4, width: 2.2, trail: 1.35, glow: 24 },
] as const

/** Panel surfaces the rain appears to cast light onto. */
const REFLECTION_SELECTORS = '.mc-tile-card, .mc-window'
const REFLECTION_MAX = 48
const REFLECTION_REFRESH_MS = 1000
/** Reflections re-weight every Nth frame: they are a slow signal, and this
 *  keeps the cost off the hot path. */
const REFLECTION_EVERY = 4
/** How far from a panel's top edge a passing drop still reads as its light. */
const REFLECTION_BAND = 48

type Drop = { y: number; previousY: number; speed: number; seed: number; tier: number }

type Reflection = { left: number; top: number; width: number; height: number; gradient: CanvasGradient; level: number }

/** Pre-rendered radial glow for one tier. Built in the resize path only. */
function buildGlowSprite(radius: number): HTMLCanvasElement | null {
  if (radius <= 0) return null
  const size = Math.ceil(radius * 2)
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const context = sprite.getContext('2d')
  if (!context) return null
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius)
  gradient.addColorStop(0, `rgba(${GLOW_RGB},0.5)`)
  gradient.addColorStop(0.45, `rgba(${GLOW_RGB},0.16)`)
  gradient.addColorStop(1, `rgba(${GLOW_RGB},0)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return sprite
}

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

    // Per-tier caches — rebuilt only when the canvas resizes.
    const fonts: string[] = []
    const headColors: string[] = []
    const streaks: (CanvasGradient | null)[] = []
    const glows: (HTMLCanvasElement | null)[] = []
    let reflections: Reflection[] = []
    let reflectionsAt = 0
    let reflectionFrame = 0

    /** Re-read the panel rects the rain reflects off. Runs on resize and at
     *  most once a second — never inside the frame loop. */
    const refreshReflections = () => {
      const next: Reflection[] = []
      const seen = new Set<Element>()
      for (const selector of REFLECTION_SELECTORS.split(',')) {
        for (const node of Array.from(document.querySelectorAll(selector.trim()))) {
          if (next.length >= REFLECTION_MAX || seen.has(node)) continue
          const rect = node.getBoundingClientRect()
          if (rect.width < 24 || rect.height < 24 || rect.bottom < 0 || rect.top > height) continue
          seen.add(node)
          // Anchored to the top edge — the edge the rain actually crosses. The
          // gradient is built in LOCAL space because canvas gradients are
          // transformed by the CTM at fill time, and the draw call translates
          // to the panel's own rect.
          const depth = Math.min(rect.height, REFLECTION_BAND)
          const gradient = context.createLinearGradient(0, 0, 0, depth)
          gradient.addColorStop(0, `rgba(${GLOW_RGB},0.16)`)
          gradient.addColorStop(1, `rgba(${GLOW_RGB},0)`)
          next.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, gradient, level: 0 })
        }
      }
      reflections = next
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      fonts.length = 0
      headColors.length = 0
      streaks.length = 0
      glows.length = 0
      for (const tier of TIERS) {
        fonts.push(`${tier.font}px ui-monospace, SFMono-Regular, monospace`)
        headColors.push(`rgba(${GLOW_RGB},${Math.min(1, tier.alpha)})`)
        const trail = context.createLinearGradient(0, -STREAK * tier.trail, 0, 0)
        trail.addColorStop(0, TRAIL_END)
        trail.addColorStop(1, TRAIL_TIP)
        streaks.push(trail)
        glows.push(buildGlowSprite(tier.glow))
      }

      const count = Math.ceil(width / BASE_FONT_SIZE)
      columns = Array.from({ length: count }, (_, index) => {
        // Deterministic depth: the same column sits at the same distance on
        // every load, so the field has structure instead of shimmer.
        const tier = (index * 7) % TIERS.length
        const y = -((index * 37) % 70) * BASE_FONT_SIZE
        return {
          y,
          previousY: y,
          speed: 0.35 + ((index * 17) % 80) / 100,
          seed: index * 13,
          tier,
        }
      })
      shotColumn = -1
      refreshReflections()
      reflectionsAt = simulationTime
      render()
    }

    const step = () => {
      const distance = (cssSpeed || speedForState(state)) * CALM_SPEED * SNOWFALL_SCALE * BASE_SPEED * STEP
      simulationTime += STEP
      previousBrightness = brightness
      const target = state === 'surge' || state === 'hot' ? 1 : 0.84
      brightness += (target - brightness) * BRIGHTNESS_EASE
      for (let index = 0; index < columns.length; index += 1) {
        const drop = columns[index]
        // Depth is parallax, not decoration: near columns genuinely travel
        // further per step than far ones.
        drop.previousY = drop.y
        drop.y += drop.speed * TIERS[drop.tier].speed * distance
        if (drop.y > height + STREAK) {
          drop.y -= height + STREAK + BASE_FONT_SIZE
          drop.previousY -= height + STREAK + BASE_FONT_SIZE
        }
      }
      shotDelay -= STEP
      if (shotColumn < 0 && shotDelay <= 0 && columns.length) {
        shotColumn = Math.floor(Math.random() * columns.length)
        shotY = shotPreviousY = -BASE_FONT_SIZE
        shotDelay = 12 + Math.random() * 13
      }
      if (shotColumn >= 0) {
        shotPreviousY = shotY
        shotY += distance * 3.5
        if (shotY > height + STREAK * 3) shotColumn = -1
      }
    }

    /** Re-weight each panel's reflection from the drops crossing its top band.
     *  Sampled every few columns — it is a glow, not a measurement. */
    const weightReflections = () => {
      if (!reflections.length || !columns.length) return
      for (const reflection of reflections) {
        const band = reflection.top - REFLECTION_BAND
        let level = 0
        for (let index = 0; index < columns.length; index += 3) {
          const drop = columns[index]
          if (drop.y >= band && drop.y <= reflection.top + REFLECTION_BAND) level += TIERS[drop.tier].alpha
        }
        reflection.level = Math.min(1, level / 6)
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
        const tier = TIERS[drop.tier]
        const y = reduced ? drop.y : drop.previousY + (drop.y - drop.previousY) * blend
        const scale = tier.font / BASE_FONT_SIZE
        // Cached local-space gradients travel with the head, with no new paths
        // or gradient/color/font allocations in the frame loop.
        context.setTransform(dpr * scale, 0, 0, dpr * scale, index * BASE_FONT_SIZE * dpr, y * dpr)
        const glow = glows[drop.tier]
        if (glow) {
          // Depth reads as light: near heads carry a halo, far ones do not.
          const radius = tier.glow
          context.globalAlpha = alpha * tier.alpha * 0.5
          context.drawImage(glow, -radius, -radius, radius * 2, radius * 2)
          context.globalAlpha = alpha
        }
        const streak = streaks[drop.tier]
        if (streak) {
          context.fillStyle = streak
          context.fillRect(tier.font / 2, -STREAK * tier.trail, tier.width, STREAK * tier.trail)
        }
        context.font = fonts[drop.tier]
        context.fillStyle = headColors[drop.tier]
        context.fillText(GLYPHS[(glyphTick + drop.seed) % GLYPHS.length], 0, 0)
      }
      if (!reduced && shotColumn >= 0) {
        const y = shotPreviousY + (shotY - shotPreviousY) * blend
        context.globalAlpha = Math.max(0, Math.min(1, (height + STREAK * 3 - y) / (STREAK * 3)))
        context.setTransform(dpr, 0, 0, dpr * 3, shotColumn * BASE_FONT_SIZE * dpr, y * dpr)
        const streak = streaks[columns[shotColumn].tier]
        if (streak) {
          context.fillStyle = streak
          context.fillRect(BASE_FONT_SIZE / 2, -STREAK, 2.5, STREAK)
        }
        context.setTransform(dpr, 0, 0, dpr, shotColumn * BASE_FONT_SIZE * dpr, y * dpr)
        context.fillStyle = '#bedeff'
        context.fillText(GLYPHS[columns[shotColumn].seed % GLYPHS.length], 0, 0)
      }
      // Panels catch the light: additive edge glow proportional to the drops
      // crossing them, which is why it breathes with the fall instead of
      // sitting there as decoration.
      if (reflections.length) {
        const restore = context.globalCompositeOperation
        context.globalCompositeOperation = 'lighter'
        for (const reflection of reflections) {
          if (reflection.level <= 0) continue
          const depth = Math.min(reflection.height, REFLECTION_BAND)
          context.globalAlpha = alpha * reflection.level * 0.5
          context.setTransform(dpr, 0, 0, dpr, reflection.left * dpr, reflection.top * dpr)
          context.fillStyle = reflection.gradient
          context.fillRect(0, 0, reflection.width, depth)
        }
        context.globalCompositeOperation = restore
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
      if (!reduced) {
        reflectionFrame += 1
        if (reflectionFrame % REFLECTION_EVERY === 0) weightReflections()
        if (simulationTime - reflectionsAt > REFLECTION_REFRESH_MS / 1000) {
          refreshReflections()
          reflectionsAt = simulationTime
        }
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
