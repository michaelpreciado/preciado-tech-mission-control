'use client'

/**
 * HoloHud3D — Apple-polished 3D dispatch-tree (WebGL via react-three-fiber).
 *
 * A production-grade, AAA-feel hierarchical tree: HERMES root on top, sub-agent
 * cards below, joined by smooth catmull-rom tree branches that pulse with an
 * energy flow while that agent is working. Each agent has a crisp SF-Symbol-style
 * SVG icon chip (DOM <Html> → retina-sharp on the Pixel Fold), rendered over a
 * soft glass rounded card with real contact shadows for floating depth.
 *
 * Apple-UX principles applied:
 *  - Restraint: soft pastel cards, subtle depth, no neon.
 *  - Clarity: crisp SVG icons + names always face the camera and stay readable.
 *  - Motion: gentle — a slow camera drift; the only "active" motion is the
 *    working agent's pulsing ring + animated branch flow. Idle stays calm.
 *  - Refinement: rounded geometry, smooth S-curve connectors, soft shadows.
 *
 * State encoding (brief-preserving):
 *  - working  → accent ring pulse + animated branch flow (energy traveling down)
 *  - waiting  → steady, calm
 *  - errored  → red ring + red chip
 *  - offline  → grey, faded (asleep ≠ error)
 *  - stale    → desaturated
 * Touch: drag to orbit, pinch to zoom (drei OrbitControls).
 *
 * WebGL is client-only; loaded ssr:false from the Team page.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Line, Html, OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentNode } from '@/lib/telemetry-types'
import { HEARTBEAT_STALE_MS } from '@/lib/telemetry'

/* ── Layout constants (world units) ───────────────────────────────────── */

const ROOT_POS: [number, number, number] = [0, 2.9, 0]
const AGENT_Y = 0.55
const MID_Y = 1.75
const CARD_W = 1.45
const CARD_H = 0.62
const CARD_D = 0.05
const ROOT_W = 1.9
const ROOT_H = 0.74

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
  return (i - (total - 1) / 2) * 2.85
}

/** Depth is intentionally flat — a clean, legible org row (Apple clarity). */
function agentZ(i: number): number {
  return 0
}

/* ── SF-Symbol-style icons (inline SVG, crisp at any DPI) ─────────────── */

type IconProps = { color: string; size?: number }

const ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  hermes:   ({ color }) => <><circle cx="12" cy="12" r="6.5" stroke={color} strokeWidth="2" fill="none" /><circle cx="12" cy="12" r="2" fill={color} /></>,
  jarvis:   ({ color }) => <><rect x="3.5" y="7" width="17" height="11.5" rx="2.5" stroke={color} strokeWidth="2" fill="none" /><path d="M9 7v-1a3 3 0 0 1 6 0v1" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  friday:   ({ color }) => <><path d="M5 5l6 7-6 7" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 19h7" stroke={color} strokeWidth="2" strokeLinecap="round" /></>,
  edith:    ({ color }) => <><path d="M12 4C7 4 3.5 8 2.5 12 3.5 16 7 20 12 20s8.5-4 9.5-8C20.5 8 17 4 12 4z" stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" /><circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="2" fill="none" /></>,
  openclaw: ({ color }) => <><circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" fill="none" /><path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7.05 7.05L5.6 5.6M18.4 18.4l-1.45-1.45M16.95 7.05l1.45-1.45M5.6 18.4l1.45-1.45" stroke={color} strokeWidth="2" strokeLinecap="round" /></>,
  echo:     ({ color }) => <><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" /></>,
  sage:     ({ color }) => <><circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="2" fill="none" /><path d="M15.5 15.5L21 21" stroke={color} strokeWidth="2" strokeLinecap="round" /><circle cx="8" cy="8.2" r="1" fill={color} /><path d="M8 10v3M8 13c0 1.6-1 2.5-2.6 2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" /></>,
  forge:    ({ color }) => <><path d="M4 20l4.5-4.5a3.2 3.2 0 0 1 4.5-4.5L20 4.5a2.5 2.5 0 0 1 3.5 3.5L17 14a3.2 3.2 0 0 1-4.5 4.5L8 23z" stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" /></>,
}

function AgentIcon({ id, color, size = 18 }: { id: string; color: string; size?: number }) {
  const render = ICONS[id] ?? ICONS.hermes
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="mc-agicon" aria-hidden="true">
      {render({ color })}
    </svg>
  )
}

/* ── Tree branch (smooth animated connector) ──────────────────────────── */

