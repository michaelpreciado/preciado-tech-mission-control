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
const TRAIL_TIP_ALPHA = 0.24
type Rgb = [number, number, number]
const FALLBACK_RGB: Rgb = [30, 144, 255]
const FONT_FAMILY = 'ui-monospace, SFMono-Regular, monospace'
/** Backing-store budget (~4K) and the tighter one used on weak devices. */
const PIXEL_BUDGET = 8.3e6
const LOW_POWER_PIXEL_BUDGET = 2.1e6
const MAX_DPR = 3
const LOW_POWER_MAX_DPR = 1.5
const FRAME_MS_STRONG = 1000 / 60
const FRAME_MS_LOW = 1000 / 30
const SLOW_FRAME_MS = 20
const SLOW_FRAMES_BEFORE_DOWNSHIFT = 60

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

type Atlas = { canvas: HTMLCanvasElement; cellW: number; cellH: number; pad: number; base: number }

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const context = canvas.getContext('2d')
  return context ? [canvas, context] : null
}

/** Every glyph pre-rendered once in device pixels, so the frame loop only blits. */
function buildAtlas(deviceFont: number, color: string): Atlas | null {
  const cellW = Math.ceil(deviceFont * 1.25)
  const cellH = Math.ceil(deviceFont * 1.3)
  const pad = Math.round(deviceFont * 0.1)
  const base = Math.round(deviceFont * 1.0)
  const made = makeCanvas(cellW * GLYPHS.length, cellH)
  if (!made) return null
  const [canvas, context] = made
  context.font = `${deviceFont}px ${FONT_FAMILY}`
  context.fillStyle = color
  context.textBaseline = 'alphabetic'
  for (let index = 0; index < GLYPHS.length; index += 1) context.fillText(GLYPHS[index], index * cellW + pad, base)
  return { canvas, cellW, cellH, pad, base }
}

