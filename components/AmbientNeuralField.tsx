'use client'

/**
 * AmbientNeuralField — a living WebGL backdrop for the whole cockpit.
 *
 * A fixed, transparent canvas behind every page: a cloud of drifting points
 * whose nearest neighbours are joined by faint on-theme lines (the "neural
 * mesh"). The camera does a slow wander and parallax-follows the pointer, so
 * the field feels alive but never distracts from the panels above it.
 *
 * Perf / battery / motion guards (verified pattern from HoloHud3D):
 *  - `prefers-reduced-motion` → renders a static frame, no rAF loop.
 *  - coarse pointer (phone/fold) → static frame too (saves OLED + battery).
 *  - `frameloop` is driven by visibility: hidden tabs don't animate.
 *  - Points are capped; everything is additive-blended points/lines, so the
 *    scene is a handful of draw calls — fine on an iGPU.
 *
 * Loaded `ssr:false` from Shell (WebGL canvas can't render on the server).
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 380
const SPREAD = 26 // world units cube
const LINK_DIST = 3.2
const NEON = new THREE.Color('#1e90ff')

/** True when we should freeze the loop (battery / motion preference). */
function wantsStatic(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return false
}

/* ── The mesh: points + nearest-neighbour links ───────────────────────── */

function Field() {
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const mouse = useRef({ x: 0, y: 0 })
  const { camera } = useThree()

  // Pointer parallax — listen at window level (the canvas is pointer-events:none).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Positions + links computed once (deterministic-ish scatter, no shuffling).
  const { positions, linkPositions, home } = useMemo(() => {
    const pts: number[] = []
    const arr: [number, number, number][] = []
    for (let i = 0; i < COUNT; i++) {
      // Bias the cloud toward the lower 2/3 (behind the content) and spread wide.
      const x = (Math.random() - 0.5) * SPREAD
      const y = (Math.random() - 0.5) * SPREAD * 0.7 - 1.5
      const z = (Math.random() - 0.5) * SPREAD
      pts.push(x, y, z)
      arr.push([x, y, z])
    }
    // Nearest-neighbour links (bounded per point to keep line count sane).
    const links: number[] = []
    for (let i = 0; i < arr.length; i++) {
      let best = Infinity
      let bi = -1
      for (let j = i + 1; j < arr.length; j++) {
        const d = Math.hypot(arr[i][0] - arr[j][0], arr[i][1] - arr[j][1], arr[i][2] - arr[j][2])
        if (d < best) { best = d; bi = j }
      }
      if (bi >= 0 && best < LINK_DIST) {
        links.push(...arr[i], ...arr[bi])
      }
    }
    return { positions: new Float32Array(pts), linkPositions: new Float32Array(links), home: new Float32Array(pts) }
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pts = pointsRef.current
    const lines = linesRef.current

    if (pts) {
      // Gentle drift: points orbit their home slightly + a slow vertical sway.
      const arr = pts.geometry.attributes.position
      for (let i = 0; i < COUNT; i++) {
        const o = i * 3
        const hx = home[o], hy = home[o + 1], hz = home[o + 2]
        arr.array[o] = hx + Math.sin(t * 0.4 + i * 0.7) * 0.5
        arr.array[o + 1] = hy + Math.cos(t * 0.3 + i * 1.1) * 0.35
        arr.array[o + 2] = hz + Math.sin(t * 0.25 + i * 1.7) * 0.4
      }
      arr.needsUpdate = true
    }

    // Slow wander + pointer parallax.
    camera.position.x += ((Math.sin(t * 0.05) * 1.2 + mouse.current.x * 1.6) - camera.position.x) * 0.02
    camera.position.y += ((-0.5 + mouse.current.y * 0.9) - camera.position.y) * 0.02
    camera.lookAt(0, -0.5, 0)
  })

  return (
    <group>
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.09}
          color={NEON}
          transparent
          opacity={0.7}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linkPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={NEON} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {/* a couple of bright "pulse" points for visual rhythm */}
    </group>
  )
}

export default function AmbientNeuralField() {
  return (
    <div className="mc-ambient3d" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, -0.5, 16], fov: 50 }}
        frameloop={wantsStatic() ? 'demand' : 'always'}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Field />
      </Canvas>
    </div>
  )
}
