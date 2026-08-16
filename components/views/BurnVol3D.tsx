'use client'

/**
 * BurnVol3D — a distinct 3D "burn volume" for the Costs tab.
 *
 * The flat dashboard already shows token-burn stacks as a 2D chart. This is a
 * deliberately DIFFERENT artifact (the design rule for the costs comparison):
 * each of the last N days becomes an animated 3D column made of three stacked
 * glowing volumes — API (blue) / Claude Code (violet) / Local (green) — whose
 * height is this day's token burn. The columns sit on a reflective floor with
 * a slow auto-orbit + pointer drag, so the burn reads as a physical landscape
 * rather than another flat bar. Own palette, real data, zero duplication.
 *
 * Same motion/perf guards: reduced-motion & coarse pointers freeze to a
 * static angle (no rAF spin), additive glows, capped dpr.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { useLiveData } from '../LiveDataProvider'
import { useUiSettings } from '../ui-settings'
import { wantsStaticMotion, type MotionSetting } from '@/lib/motion-pref'
import type { CostDashboard } from '@/lib/types'

const DAYS = 14
const SEG = [
  { key: 'api' as const, color: '#1e90ff' },
  { key: 'claude' as const, color: '#8b5cf6' },
  { key: 'local' as const, color: '#3ddc97' },
]
const COL_W = 0.42
const GAP = 0.3

/** Flatten the latest N daily buckets into API/Claude/Local token stacks. */
function useBurnSeries(costs: CostDashboard): { date: string; stacks: number[] }[] {
  return useMemo(() => {
    const providerOf = (model: string) => (costs.models ?? []).find(m => m.model === model)?.provider ?? 'unknown'
    const byDate = new Map<string, { api: number; claude: number; local: number }>()
    for (const d of costs.daily ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
      const slot = byDate.get(d.date) ?? { api: 0, claude: 0, local: 0 }
      for (const [model, v] of Object.entries(d.byModel ?? {})) {
        const tokens = typeof v === 'object' ? (v as { tokens?: number }).tokens ?? 0 : 0
        if (providerOf(model) === 'ollama') slot.local += tokens
        else slot.api += tokens
      }
      byDate.set(d.date, slot)
    }
    for (const d of costs.claudeUsage?.daily ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
      const slot = byDate.get(d.date) ?? { api: 0, claude: 0, local: 0 }
      slot.claude += d.tokens
      byDate.set(d.date, slot)
    }
    return [...byDate.entries()]
      .map(([date, v]) => ({ date, stacks: [v.api, v.claude, v.local] }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-DAYS)
  }, [costs])
}

function fmtT(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function Columns({ series, motion }: { series: { date: string; stacks: number[] }[]; motion: MotionSetting }) {
  const group = useRef<THREE.Group>(null)
  const max = useMemo(() => Math.max(...series.flatMap(s => s.stacks), 1), [series])

  // Slow auto-orbit (frozen by reduced-motion / coarse pointers / the explicit
  // Setup → UI CUSTOMIZATION motion override via wantsStaticMotion).
  useFrame(() => {
    if (group.current && !wantsStaticMotion(motion)) group.current.rotation.y += 0.0007
  })

  return (
    <group ref={group}>
      {series.map((day, i) => {
        const x = (i - (series.length - 1) / 2) * (COL_W + GAP)
        let y = 0
        return (
          <group key={day.date} position={[x, 0, 0]}>
            {SEG.map((seg, s) => {
              const h = (day.stacks[s] / max) * 2.6
              const base = y
              y += h
              return (
                <mesh key={seg.key} position={[0, base + h / 2 + 0.01, 0]}>
                  <boxGeometry args={[COL_W, Math.max(h, 0.01), COL_W]} />
                  <meshStandardMaterial
                    color={seg.color}
                    emissive={seg.color}
                    emissiveIntensity={0.35}
                    transparent
                    opacity={0.85}
                    roughness={0.3}
                    metalness={0.1}
                  />
                </mesh>
              )
            })}
            {/* faint date tag under each column */}
          </group>
        )
      })}
    </group>
  )
}

export default function BurnVol3D({ costs }: { costs: CostDashboard }) {
  const series = useBurnSeries(costs)
  const { motion } = useUiSettings()
  if (!series.length) return null

  return (
    <div className="mc-burnvol" aria-label="3D token burn volume">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [6, 4.5, 6.5], fov: 42 }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 4]} intensity={1.1} />
        <pointLight position={[-4, 3, -3]} intensity={0.4} color="#1e90ff" />
        <Columns series={series} motion={motion} />
        <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={14} blur={2.5} far={3} resolution={256} color="#000000" />
        <OrbitControls
          enablePan={false}
          minDistance={4}
          maxDistance={14}
          autoRotate={!wantsStaticMotion(motion)}
          autoRotateSpeed={0.7}
          enableDamping
          dampingFactor={0.12}
        />
      </Canvas>
    </div>
  )
}
