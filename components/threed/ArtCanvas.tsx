'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'

export type ArtScene = { scene: THREE.Scene; camera: THREE.PerspectiveCamera; update: (time: number, delta: number) => void }
export type ArtBuilder = () => ArtScene

/** Local renderer only: no application providers, textures, or scene framework. */
export function ArtCanvas({ build, label, style }: { build: ArtBuilder; label: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const canvas = ref.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }) }
    catch { setFailed(true); return }
    setFailed(false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const { scene, camera, update } = build()
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0, previous = 0, elapsed = 0, lost = false
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0
      previous = now
      if (document.hidden || lost) return
      if (!motion.matches) elapsed += delta
      update(elapsed, delta)
      renderer.render(scene, camera)
      canvas.dataset.drawCalls = String(renderer.info.render.calls)
    }
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; setFailed(true) }
    const contextRestored = () => { lost = false; setFailed(false) }
    canvas.addEventListener('webglcontextlost', contextLost)
    canvas.addEventListener('webglcontextrestored', contextRestored)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('webglcontextrestored', contextRestored)
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
      scene.traverse(object => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) geometries.add(mesh.geometry)
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m))
      })
      geometries.forEach(g => g.dispose())
      materials.forEach(m => m.dispose())
      renderer.dispose()
      // Reuse the canvas context on prop changes: forceContextLoss dispatches
      // asynchronously and can invalidate the next renderer on this canvas.
    }
  }, [build])
  return <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
    <canvas ref={ref} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {failed && <span role="status" style={{ position: 'absolute', inset: 16, color: '#8cecff', fontSize: 12 }}>3D preview unavailable — WebGL2 is required.</span>}
  </div>
}

export function artScene(distance = 5): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.z = distance
  return { scene, camera }
}
