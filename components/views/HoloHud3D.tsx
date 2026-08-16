'use client'

/**
 * HoloHud3D — command-center 3D dispatch tree (WebGL via react-three-fiber).
 *
 * v2 (command hierarchy):
 *   HERMES (root) → JARVIS (hub / operator) → agent clusters
 *     OPS  · friday, edith          (the desktop + sentinel)
 *     CREW · openclaw, echo, sage, forge  (shared capabilities)
 *
 * Why v2: the v1 tree rendered an EMPTY stage the moment no agent was
 * working (MESH STANDBY). That hid the crew right when it went quiet —
 * which is most of the day. v2 keeps the whole roster ALWAYS visible and
 * informative:
 *  - idle/waiting agents stay bright and legible (name + role + host), not
 *    faded to invisibility.
 *  - offline is dimmed/desaturated but still present (asleep ≠ missing).
 *  - errored stays the loudest thing (red ring + hard flash).
 *  - working pulls full color + animated energy flow + breathing scale.
 *
 * Apple-UX applied: restrained pastel cards, no neon, crisp SVG icons that
 * always face the camera, and calm motion — the only "active" animation is a
 * genuinely working agent (pulsing ring + traveling branch energy).
 * Touch: drag to orbit, pinch to zoom (drei OrbitControls).
 *
 * WebGL is client-only; loaded ssr:false from the Team page.
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Line, Html, OrbitControls, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import type { AgentNode, TelemetryTask } from '@/lib/telemetry-types'
import { HEARTBEAT_STALE_MS } from '@/lib/telemetry'

/* ── Layout constants (world units) ───────────────────────────────────── */

const ROOT_POS: [number, number, number] = [0, 3.0, 0]
const HUB_POS: [number, number, number] = [0, 1.9, 0]
const AGENT_Y = 0.45
const CARD_W = 1.7
const CARD_H = 0.66
const CARD_D = 0.05
const ROOT_W = 2.0
const ROOT_H = 0.78

/** Command-cluster layout: which cluster each agent belongs to + x offset. */
type Cluster = 'OPS' | 'CREW'
const CLUSTER_OFFSET: Record<Cluster, number> = { OPS: -2.9, CREW: 2.9 }
const AGENT_CLUSTER: Record<string, { cluster: Cluster; slot: number }> = {
  friday:  { cluster: 'OPS', slot: 0 },
  edith:   { cluster: 'OPS', slot: 1 },
  openclaw:{ cluster: 'CREW', slot: 0 },
  echo:    { cluster: 'CREW', slot: 1 },
  sage:    { cluster: 'CREW', slot: 2 },
  forge:   { cluster: 'CREW', slot: 3 },
}
const CLUSTER_SPACING = 1.95

function agentPos(id: string): [number, number, number] {
  const def = AGENT_CLUSTER[id]
  if (!def) return [0, AGENT_Y, 0]
  const baseX = CLUSTER_OFFSET[def.cluster]
  const x = baseX + (def.slot - 0.5) * CLUSTER_SPACING
  return [x, AGENT_Y, 0]
}

function clusterCenter(cluster: Cluster): [number, number, number] {
  return [CLUSTER_OFFSET[cluster], 0.0, 0]
}

function isStaleNode(n: AgentNode): boolean {
  if (n.state === 'offline' || n.state === 'working') return false
  if (n.lastSeenAt === null) return false
  const ts = n.lastSeenAt > 1e12 ? n.lastSeenAt : n.lastSeenAt * 1000
  return Date.now() - ts > HEARTBEAT_STALE_MS
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
  sage:     ({ color }) => <><circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth="2" fill="none" /><path d="M15.5 15.5L21 21" stroke={color} strokeWidth="2" strokeLinecap="round" /><circle cx="8" cy="8.2" r="1" fill={color} /></>,
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
    if (!active) { mat.opacity = 0.45; return }
    const t = state.clock.elapsedTime
    mat.emissiveIntensity = 0.6 + (Math.sin(t * 5) * 0.5 + 0.5) * 1.1
    mat.opacity = 0.95
  })

  return (
    <mesh ref={base} geometry={geo}>
      <meshStandardMaterial
        color={active ? accent : '#aab4c4'}
        emissive={active ? accent : '#000000'}
        emissiveIntensity={0}
        transparent
        opacity={0.6}
        roughness={0.5}
        metalness={0.1}
      />
    </mesh>
  )
}

