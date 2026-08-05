'use client'

/**
 * HoloHud3D — minimalist 3D dispatch-tree visualization (WebGL via react-three-fiber).
 *
 * Same real 3D rendering as before, but toned WAY down to match a clean,
 * org-chart reference: a top-down hierarchical tree with rounded card nodes
 * (HERMES root at the top, agents below), orthogonal elbow connectors, and
 * only subtle depth. No neon glow, no emissive orbs, no starfield.
 *
 * Design:
 *  - Cards are clean, lightly-tinted rounded rectangles (root in green, agents
 *    in a light tint of their categorical accent), with crisp DOM <Html> labels
 *    above each (READABLE text on a phone).
 *  - Connectors are orthogonal elbow lines (root → vertical drop → horizontal
 *    run at depth → vertical drop), like the reference's org-tree.
 *  - Depth is subtle: agents sit on a gentle 3D wave (z varies), the tree is
 *    tilted slightly, and the camera sits at an angle with a very slow drift.
 *  - State stays readable & minimal:
 *      working → card gently pulses, accent underline, label ★WORKING
 *      errored → red outline + red label
 *      offline → desaturated grey card
 *      stale   → faded opacity
 *  - Touch: drag to orbit, pinch to zoom (drei OrbitControls).
 *
 * WebGL is client-only; loaded ssr:false from the Team page.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Line, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentNode } from '@/lib/telemetry-types'
import { HEARTBEAT_STALE_MS } from '@/lib/telemetry'

/* ── Layout constants (world units) ───────────────────────────────────── */

const ROOT_POS: [number, number, number] = [0, 2.9, 0]
const AGENT_Y = 0.55
const MID_Y = 1.75
const CARD_W = 1.35
const CARD_H = 0.6
const CARD_D = 0.06
const ROOT_W = 1.8
const ROOT_H = 0.72

function isStaleNode(n: AgentNode): boolean {
  if (n.state === 'offline' || n.state === 'working') return false
  if (n.lastSeenAt === null) return false
  const ts = n.lastSeenAt > 1e12 ? n.lastSeenAt : n.lastSeenAt * 1000
  return Date.now() - ts > HEARTBEAT_STALE_MS
}

/** Mix a hex color toward white by `f` (0..1) → soft pastel card fill. */
function lighten(hex: string, f: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c: number) => Math.round(c + (255 - c) * f)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/** Agent i horizontal position (evenly spaced, deterministic). */
function agentX(i: number, total: number): number {
  return (i - (total - 1) / 2) * 1.9
}

/** Agent i depth → subtle 3D wave so the tree reads as having depth. */
function agentZ(i: number): number {
  return Math.sin(i * 2.4) * 0.55
}

/* ── Card node ────────────────────────────────────────────────────────── */