function Branch({ from, to, accent, active }: { from: [number, number, number]; to: [number, number, number]; accent: string; active: boolean }) {
  // catmull-rom through an elbow → smooth S-curve
  const points = useMemo(() => {
    const mid = (from[1] + to[1]) / 2
    return [
      new THREE.Vector3(...from),
      new THREE.Vector3((from[0] + to[0]) / 2, mid, from[2]),
      new THREE.Vector3((from[0] + to[0]) / 2, mid, to[2]),
      new THREE.Vector3(...to),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], to[0], to[1], to[2]])

  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points])
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 48, active ? 0.02 : 0.014, 6, false), [curve, active])

  const base = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!base.current) return
    const mat = base.current.material as THREE.MeshStandardMaterial
    if (!active) { mat.opacity = 0.55; return }
    const t = state.clock.elapsedTime
    // traveling energy pulse
    mat.emissiveIntensity = 0.6 + (Math.sin(t * 5) * 0.5 + 0.5) * 1.1
    mat.opacity = 0.95
  })

  return (
    <mesh ref={base} geometry={geo}>
      <meshStandardMaterial
        color={active ? accent : '#c6cfdc'}
        emissive={active ? accent : '#000000'}
        emissiveIntensity={0}
        transparent
        opacity={0.72}
        roughness={0.5}
        metalness={0.1}
      />
    </mesh>
  )
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
  const ring = useRef<THREE.Mesh>(null)
  const stale = isStaleNode(node)

  const fill = isRoot ? 'rgba(236,246,230,0.96)' : 'rgba(250,251,255,0.94)'
  const accent = isRoot ? '#4caf50' : node.accent
  const ringColor = node.state === 'errored' ? '#ff5f57' : node.state === 'offline' ? '#9aa3b2' : accent

  const dimmed = stale ? 0.4 : 1
  const greyed = node.state === 'offline' ? 0.55 : 1

  useFrame((state) => {
    if (!group.current) return
    // gentle breathing scale only while working
    if (node.state === 'working') {
      const t = state.clock.elapsedTime
      const s = 1 + Math.sin(t * 4) * 0.025
      group.current.scale.setScalar(s)
    } else {
      group.current.scale.setScalar(1)
    }
    // pulsing selection/working ring
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial
      if (node.state === 'working') {
        mat.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.3
      } else if (selected) {
        mat.opacity = 0.7
      } else {
        mat.opacity = 0.15
      }
    }
  })

  return (
    <group>
      {/* branch from root to this card (only for non-root agents) */}
      {!isRoot && (
        <Branch
          from={[0, ROOT_POS[1] - ROOT_H / 2 - 0.04, 0]}
          to={[pos[0], pos[1] + h / 2 + 0.04, pos[2]]}
          accent={node.accent}
          active={node.state === 'working'}
        />
      )}

      {/* card body */}
      <group ref={group} position={pos}>
        {/* soft colored accent ring (state) */}
        <mesh ref={ring} position={[0, 0, -0.02]}>
          <planeGeometry args={[w + 0.16, h + 0.16]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.15} />
        </mesh>
        {/* white glass card */}
        <RoundedBox args={[w, h, CARD_D]} radius={0.14} smoothness={8}>
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={Math.min(dimmed, greyed) * 0.96}
            roughness={0.35}
            metalness={0}
          />
        </RoundedBox>
      </group>

      {/* Apple-style label chip (screen-space → always crisp + never overlaps;
          on a phone the LIST view / pinch covers the compact case) */}
      <Html position={[pos[0], pos[1] + h / 2 + 0.3, pos[2]]} center zIndexRange={[10, 0]}>
        <div
          className={`mc-card-chip state-${node.state}${isRoot ? ' is-root' : ''}${selected ? ' is-selected' : ''}`}
          onClick={onClick}
          role="button"
          aria-label={`${node.name} · ${node.state}${node.currentTask ? ` · ${node.currentTask.title}` : ''}`}
        >
          <span className="mc-chip-icon" style={{ background: `${accent}22` }}>
            <AgentIcon id={node.id} color={accent} size={18} />
          </span>
          <span className="mc-chip-name">{node.name}</span>
          <span className="mc-chip-dot" style={{ background: node.state === 'errored' ? '#ff5f57' : node.state === 'offline' ? '#8a93a3' : accent }} />
        </div>
      </Html>
    </group>
  )
}

/* ── The full scene ───────────────────────────────────────────────────── */

function Scene({ nodes, selectedId, onSelect }: { nodes: AgentNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hermes = useMemo(() => nodes.find(n => n.id === 'hermes'), [nodes])
  const agents = useMemo(() => nodes.filter(n => n.id !== 'hermes'), [nodes])

  return (
    <>
      {/* soft, even lighting — Apple-clean, no hotspots */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 8, 6]} intensity={1.1} />
      <directionalLight position={[-4, 5, -4]} intensity={0.35} color="#eef2ff" />

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

      {/* soft grounded shadow for floating-depth */}
      <ContactShadows position={[0, -0.85, 0]} opacity={0.45} scale={22} blur={2.8} far={4} resolution={256} color="#000000" />

      <OrbitControls
        target={[0, 1.7, 0]}
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={13}
        autoRotate
        autoRotateSpeed={0.12}
        enableDamping
        dampingFactor={0.15}
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
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0.2, 4.4, 9.2], fov: 38 }}
        style={{ width: '100%', height: '100%', touchAction: 'none', background: 'transparent' }}
      >
        <Scene nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
      </Canvas>
    </div>
  )
}
