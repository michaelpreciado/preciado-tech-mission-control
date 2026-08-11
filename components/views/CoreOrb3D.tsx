'use client'

/**
 * CoreOrb3D — a living "command core" for the Home page.
 *
 * A compact WebGL orb: a translucent emissive sphere with two tilted orbit
 * rings, and one glowing speck per crew agent circling at its own radius
 * & speed (accent = that agent's color). The core breathes faster when any
 * agent is working, and a working agent's speck swells + brightens in real
 * time — so the Home core reads the crew's pulse without a wall of text.
 *
 * Perf/motion guards (same contract as AmbientNeuralField):
 *  - `prefers-reduced-motion` → static frame, no loop.
 *  - coarse pointer → static frame + lower opacity (saves phone battery).
 *  - dpr capped, few objects, additive blends.
 *
 * Client-only; loaded `ssr:false` inside HomeDeck.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useLiveData } from '../LiveDataProvider'

const AGENTS = ['friday', 'echo', 'sage', 'forge', 'ticker', 'scout', 'crypto']

function wantsStatic(): boolean {
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return false
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

function Orb() {
  const core = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const specks = useRef<(THREE.Mesh | null)[]>([])
  const accent = useAgentAccents()

  const ringGeo = useMemo(() => new THREE.TorusGeometry(1.05, 0.008, 12, 90), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Any agent working → core breathes faster + hotter.
    const anyWorking = AGENTS.some(id => accent[id]?.active)
    const beat = anyWorking ? 6 : 2.6
    const pulse = 0.5 + (Math.sin(t * beat) * 0.5 + 0.5) * 0.4

    if (core.current) {
      const m = core.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.16 + pulse * 0.22
      m.color.setScalar(0.6 + pulse * 0.4)
      core.current.scale.setScalar(1 + pulse * 0.06)
    }
    if (inner.current) {
      const m = inner.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.5 + Math.sin(t * beat * 2) * 0.2
      inner.current.rotation.y = t * 0.2
      inner.current.rotation.x += 0.002
    }
    if (ringA.current) { ringA.current.rotation.z = t * 0.35; ringA.current.rotation.x = 0.35 + t * 0.1 }
    if (ringB.current) { ringB.current.rotation.z = t * 0.45; ringB.current.rotation.x = -0.4 + t * 0.08 }

    AGENTS.forEach((id, i) => {
      const spe = specks.current[i]
      if (!spe) return
      const info = accent[id] ?? { color: '#1e90ff', active: false }
      const speed = 0.5 + i * 0.09
      const angle = t * speed + i * 2.1
      const radius = 1.05 + (i % 3) * 0.12
      spe.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, Math.sin(angle) * 0.3)
      const m = spe.material as THREE.MeshBasicMaterial
      m.color.set(info.color)
      const glow = info.active ? 1 + Math.sin(t * 8 + i) * 0.5 : 0.6
      m.opacity = glow
      spe.scale.setScalar(info.active ? 0.05 + Math.sin(t * 8 + i) * 0.02 : 0.035)
    })
  })

  return (
    <group>
      {/* translucent core */}
      <mesh ref={core}>
        <sphereGeometry args={[0.7, 40, 40]} />
        <meshBasicMaterial color="#1e90ff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* bright inner shell */}
      <mesh ref={inner}>
        <sphereGeometry args={[0.86, 32, 32]} />
        <meshBasicMaterial color="#83c2ff" wireframe transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* orbit rings */}
      <mesh ref={ringA} geometry={ringGeo}>
        <meshBasicMaterial color="#1e90ff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ringB} geometry={ringGeo}>
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* crew specks */}
      {AGENTS.map((id) => (
        <mesh key={id} ref={(el) => { (specks.current as (THREE.Mesh | null)[])[AGENTS.indexOf(id)] = el }}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color="#1e90ff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function CoreOrb3D() {
  return (
    <div className="mc-coreorb" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        frameloop={wantsStatic() ? 'demand' : 'always'}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <Orb />
      </Canvas>
    </div>
  )
}