/* ── Task leaf (agent's currentTask — a graph leaf hanging off its owner) ─
 * Deliberately lighter-weight than Branch: a thin drei <Line> instead of a
 * TubeGeometry mesh (leaves are numerous-ish and low-priority next to the
 * org-tree's main branches), and a small octahedron instead of the agents'
 * RoundedBox card — shape + dimmer glow make "this is a task, not an agent"
 * readable at a glance without just shrinking the same visual language.
 * Unmounts entirely (not just fades) whenever the owning node has no
 * currentTask — callers gate this behind `node.currentTask &&`.
 */

function TaskLink({ from, to, accent, active }: { from: [number, number, number]; to: [number, number, number]; accent: string; active: boolean }) {
  const points = useMemo(
    () => [new THREE.Vector3(...from), new THREE.Vector3(...to)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from[0], from[1], from[2], to[0], to[1], to[2]],
  )
  const ref = useRef<Line2>(null)
  useFrame((state) => {
    const mat = ref.current?.material as THREE.LineBasicMaterial | undefined
    if (!mat) return
    mat.opacity = active ? 0.3 + (Math.sin(state.clock.elapsedTime * 5) * 0.5 + 0.5) * 0.35 : 0.22
  })
  return <Line ref={ref} points={points} color={accent} transparent opacity={0.22} lineWidth={1} />
}