function Card({
  node,
  pos,
  w,
  h,
  selected,
  isRoot,
  onClick,
}: {
  node: AgentNode
  pos: [number, number, number]
  w: number
  h: number
  selected: boolean
  isRoot: boolean
  onClick: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const stale = isStaleNode(node)

  // Card fill + outline resolved from state — minimal, no glow.
  const fill = isRoot ? '#dff2dc' : lighten(node.accent, 0.78)
  const outline = isRoot
    ? '#4caf50'
    : node.state === 'errored'
      ? '#ff5f57'
      : node.state === 'offline'
        ? '#9aa3b2'
        : node.accent

  const dimmed = stale ? 0.45 : 1
  const greyed = node.state === 'offline' ? 0.6 : 1

  useFrame((state) => {
    if (!group.current || node.state !== 'working') return
    const t = state.clock.elapsedTime
    const s = 1 + Math.sin(t * 4) * 0.02
    group.current.scale.setScalar(s)
  })

  // Elbow connector: root bottom → down → horizontal → down to this card top.
  const connector = useMemo(() => {
    const topY = pos[1] + h / 2 + 0.02
    return [
      [ROOT_POS[0], ROOT_POS[1] - ROOT_H / 2, ROOT_POS[2]],
      [ROOT_POS[0], MID_Y, ROOT_POS[2]],
      [pos[0], MID_Y, pos[2]],
      [pos[0], topY, pos[2]],
    ] as [number, number, number][]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos[0], pos[2], h])

  return (
    <group>
      {!isRoot && (
        <Line
          points={connector}
          color={node.state === 'errored' ? '#ff5f57' : '#b8c4d6'}
          lineWidth={1.5}
          transparent
          opacity={0.85}
        />
      )}
      {/* card */}
      <group ref={group} position={pos}>
        {/* outline (slightly larger box behind → clean rounded border) */}
        <RoundedBox args={[w + 0.05, h + 0.05, CARD_D + 0.02]} radius={0.09} smoothness={4}>
          <meshStandardMaterial color={outline} />
        </RoundedBox>
        {/* card face */}
        <RoundedBox args={[w, h, CARD_D]} radius={0.09} smoothness={4}>
          <meshStandardMaterial
            color={fill}
            transparent={dimmed < 1 || greyed < 1}
            opacity={Math.min(dimmed, greyed)}
          />
        </RoundedBox>

        {/* accent underline for working */}
        {node.state === 'working' && (
          <mesh position={[0, -h / 2 + 0.03, 0.04]}>
            <boxGeometry args={[w * 0.5, 0.04, 0.01]} />
            <meshStandardMaterial color={node.accent} />
          </mesh>
        )}
      </group>

      {/* crisp DOM label above the card */}
      <Html position={[pos[0], pos[1] + h / 2 + 0.34, pos[2]]} center zIndexRange={[20, 0]}>
        <div
          className={`mc-card-label state-${node.state}${isRoot ? ' is-root' : ''}${selected ? ' is-selected' : ''}`}
          onClick={onClick}
          role="button"
          aria-label={`${node.name} · ${node.state}`}
        >
          <span className={`mc-card-dot state-${node.state}`} style={{ background: node.state === 'errored' ? '#d93025' : node.state === 'offline' ? '#8a93a3' : node.accent }} />
          <span className="mc-card-name" style={{ color: isRoot ? '#2e7d32' : '#1a1f2b' }}>{node.name}</span>
        </div>
      </Html>
    </group>
  )
}

/* ── The full scene ───────────────────────────────────────────────────── */

function Scene({ nodes, selectedId, onSelect }: { nodes: AgentNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hermes = useMemo(() => nodes.find(n => n.id === 'hermes'), [nodes])
  const agents = useMemo(() => nodes.filter(n => n.id !== 'hermes'), [nodes])

  // A very shallow depth faint grid for subtle spatial reference (faint, not neon).
  const gridDivisions = 22

  return (
    <>
      {/* minimal lighting — flat & clean, no neon punch */}
      <ambientLight intensity={1.0} />
      <directionalLight position={[4, 8, 6]} intensity={1.0} />
      <fog attach="fog" args={['#0b0d12', 14, 26]} />

      {/* HERMES root */}
      {hermes && (
        <Card node={hermes} pos={[...ROOT_POS]} w={ROOT_W} h={ROOT_H} selected={selectedId === hermes.id} isRoot onClick={() => onSelect(hermes.id)} />
      )}

      {/* agents */}
      {agents.map((n, i) => {
        const pos: [number, number, number] = [agentX(i, agents.length), AGENT_Y, agentZ(i)]
        return (
          <Card key={n.id} node={n} pos={pos} w={CARD_W} h={CARD_H} selected={selectedId === n.id} isRoot={false} onClick={() => onSelect(n.id)} />
        )
      })}

      {/* faint reference grid on the floor */}
      <gridHelper args={[18, gridDivisions, '#39404d', '#242a33']} position={[0, -0.5, 0]} />

      <OrbitControls
        target={[0, 1.7, 0]}
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={13}
        autoRotate
        autoRotateSpeed={0.6}
        enableDamping
        dampingFactor={0.1}
      />
    </>
  )
}

/* ── Canvas wrapper ───────────────────────────────────────────────────── */

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
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0.5, 3.6, 7.6], fov: 42 }}
        style={{ width: '100%', height: '100%', touchAction: 'none', background: 'transparent' }}
      >
        <Scene nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
      </Canvas>
    </div>
  )
}