function buildGlowSprite(radiusDevice: number, rgb: Rgb): HTMLCanvasElement | null {
  if (radiusDevice <= 0) return null
  const size = Math.ceil(radiusDevice * 2)
  const made = makeCanvas(size, size)
  if (!made) return null
  const [sprite, context] = made
  const c = `${rgb[0]},${rgb[1]},${rgb[2]}`
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `rgba(${c},0.5)`)
  gradient.addColorStop(0.45, `rgba(${c},0.16)`)
  gradient.addColorStop(1, `rgba(${c},0)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return sprite
}

/** Vertical fade, transparent at the top and brightest at the head (bottom). */
function buildStreakSprite(width: number, height: number, span: number, rgb: Rgb): HTMLCanvasElement | null {
  const made = makeCanvas(width, height)
  if (!made) return null
  const [sprite, context] = made
  const c = `${rgb[0]},${rgb[1]},${rgb[2]}`
  const gradient = context.createLinearGradient(0, height - span, 0, height)
  gradient.addColorStop(0, `rgba(${c},0)`)
  gradient.addColorStop(1, `rgba(${c},${TRAIL_TIP_ALPHA})`)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
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
    const root = document.documentElement

    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    const lowPower =
      (nav.hardwareConcurrency || 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      nav.connection?.saveData === true ||
      window.matchMedia('(pointer: coarse)').matches

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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const isReduced = () => motion.matches || root.dataset.motion === 'reduced' || root.dataset.motion === 'off'
    let reduced = isReduced()
    let state = root.dataset.obOrbState
    let cssSpeed = Number.parseFloat(getComputedStyle(root).getPropertyValue('--ob-rain-speed')) || speedForState(state)
    // Reuse the shooting drop's storage; timers count visible simulation time.
    let shotColumn = -1
    let shotY = 0
    let shotPreviousY = 0
    let shotDelay = 12 + Math.random() * 13

    // Frame budget: 60 on capable hardware, 30 on weak hardware or after sustained slow frames.
    let frameInterval = lowPower ? FRAME_MS_LOW : FRAME_MS_STRONG
    let slowFrames = 0

    // Palette, read from :root custom properties with the original blue as fallback.
    let headRgb = FALLBACK_RGB
    let trailRgb = FALLBACK_RGB
    let glowRgb = FALLBACK_RGB
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    const probeContext = probe.getContext('2d', { willReadFrequently: true })
    const parseColor = (value: string, fallback: Rgb): Rgb => {
      const text = value.trim()
      if (!text || !probeContext) return fallback
      probeContext.fillStyle = '#010203'
      probeContext.fillStyle = text
      if (probeContext.fillStyle === '#010203') return fallback
      probeContext.clearRect(0, 0, 1, 1)
      probeContext.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = probeContext.getImageData(0, 0, 1, 1).data
      return a ? [r, g, b] : fallback
    }
    const readPalette = () => {
      const style = getComputedStyle(root)
      headRgb = parseColor(style.getPropertyValue('--mc-rain-head'), FALLBACK_RGB)
      trailRgb = parseColor(style.getPropertyValue('--mc-rain-trail'), FALLBACK_RGB)
      glowRgb = parseColor(style.getPropertyValue('--mc-rain-glow'), FALLBACK_RGB)
    }
    readPalette()

    // Per-tier sprites, in device pixels — rebuilt on resize, DPR or palette change.
    type TierSprites = {
      atlas: Atlas | null
      glow: HTMLCanvasElement | null
      streak: HTMLCanvasElement | null
      streakX: number
      shotStreak: HTMLCanvasElement | null
    }
    let sprites: TierSprites[] = []
    let shotAtlas: Atlas | null = null
    let reflections: Reflection[] = []
    let reflectionsAt = 0
    let reflectionFrame = 0

    const buildSprites = () => {
      sprites = TIERS.map((tier) => {
        const scale = tier.font / BASE_FONT_SIZE
        const deviceFont = Math.max(4, Math.round(tier.font * scale * dpr))
        const head = `rgba(${headRgb[0]},${headRgb[1]},${headRgb[2]},${Math.min(1, tier.alpha)})`
        const streakW = Math.max(1, Math.round(tier.width * scale * dpr))
        const streakH = Math.max(1, Math.round(STREAK * tier.trail * scale * dpr))
        const shotW = Math.max(1, Math.round(2.5 * dpr))
        const shotH = Math.max(1, Math.round(STREAK * 3 * dpr))
        return {
          atlas: buildAtlas(deviceFont, head),
          glow: buildGlowSprite(tier.glow * scale * dpr, glowRgb),
          streak: buildStreakSprite(streakW, streakH, streakH, trailRgb),
          streakX: Math.round((tier.font * scale * dpr) / 2),
          shotStreak: buildStreakSprite(shotW, shotH, Math.min(shotH, shotH * tier.trail), trailRgb),
        }
      })
      shotAtlas = buildAtlas(Math.max(4, Math.round(BASE_FONT_SIZE * dpr)), '#bedeff')
    }

    /** Re-read the panel rects the rain reflects off. Runs on resize and at
     *  most once a second — never inside the frame loop. */
    const refreshReflections = () => {
      const next: Reflection[] = []
      const seen = new Set<Element>()
      const glow = `${glowRgb[0]},${glowRgb[1]},${glowRgb[2]}`
      for (const selector of REFLECTION_SELECTORS.split(',')) {
        for (const node of Array.from(document.querySelectorAll(selector.trim()))) {
          if (next.length >= REFLECTION_MAX || seen.has(node)) continue
          const rect = node.getBoundingClientRect()
          if (rect.width < 24 || rect.height < 24 || rect.bottom < 0 || rect.top > height) continue
          seen.add(node)
          // Gradient built in LOCAL space: the draw call translates to the panel's rect.
          const depth = Math.min(rect.height, REFLECTION_BAND)
          const gradient = context.createLinearGradient(0, 0, 0, depth)
          gradient.addColorStop(0, `rgba(${glow},0.16)`)
          gradient.addColorStop(1, `rgba(${glow},0)`)
          next.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, gradient, level: 0 })
        }
      }
      reflections = next
    }

    const chooseDpr = () => {
      const native = window.devicePixelRatio || 1
      const budget = lowPower ? LOW_POWER_PIXEL_BUDGET : PIXEL_BUDGET
      const cap = lowPower ? LOW_POWER_MAX_DPR : MAX_DPR
      return Math.max(0.5, Math.min(native, cap, Math.sqrt(budget / (width * height))))
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = chooseDpr()
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      buildSprites()

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
      if (!width || !height || !sprites.length) return
      const blend = accumulator / STEP
      const alpha = reduced ? 0.84 : previousBrightness + (brightness - previousBrightness) * blend
      const glyphTick = Math.floor(simulationTime / 0.18)
      // Everything below draws in device pixels with integer blits: no per-glyph
      // transforms, no fillText, and 1:1 texels keep the glyphs sharp.
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalAlpha = alpha
      for (let index = 0; index < columns.length; index += 1) {
        const drop = columns[index]
        const tier = TIERS[drop.tier]
        const sprite = sprites[drop.tier]
        const y = reduced ? drop.y : drop.previousY + (drop.y - drop.previousY) * blend
        const x = Math.round(index * BASE_FONT_SIZE * dpr)
        const yDevice = Math.round(y * dpr)
        const glow = sprite.glow
        if (glow) {
          // Depth reads as light: near heads carry a halo, far ones do not.
          context.globalAlpha = alpha * tier.alpha * 0.5
          context.drawImage(glow, x - (glow.width >> 1), yDevice - (glow.height >> 1))
          context.globalAlpha = alpha
        }
        const streak = sprite.streak
        if (streak) context.drawImage(streak, x + sprite.streakX, yDevice - streak.height)
        const atlas = sprite.atlas
        if (atlas) {
          const glyph = (glyphTick + drop.seed) % GLYPHS.length
          context.drawImage(atlas.canvas, glyph * atlas.cellW, 0, atlas.cellW, atlas.cellH, x - atlas.pad, yDevice - atlas.base, atlas.cellW, atlas.cellH)
        }
      }
      if (!reduced && shotColumn >= 0) {
        const y = shotPreviousY + (shotY - shotPreviousY) * blend
        const x = Math.round(shotColumn * BASE_FONT_SIZE * dpr)
        const yDevice = Math.round(y * dpr)
        context.globalAlpha = Math.max(0, Math.min(1, (height + STREAK * 3 - y) / (STREAK * 3)))
        const streak = sprites[columns[shotColumn].tier].shotStreak
        if (streak) context.drawImage(streak, x + Math.round((BASE_FONT_SIZE / 2) * dpr), yDevice - streak.height)
        if (shotAtlas) {
          const glyph = columns[shotColumn].seed % GLYPHS.length
          context.drawImage(shotAtlas.canvas, glyph * shotAtlas.cellW, 0, shotAtlas.cellW, shotAtlas.cellH, x - shotAtlas.pad, yDevice - shotAtlas.base, shotAtlas.cellW, shotAtlas.cellH)
        }
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
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalAlpha = 1
    }

    const draw = (elapsed: number, force = false) => {
      const since = elapsed - previous
      // Frame cap: skip rAF ticks that arrive early (120/144 Hz panels, 30 fps mode).
      if (!force && since < frameInterval - 2) {
        if (!reduced && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
        return
      }
      if (!force && frameInterval < SLOW_FRAME_MS) {
        slowFrames = since > SLOW_FRAME_MS ? slowFrames + 1 : Math.max(0, slowFrames - 2)
        if (slowFrames > SLOW_FRAMES_BEFORE_DOWNSHIFT) frameInterval = FRAME_MS_LOW
      }
      // Bound catch-up work after stalls while carrying fractional time forward.
      accumulator += Math.min(STEP * MAX_STEPS, Math.max(0, since / 1000))
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
      draw(previous, true)
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') restart()
      else if (frame) cancelAnimationFrame(frame)
    }
    const onMotion = () => { reduced = isReduced(); restart() }
    const observer = new MutationObserver(() => {
      const next = root.dataset.obOrbState
      const nextSpeed = Number.parseFloat(getComputedStyle(root).getPropertyValue('--ob-rain-speed')) || speedForState(next)
      const nextReduced = isReduced()
      if (next !== state || nextSpeed !== cssSpeed || nextReduced !== reduced) {
        state = next
        cssSpeed = nextSpeed
        reduced = nextReduced
        restart()
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-ob-orb-state', 'data-motion', 'style'] })
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const onTheme = () => {
      readPalette()
      buildSprites()
      refreshReflections()
      render()
    }

    // A DPR change (monitor move, browser zoom) is not a canvas resize, so listen for it directly.
    let dprQuery: MediaQueryList | null = null
    const onDprChange = () => {
      watchDpr()
      resize()
    }
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      dprQuery.addEventListener('change', onDprChange)
    }
    watchDpr()

    motion.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('mc-theme-change', onTheme)
    resize()
    restart()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      dprQuery?.removeEventListener('change', onDprChange)
      motion.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('mc-theme-change', onTheme)
    }
  }, [])

  return <canvas ref={canvasRef} className="ob-matrix-rain" aria-hidden="true" />
}
