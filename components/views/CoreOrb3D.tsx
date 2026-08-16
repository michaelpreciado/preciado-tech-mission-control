'use client'

/**
 * CoreOrb3D — a living "data sphere" command core for the Home page.
 *
 * A hollow globe made of a GPU-instanced point cloud (drei `Points` /
 * `PointMaterial`, one draw call for the whole body) laid out on a
 * Fibonacci sphere. This reads as a data visualization rather than a
 * literal planet — no solid shell, no lit mesh, just points. Two live
 * signals drive the cloud itself: `counts.openTasks` sets how much of the
 * sphere is "lit" (more open work → more active points), and recent
 * `costs.daily` burn sets how bright the lit points glow. A handful of
 * larger, colored points — one per crew agent, reusing `useAgentAccents()`
 * — orbit just outside the cloud as distinct beacons; a working agent's
 * beacon swells + brightens in real time. The whole sphere breathes
 * (opacity pulse) faster when any agent is working, same as the old orb.
 *
 * Perf/motion guards (same contract as AmbientNeuralField / BurnVol3D):
 *  - `prefers-reduced-motion` → static frame, no loop.
 *  - coarse pointer → static frame (saves phone battery).
 *  - dpr capped, additive blends, zero real lights.
 *  - cloud geometry (positions) is built once and never resized — only its
 *    color attribute is recomputed on data change, so live updates never
 *    cause the sphere to visibly "re-scatter".
 *
 * Client-only; loaded `ssr:false` inside HomeDeck.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { useLiveData } from '../LiveDataProvider'
import { useUiSettings } from '../ui-settings'
import { wantsStaticMotion } from '@/lib/motion-pref'

const AGENTS = ['friday', 'echo', 'sage', 'forge', 'ticker', 'scout', 'crypto']

const POINT_COUNT = 900
const SPHERE_SCALE = 1.05
const ACCENT_COLOR = new THREE.Color('#1e90ff')
const LATENT_COLOR = new THREE.Color('#12283a')

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Deterministic pseudo-random in [0, 1) from an integer seed — no external deps, stable across renders. */
function hash(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function useAgentAccents(): Record<string, { color: string; active: boolean }> {
  const { data } = useLiveData()
  return useMemo(() => {
    const out: Record<string, { color: string; active: boolean }> = {}
    const crew = data?.crew ?? []
    for (const id of AGENTS) {
      const member = crew.find(c => c.id === id)
      const active = !!member && (member.status === 'active' || member.status === 'on-demand')
      out[id] = { color: member?.accent ?? '#1e90ff', active }
    }
    return out
  }, [data])
}

/** Open-task load (0..1, floored) and recent cost burn (0..1, floored) — the two live signals for the cloud. */
function useCoreMetrics(): { density: number; heat: number } {
  const { data } = useLiveData()
  return useMemo(() => {
    const openTasks = data?.counts?.openTasks ?? 0
    const density = 0.3 + clamp01(openTasks / 40) * 0.7
    const daily = data?.costs?.daily ?? []
    const burn = daily.slice(-3).reduce((sum, d) => sum + (typeof d.cost === 'number' ? d.cost : 0), 0)
    const heat = 0.25 + clamp01(burn / 12) * 0.75
    return { density, heat }
  }, [data])
}

/** Fixed Fibonacci-sphere layout, built once — never regenerated on data change. */
function useSphereLayout(count: number): { positions: Float32Array; rank: Float32Array } {
  return useMemo(() => {
    const positions = new Float32Array(count * 3)
    const rank = new Float32Array(count)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      const jitter = 0.88 + hash(i) * 0.24 // faint shell depth, so it's a cloud, not a mathematical shell
      positions[i * 3] = Math.cos(theta) * r * jitter * SPHERE_SCALE
      positions[i * 3 + 1] = y * jitter * SPHERE_SCALE
      positions[i * 3 + 2] = Math.sin(theta) * r * jitter * SPHERE_SCALE
      rank[i] = hash(i * 7 + 3) // independent per-point threshold used for "lit" activation
    }
    return { positions, rank }
  }, [count])
}

/** Per-point color buffer: recomputed on data change only (density/heat), never per-frame. */
function useCloudColors(rank: Float32Array, density: number, heat: number): Float32Array {
  return useMemo(() => {
    const n = rank.length
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const active = rank[i] < density
      const brightness = active
        ? 0.55 + heat * 0.45 + hash(i * 3.1) * 0.15
        : 0.1 + hash(i * 5.2) * 0.05
      const c = active ? ACCENT_COLOR : LATENT_COLOR
      colors[i * 3] = c.r * brightness
      colors[i * 3 + 1] = c.g * brightness
      colors[i * 3 + 2] = c.b * brightness
    }
    return colors
  }, [rank, density, heat])
}

function DataCloud({ density, heat }: { density: number; heat: number }) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const { positions, rank } = useSphereLayout(POINT_COUNT)
  const colors = useCloudColors(rank, density, heat)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (group.current) {
      group.current.rotation.y = t * 0.06
      group.current.rotation.x = Math.sin(t * 0.05) * 0.08
    }
    if (material.current) {
      const pulse = 0.5 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.5
      material.current.opacity = (0.55 + pulse * 0.3) * (0.7 + heat * 0.3)
    }
  })

  return (
    <group ref={group}>
      <Points positions={positions} colors={colors} stride={3}>
        <PointMaterial
          ref={material}
          vertexColors
          size={0.045}
          sizeAttenuation
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </group>
  )
}

function CrewBeacons() {
  const beacons = useRef<(THREE.Mesh | null)[]>([])
  const accent = useAgentAccents()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    AGENTS.forEach((id, i) => {
      const b = beacons.current[i]
      if (!b) return
      const info = accent[id] ?? { color: '#1e90ff', active: false }
      const speed = 0.45 + i * 0.08
      const angle = t * speed + i * 2.1
      const radius = SPHERE_SCALE * (1.18 + (i % 3) * 0.05)
      b.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, Math.sin(angle) * 0.35)
      const m = b.material as THREE.MeshBasicMaterial
      m.color.set(info.color)
      const glow = info.active ? 1 + Math.sin(t * 8 + i) * 0.5 : 0.6
      m.opacity = glow
      b.scale.setScalar(info.active ? 0.055 + Math.sin(t * 8 + i) * 0.02 : 0.045)
    })
  })

  return (
    <group>
      {AGENTS.map((id, i) => (
        <mesh key={id} ref={(el) => { beacons.current[i] = el }}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#1e90ff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Scene() {
  const { density, heat } = useCoreMetrics()
  return (
    <>
      <DataCloud density={density} heat={heat} />
      <CrewBeacons />
    </>
  )
}

export default function CoreOrb3D() {
  const { motion } = useUiSettings()
  return (
    <div className="mc-coreorb" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        frameloop={wantsStaticMotion(motion) ? 'demand' : 'always'}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
