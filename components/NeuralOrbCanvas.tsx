'use client'

import { useEffect, useRef } from 'react'
import type { OrbState } from '@/lib/orb-state'
import { deriveOrbOverlayVisual, deriveOrbVisual } from '@/lib/orb-visual'
import type { OrbOverlay } from '@/lib/orb-overlay'

type Node = { x: number; y: number; radius: number; shell: number; phase: number }
type Edge = { from: number; to: number }
type Pulse = { edge: Edge; progress: number; speed: number }
type Shockwave = { progress: number; color: string; speed?: number }

const SIZE = 280
const CENTER = SIZE / 2

function seeded(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

function makeNetwork(): { nodes: Node[]; edges: Edge[] } {
  const random = seeded(42)
  const nodes: Node[] = [{ x: CENTER, y: CENTER, radius: 0, shell: 0, phase: 0 }]
  const shells = [{ count: 6, radius: 42 }, { count: 10, radius: 78 }, { count: 12, radius: 112 }]
  for (const shell of shells) {
    for (let index = 0; index < shell.count; index += 1) {
      const angle = index / shell.count * Math.PI * 2 + random() * 0.5
      const radius = shell.radius * (0.92 + random() * 0.16)
      nodes.push({
        x: CENTER + Math.cos(angle) * radius,
        y: CENTER + Math.sin(angle) * radius,
        radius,
        shell: shell.radius,
        phase: random() * Math.PI * 2,
      })
    }
  }
  const edges: Edge[] = []
  const first = nodes.filter(node => node.shell === 42)
  const second = nodes.filter(node => node.shell === 78)
  const third = nodes.filter(node => node.shell === 112)
  const connect = (from: Node, candidates: Node[], distance: number) => {
    candidates.forEach((to, toIndex) => {
      if (Math.hypot(from.x - to.x, from.y - to.y) < distance && toIndex % 2 === 0) {
        edges.push({ from: nodes.indexOf(from), to: nodes.indexOf(to) })
      }
    })
  }
  first.forEach(node => {
    edges.push({ from: 0, to: nodes.indexOf(node) })
    connect(node, second, 58)
  })
  second.forEach(node => connect(node, third, 52))
  return { nodes, edges }
}

function rgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red},${green},${blue},${alpha})`
}

export function NeuralOrbCanvas({ state, intensity, overlay, staticMotion, visible = true }: {
  state: OrbState
  intensity: number
  overlay: OrbOverlay | null
  staticMotion: boolean
  visible?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const intensityRef = useRef(intensity)
  const overlayRef = useRef(overlay)
  const networkRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { intensityRef.current = intensity }, [intensity])
  useEffect(() => { overlayRef.current = overlay }, [overlay])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const network = networkRef.current ?? makeNetwork()
    networkRef.current = network
    let width = 0
    let height = 0
    let scale = 1
    let dpr = 1
    let frame = 0
    let previous = performance.now()
    let elapsed = 0
    let pulses: Pulse[] = []
    let shockwaves: Shockwave[] = []
    let lastState = stateRef.current
    let lastOverlayKey = ''

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      scale = Math.min(width, height) / SIZE
      draw(performance.now())
    }
    const point = (node: Node, now: number) => ({
      x: (node.x + Math.cos(now * 0.0005 + node.phase) * (node.shell ? 1.5 : 0)) * scale + (width - SIZE * scale) / 2,
      y: (node.y + Math.sin(now * 0.0007 + node.phase) * (node.shell ? 1.5 : 0)) * scale + (height - SIZE * scale) / 2,
    })
    const draw = (now: number) => {
      if (!width || !height || !visible) return
      const delta = Math.min(48, now - previous)
      previous = now
      elapsed += delta / 1000
      const currentState = stateRef.current
      const currentOverlay = overlayRef.current
      const visual = deriveOrbVisual(currentState)
      const overlayVisual = currentOverlay ? deriveOrbOverlayVisual(currentOverlay.kind) : null
      const color = overlayVisual?.palette.hex ?? visual.palette.hex
      if (currentState !== lastState) {
        shockwaves.push({ progress: 0, color: currentState === 'hot' ? '#F87171' : '#6EE7B7' })
        lastState = currentState
      }
      const overlayKey = currentOverlay ? `${currentOverlay.kind}:${currentOverlay.until}` : ''
      if (overlayKey && overlayKey !== lastOverlayKey) {
        const overlayColor = overlayVisual?.palette.hex ?? color
        const count = currentOverlay?.kind === 'success' ? 3 : 1
        for (let index = 0; index < count; index += 1) {
          shockwaves.push({ progress: index * 0.12, color: overlayColor, speed: currentOverlay?.kind === 'success' ? 0.00072 : 0.0009 })
        }
      }
      lastOverlayKey = overlayKey
      context.clearRect(0, 0, width, height)
      context.save()
      context.globalCompositeOperation = 'lighter'

      const currentNodes = network.nodes.map(node => point(node, now))
      context.lineWidth = Math.max(0.7, scale)
      for (const edge of network.edges) {
        const from = currentNodes[edge.from]
        const to = currentNodes[edge.to]
        context.strokeStyle = rgba(color, 0.16 + visual.bloom * 0.08)
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke()
      }
      const spawnRate = (overlayVisual?.pulseRate ?? visual.pulseRate) * (0.35 + intensityRef.current * 0.9)
      if (!staticMotion && Math.random() < spawnRate * delta * 0.004 && network.edges.length) {
        const edge = network.edges[Math.floor(Math.random() * network.edges.length)]
        pulses.push({ edge, progress: 0, speed: 0.7 + Math.random() * 1.4 })
      }
      for (let index = pulses.length - 1; index >= 0; index -= 1) {
        const pulse = pulses[index]
        pulse.progress += delta * 0.001 * pulse.speed * (overlayVisual?.pulseRate ?? (currentState === 'hot' ? 1.7 : currentState === 'surge' ? 1.4 : 1))
        if (pulse.progress >= 1) { pulses.splice(index, 1); continue }
        const from = currentNodes[pulse.edge.from]
        const to = currentNodes[pulse.edge.to]
        const x = from.x + (to.x - from.x) * pulse.progress
        const y = from.y + (to.y - from.y) * pulse.progress
        context.strokeStyle = rgba(color, 0.8); context.lineWidth = Math.max(1, scale * 1.4)
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(x, y); context.stroke()
        context.fillStyle = rgba(color, 0.95); context.beginPath(); context.arc(x, y, 2.1 * scale, 0, Math.PI * 2); context.fill()
        context.fillStyle = `rgba(255,255,255,${0.55 + visual.bloom * 0.25})`; context.beginPath(); context.arc(x, y, 0.8 * scale, 0, Math.PI * 2); context.fill()
      }
      network.nodes.forEach((node, index) => {
        const target = currentNodes[index]
        const pulse = staticMotion ? 0 : Math.sin(elapsed * (overlayVisual?.pulseRate ?? visual.pulseRate) * Math.PI * 2 + node.phase) * 0.7
        const radius = (node.shell === 0 ? 5.5 : 2.6) * scale + pulse * scale
        context.fillStyle = rgba(color, 0.22 + visual.bloom * 0.45)
        context.beginPath(); context.arc(target.x, target.y, radius * 1.9, 0, Math.PI * 2); context.fill()
        context.fillStyle = rgba(color, 0.5 + visual.bloom * 0.35)
        context.beginPath(); context.arc(target.x, target.y, radius, 0, Math.PI * 2); context.fill()
        context.fillStyle = `rgba(255,255,255,${0.2 + visual.bloom * 0.5})`
        context.beginPath(); context.arc(target.x, target.y, radius * 0.42, 0, Math.PI * 2); context.fill()
      })
      context.strokeStyle = rgba(color, 0.24 + (overlayVisual?.bloom ?? visual.bloom) * 0.36)
      context.lineWidth = Math.max(1, scale * 1.4)
      const ringAngle = staticMotion ? 0 : elapsed * (overlayVisual?.ringDirection ?? 1) * (overlayVisual ? 2.4 : 0.35)
      context.beginPath(); context.arc(width / 2, height / 2, 120 * scale, ringAngle - 0.1, ringAngle + 0.62); context.stroke()
      context.strokeStyle = rgba(color, 0.2)
      context.beginPath(); context.arc(width / 2, height / 2, 130 * scale, ringAngle, ringAngle + Math.PI * 2); context.stroke()
      for (let tick = 0; tick < 60; tick += 1) {
        const angle = tick * Math.PI / 30
        const length = tick % 15 === 0 ? 10 : 5
        const inner = 137 * scale - length * scale
        context.strokeStyle = rgba(color, tick % 15 === 0 ? 0.45 : 0.15)
        context.beginPath()
        context.moveTo(width / 2 + Math.cos(angle) * inner, height / 2 + Math.sin(angle) * inner)
        context.lineTo(width / 2 + Math.cos(angle) * 137 * scale, height / 2 + Math.sin(angle) * 137 * scale)
        context.stroke()
      }
      for (let index = shockwaves.length - 1; index >= 0; index -= 1) {
        const shockwave = shockwaves[index]
        shockwave.progress += delta * (shockwave.speed ?? 0.00055)
        if (shockwave.progress >= 1) { shockwaves.splice(index, 1); continue }
        context.strokeStyle = rgba(shockwave.color, 0.5 * (1 - shockwave.progress))
        context.beginPath(); context.arc(width / 2, height / 2, (104 + shockwave.progress * 120) * scale, 0, Math.PI * 2); context.stroke()
      }
      context.restore()
      if (!staticMotion && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }
    const restart = () => { if (frame) cancelAnimationFrame(frame); previous = performance.now(); draw(previous) }
    const visibility = () => document.visibilityState === 'visible' ? restart() : frame && cancelAnimationFrame(frame)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    document.addEventListener('visibilitychange', visibility)
    resize()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [overlay, state, staticMotion, visible])

  return <canvas ref={canvasRef} className="ob-neural-canvas" aria-hidden="true" />
}