function TaskLeaf({ task, pos, accent, active }: { task: TelemetryTask; pos: [number, number, number]; accent: string; active: boolean }) {
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (!mesh.current) return
    mesh.current.rotation.y = state.clock.elapsedTime * 0.6
    mesh.current.rotation.x = state.clock.elapsedTime * 0.35
    mesh.current.scale.setScalar(active ? 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1 : 1)
  })
  return (
    <group position={pos}>
      <mesh ref={mesh}>
        <octahedronGeometry args={[0.085, 0]} />
        <meshStandardMaterial
          color={accent}
          transparent
          opacity={active ? 0.8 : 0.42}
          emissive={accent}
          emissiveIntensity={active ? 0.85 : 0.18}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>
      <Html position={[0, -0.19, 0]} center zIndexRange={[8, 0]}>
        <div className={`mc-task-chip${active ? ' is-active' : ''}`} title={task.title ?? task.id}>
          <span className="mc-task-dot" style={{ background: accent }} />
          <span className="mc-task-txt">{task.title || task.id}</span>
        </div>
      </Html>
    </group>
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

  const accent = isRoot ? '#4caf50' : node.accent
  const ringColor = node.state === 'errored' ? '#ff5f57' : node.state === 'offline' ? '#9aa3b2' : accent

  // v2: idle agents stay BRIGHT and present. Only offline/stale dim — but
  // never to invisibility, so the roster always reads as a full crew.
  const dimmed = stale ? 0.55 : 1
  const greyed = node.state === 'offline' ? 0.72 : 1
  const cardOpacity = Math.min(dimmed, greyed) * 0.96

  useFrame((state) => {
    if (!group.current) return
    if (node.state === 'working') {
      const t = state.clock.elapsedTime
      const s = 1 + Math.sin(t * 4) * 0.03
      group.current.scale.setScalar(s)
    } else {
      group.current.scale.setScalar(1)
    }
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial
      if (node.state === 'working') {
        mat.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 5) * 0.3
      } else if (selected) {
        mat.opacity = 0.7
      } else if (node.state === 'errored') {
        mat.opacity = 0.45 + Math.sin(state.clock.elapsedTime * 8) * 0.3
      } else {
        mat.opacity = 0.14
      }
    }
  })

  return (
    <group>
      {/* branch from HUB to this card — unless it IS the hub */}
      {!isRoot && node.id !== 'jarvis' && (
        <Branch
          from={[HUB_POS[0], HUB_POS[1] - ROOT_H / 2 - 0.04, 0]}
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
          <meshBasicMaterial color={ringColor} transparent opacity={0.14} />
        </mesh>
        <RoundedBox args={[w, h, CARD_D]} radius={0.14} smoothness={8}>
          <meshStandardMaterial
            color="#ffffff"
            transparent
            opacity={cardOpacity}
            roughness={0.35}
            metalness={0}
          />
        </RoundedBox>
      </group>

      {/* task leaf — the agent's currentTask, hanging off the card below-front.
          Fully unmounted (not faded) the instant the agent has no currentTask. */}
      {node.currentTask && (
        <>
          <TaskLink
            from={[pos[0], pos[1] - h / 2 - 0.03, pos[2]]}
            to={[pos[0], pos[1] - h / 2 - 0.36, pos[2] + 0.48]}
            accent={accent}
            active={node.state === 'working'}
          />
          <TaskLeaf
            task={node.currentTask}
            pos={[pos[0], pos[1] - h / 2 - 0.36, pos[2] + 0.48]}
            accent={accent}
            active={node.state === 'working'}
          />
        </>
      )}

      {/* label chip — always crisp, screen-space, carries role + host */}
      <Html position={[pos[0], pos[1] + h / 2 + 0.34, pos[2]]} center zIndexRange={[10, 0]}>
        <div
          className={`mc-card-chip state-${node.state}${isRoot ? ' is-root' : ''}${selected ? ' is-selected' : ''}`}
          onClick={onClick}
          role="button"
          aria-label={`${node.name} · ${node.state}${node.currentTask ? ` · ${node.currentTask.title}` : ''}`}
        >
          <span className="mc-chip-icon" style={{ background: `${accent}22` }}>
            <AgentIcon id={node.id} color={accent} size={18} />
          </span>
          <span className="mc-chip-txt">
            <span className="mc-chip-name">{node.name}</span>
            <span className="mc-chip-sub">{node.host ?? '—'}</span>
          </span>
          <span className="mc-chip-dot" style={{ background: node.state === 'errored' ? '#ff5f57' : node.state === 'offline' ? '#8a93a3' : accent }} />
        </div>
      </Html>
    </group>
  )
}

/* ── Cluster label (OPS / CREW) ───────────────────────────────────────── */

function ClusterTag({ label, pos }: { label: string; pos: [number, number, number] }) {
  return (
    <Html position={pos} center zIndexRange={[5, 0]}>
      <div className="mc-cluster-tag">{label}</div>
    </Html>
  )
}

/* ── Hub (Jarvis) card ────────────────────────────────────────────────── */

function HubCard({ node, selected, onClick }: { node: AgentNode; selected: boolean; onClick: () => void }) {
  return (
    <group>
      {/* HERMES → JARVIS */}
      <Branch
        from={[ROOT_POS[0], ROOT_POS[1] - ROOT_H / 2 - 0.04, 0]}
        to={[HUB_POS[0], HUB_POS[1] + ROOT_H / 2 + 0.04, 0]}
        accent={node.accent}
        active={node.state === 'working'}
      />
      <Card node={node} pos={HUB_POS} w={ROOT_W} h={ROOT_H} selected={selected} isRoot={false} onClick={onClick} />
    </group>
  )
}

/* ── The full scene ───────────────────────────────────────────────────── */

function Scene({ nodes, selectedId, onSelect }: { nodes: AgentNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hermes = useMemo(() => nodes.find(n => n.id === 'hermes'), [nodes])
  const jarvis = useMemo(() => nodes.find(n => n.id === 'jarvis') ?? nodes.find(n => n.id !== 'hermes'), [nodes])
  const hubId = jarvis?.id
  const agents = useMemo(() => nodes.filter(n => n.id !== 'hermes' && n.id !== hubId), [nodes, hubId])
  const hasOps = useMemo(() => agents.some(n => AGENT_CLUSTER[n.id]?.cluster === 'OPS'), [agents])
  const hasCrew = useMemo(() => agents.some(n => AGENT_CLUSTER[n.id]?.cluster === 'CREW'), [agents])

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 8, 6]} intensity={1.1} />
      <directionalLight position={[-4, 5, -4]} intensity={0.35} color="#eef2ff" />

      {/* HERMES root */}
      {hermes && (
        <Card node={hermes} pos={[...ROOT_POS]} w={ROOT_W} h={ROOT_H} selected={selectedId === hermes.id} isRoot onClick={() => onSelect(hermes.id)} />
      )}

      {/* JARVIS hub */}
      {jarvis && (
        <HubCard node={jarvis} selected={selectedId === jarvis.id} onClick={() => onSelect(jarvis.id)} />
      )}

      {/* cluster separators */}
      {hasOps && <ClusterTag label="OPS" pos={[CLUSTER_OFFSET.OPS, 1.15, 0]} />}
      {hasCrew && <ClusterTag label="CREW" pos={[CLUSTER_OFFSET.CREW, 1.15, 0]} />}

      {/* agents */}
      {agents.map((n) => {
        const pos = agentPos(n.id)
        return (
          <Card key={n.id} node={n} pos={pos} w={CARD_W} h={CARD_H} selected={selectedId === n.id} isRoot={false} onClick={() => onSelect(n.id)} />
        )
      })}

      <ContactShadows position={[0, -0.85, 0]} opacity={0.45} scale={26} blur={2.8} far={4} resolution={256} color="#000000" />

      <OrbitControls
        target={[0, 1.4, 0]}
        enablePan={false}
        enableZoom
        minDistance={5}
        maxDistance={14}
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
        camera={{ position: [0.2, 4.6, 10.5], fov: 38 }}
        style={{ width: '100%', height: '100%', touchAction: 'none', background: 'transparent' }}
      >
        <Scene nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
      </Canvas>
    </div>
  )
}
