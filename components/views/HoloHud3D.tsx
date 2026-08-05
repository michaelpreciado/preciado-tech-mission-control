'use client'

/**
 * HoloHud3D — true 3D orbital dispatch visualization (WebGL via react-three-fiber).
 *
 * A glowing wireframe core (HERMES) floats at the center of a tilted orbital
 * ring. The agent roster orbits in real 3D space — each a emissive orb in its
 * categorical accent. An energy beam connects the core to whichever agent is
 * actually working. The camera auto-rotates for a "control room" drift and
 * responds to touch drag/pinch (mobile, Pixel Fold) via drei OrbitControls.
 *
 * State encoding (brief-preserving):
 *  - working  → orb bright + pulsing + beam from core
 *  - waiting  → dimmer beam, orb steady slightly raised
 *  - errored  → RED, loud, hard flash
 *  - offline  → grey, low emissive (asleep ≠ error)
 *  - idle     → static, accent-tinted, calm
 *  - stale    → desaturated, opacity drop
 * Selections (tap) bubble up to the parent DetailSheet via onSelect.
 *
 * WebGL is client-only by definition; this component is loaded with ssr:false
 * from the Team page, and never mounts in a render target that lacks WebGL.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentNode } from '@/lib/telemetry-types'
import { HEARTBEAT_STALE_MS } from '@/lib/telemetry'

/* ── Constants ────────────────────────────────────────────────────────── */

const RING_R = 3.0          // orbital radius (world units)
const ORB_R = 0.30          // agent orb radius
const CORE_R = 0.55         // core radius

function isStaleNode(n: AgentNode): boolean {
  if (n.state === 'offline' || n.state === 'working') return false
  if (n.lastSeenAt === null) return false
  const ts = n.lastSeenAt > 1e12 ? n.lastSeenAt : n.lastSeenAt * 1000
  return Date.now() - ts > HEARTBEAT_STALE_MS
}

/** Local-space position for roster index i on the tilted ring (deterministic). */
function orbitPos(i: number, total: number): [number, number, number] {
  const a = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  const x = RING_R * Math.cos(a)
  const z = RING_R * Math.sin(a)
  // slight vertical bob → reads as 3D, not a flat disc
  const y = Math.sin(a * 3) * 0.22
  return [x, y, z]
}

/* ── Core (HERMES) ────────────────────────────────────────────────────── */

function Core() {
  const wire = useRef<THREE.Mesh>(null)
  const shell = useRef<THREE.Mesh>(null)
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (wire.current) { wire.current.rotation.y += dt * 0.12; wire.current.rotation.x += dt * 0.05 }
    if (shell.current) { const s = 1 + Math.sin(t * 1.8) * 0.06; shell.current.scale.setScalar(s) }
  })
  return (
    <group>
      {/* inner filled core */}
      <mesh ref={shell}>
        <sphereGeometry args={[CORE_R, 32, 32]} />
        <meshStandardMaterial color="#ff10f0" emissive="#ff10f0" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {/* wireframe shell */}
      <mesh ref={wire}>
        <icosahedronGeometry args={[CORE_R * 1.45, 1]} />
        <meshBasicMaterial color="#ff7df8" wireframe transparent opacity={0.55} />
      </mesh>
      {/* halo ring */}
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[CORE_R * 2.1, 0.012, 8, 64]} />
        <meshBasicMaterial color="#ff7df8" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

/* ── Single agent orb ─────────────────────────────────────────────────── */

function AgentOrb({ node, selected, onClick }: { node: AgentNode; selected: boolean; onClick: () => void }) {
  const mesh = useRef<THREE.Mesh>(null)
  const stale = isStaleNode(node)

  // Resolve color + intensity from state
  const { color, intensity, baseScale } = useMemo(() => {
    switch (node.state) {
      case 'working': return { color: node.accent, intensity: 2.0, baseScale: 1.25 }
      case 'waiting': return { color: node.accent, intensity: 1.0, baseScale: 1.0 }
      case 'errored': return { color: '#ff5f57', intensity: 2.4, baseScale: 1.2 }
      case 'offline': return { color: '#788094', intensity: 0.25, baseScale: 0.9 }
      default:        return { color: node.accent, intensity: 0.7, baseScale: 1.0 }
    }
  }, [node.state, node.accent])

  const op = stale ? 0.45 : 1

  useFrame((state, dt) => {
    if (!mesh.current) return
    const t = state.clock.elapsedTime
    let s = baseScale * ORB_R
    if (node.state === 'working') s = ORB_R * (1.25 + Math.sin(t * 5) * 0.12)
    if (node.state === 'errored') s = ORB_R * (1.2 + Math.sin(t * 8) * 0.18)
    if (selected) s *= 1.15
    mesh.current.scale.setScalar(s)
    // bob
    mesh.current.position.y = Math.sin(t * 1.2 + node.id.length) * 0.05
  })

  return (
    <mesh
      ref={mesh}
      onClick={e => { e.stopPropagation(); onClick() }}
      onPointerOver={e => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      <sphereGeometry args={[ORB_R, 24, 24]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        transparent={op < 1}
        opacity={op}
        toneMapped={false}
      />
    </mesh>
  )
}

/* ── Energy beam core → active agent ──────────────────────────────────── */

function Beam({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  // thin emissive cylinder oriented from→to
  const ref = useRef<THREE.Group>(null)
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize()
  const quat = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    return new THREE.Quaternion().setFromUnitVectors(up, dir)
  }, [len]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    const mat = ref.current.children[0] as THREE.Mesh
    ;(mat.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * 6) * 0.25 + 0.85
  })

  return (
    <group ref={ref} position={mid} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, len, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ── The full scene ───────────────────────────────────────────────────── */

function Scene({ nodes, selectedId, onSelect }: { nodes: AgentNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const orbitAgents = useMemo(() => nodes.filter(n => n.id !== 'hermes'), [nodes])
  const corePos: [number, number, number] = [0, 0, 0]

  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[6, 6, 8]} intensity={40} color="#ff10f0" />
      <pointLight position={[-6, -4, -6]} intensity={20} color="#1e90ff" />
      <Stars radius={60} depth={40} count={2200} factor={3} saturation={0} fade speed={0.6} />

      {/* tilted orbital group */}
      <group rotation={[0.42, 0, 0.18]}>
        {/* ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RING_R, 0.012, 8, 128]} />
          <meshBasicMaterial color="#ff10f0" transparent opacity={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RING_R * 0.72, 0.008, 8, 128]} />
          <meshBasicMaterial color="#ff7df8" transparent opacity={0.18} />
        </mesh>

        {/* beam to active agent */}
        {orbitAgents.map((n, i) => {
          if (n.state !== 'working' && n.state !== 'waiting') return null
          const p = orbitPos(i, orbitAgents.length)
          return (
            <Beam
              key={`beam-${n.id}`}
              from={corePos}
              to={p}
              color={n.accent}
            />
          )
        })}

        {/* agent orbs */}
        {orbitAgents.map((n, i) => {
          const p = orbitPos(i, orbitAgents.length)
          return (
            <mesh key={n.id} position={p}>
              <AgentOrb node={n} selected={selectedId === n.id} onClick={() => onSelect(n.id)} />
            </mesh>
          )
        })}
      </group>

      <Core />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={3.5}
        maxDistance={11}
        autoRotate
        autoRotateSpeed={1.1}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  )
}

/* ── Canvas wrapper (the React component the panel imports) ───────────── */

export default function HoloHud3D({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: AgentNode[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="mc-hud3d">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 4.2, 6.4], fov: 42 }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      >
        <Scene nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
      </Canvas>
    </div>
  )
}
