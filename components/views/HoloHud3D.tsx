'use client'

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createAgentChassis } from '@/components/threed/agent-chassis'
import { createDispatchHub } from '@/components/threed/dispatch-hub'
import { useUiSettings } from '../ui-settings'
import type { AgentNode } from '@/lib/telemetry-types'
import { HOLO_NODE_CAP } from '@/components/threed/holo-config'

type PositionedNode = { node: AgentNode; position: THREE.Vector3; hub: boolean }

function layout(nodes: AgentNode[]): PositionedNode[] {
  const root = nodes.find(n => n.id === 'hermes')
  const hub = nodes.find(n => n.id === 'jarvis') ?? nodes.find(n => n !== root)
  const agents = nodes.filter(n => n !== root && n !== hub)
  return [
    ...(root ? [{ node: root, position: new THREE.Vector3(-1.5, 3, 0), hub: false }] : []),
    ...(hub ? [{ node: hub, position: new THREE.Vector3(1.5, 3, 0), hub: true }] : []),
    ...agents.map((node, i) => ({ node, position: new THREE.Vector3((i % 6 - 2.5) * 2, 1.2 - Math.floor(i / 6) * 1.7, 0), hub: false })),
  ]
}

/** All branches/task links in one draw call. Replacement geometry is owned by Scene. */
function branchGeometry(items: PositionedNode[]) {
  const hub = items.find(item => item.hub)
  const parts: THREE.BufferGeometry[] = []
  for (const item of items) {
    if (hub && item !== hub) {
      const from = hub.position
      const to = item.position
      const curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x, from.y, -0.5), new THREE.Vector3(to.x, to.y, -0.5), to])
      parts.push(new THREE.TubeGeometry(curve, 12, 0.012, 4, false))
    }
    if (item.node.currentTask) {
      const curve = new THREE.LineCurve3(item.position, item.position.clone().add(new THREE.Vector3(0, -0.62, 0)))
      parts.push(new THREE.TubeGeometry(curve, 1, 0.012, 4, false))
    }
  }
  const geometry = parts.length ? mergeGeometries(parts)! : new THREE.BufferGeometry()
  parts.forEach(part => part.dispose())
  return geometry
}

function stateColor(node: AgentNode, selected: boolean) {
  return selected ? '#ffffff' : node.state === 'errored' ? '#ff5f57' : node.state === 'offline' ? '#657183' : node.accent
}

function Scene({ nodes, selectedId, staticMotion }: { nodes: AgentNode[]; selectedId: string | null; staticMotion: boolean }) {
  const viewport = useThree(state => state.viewport)
  const fit = Math.min(1, viewport.width / 13, viewport.height / 9)
  const items = useMemo(() => layout(nodes), [nodes])
  const resources = useMemo(() => ({
    chassis: createAgentChassis(), hub: createDispatchHub(), task: new THREE.OctahedronGeometry(0.09, 0),
    body: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.45 }),
    wire: new THREE.MeshBasicMaterial({ color: '#778ca6', transparent: true, opacity: 0.45 }),
  }), [])
  const branches = useMemo(() => branchGeometry(items), [items])
  useEffect(() => () => branches.dispose(), [branches])
  useEffect(() => () => { Object.values(resources).forEach(resource => resource.dispose()) }, [resources])
  const agents = useRef<THREE.InstancedMesh>(null)
  const hubs = useRef<THREE.InstancedMesh>(null)
  const tasks = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    if (!agents.current || !hubs.current || !tasks.current) return
    let a = 0, h = 0, t = 0
    for (const item of items) {
      const mesh = item.hub ? hubs.current : agents.current
      const index = item.hub ? h++ : a++
      const pulse = !staticMotion && item.node.state === 'working' ? 1 + Math.sin(clock.elapsedTime * 2) * 0.025 : 1
      dummy.position.copy(item.position)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1.35 * pulse, 0.7 * pulse, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      color.set(stateColor(item.node, item.node.id === selectedId))
      mesh.setColorAt(index, color)
      if (item.node.currentTask) {
        dummy.position.y -= 0.62
        dummy.scale.setScalar(1)
        dummy.rotation.y = staticMotion ? 0 : clock.elapsedTime * 0.4
        dummy.updateMatrix()
        tasks.current.setMatrixAt(t, dummy.matrix)
        tasks.current.setColorAt(t++, color)
      }
    }
    for (const [mesh, count] of [[agents.current, a], [hubs.current, h], [tasks.current, t]] as const) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[3, 8, 6]} intensity={2} />
    <group scale={fit}>
    <group dispose={null}>
      <mesh geometry={branches} material={resources.wire} />
      <instancedMesh ref={agents} args={[resources.chassis, resources.body, HOLO_NODE_CAP]} frustumCulled={false} />
      <instancedMesh ref={hubs} args={[resources.hub, resources.body, 1]} frustumCulled={false} />
      <instancedMesh ref={tasks} args={[resources.task, resources.body, HOLO_NODE_CAP]} frustumCulled={false} />
    </group>
    {/* One plain, noninteractive projection per capped node; task details live in the roster. */}
    {items.map(({ node, position }) => <Html key={node.id} position={[position.x, position.y + 0.55, position.z]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
      <span style={{ display: 'block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--pt-text)', background: 'var(--pt-surface-2)', padding: '2px 5px', borderRadius: 4 }}>{node.name}</span>
    </Html>)}
    </group>
    <OrbitControls target={[0, 0, 0]} enablePan={false} enableZoom={false} enableDamping={!staticMotion} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI * 2 / 3} minAzimuthAngle={-0.3} maxAzimuthAngle={0.3} />
  </>
}

class HoloBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p>3D unavailable. Use the roster below.</p> : this.props.children }
}

export default function HoloHud3D({ nodes, selectedId }: { nodes: AgentNode[]; selectedId: string | null }) {
  const { motion, elements3d } = useUiSettings()
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduced(media.matches)
    const updateVisibility = () => setVisible(document.visibilityState === 'visible')
    updateMotion(); updateVisibility()
    media.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    if (host.current) observer.observe(host.current)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])
  const bounded = useMemo(() => {
    const unique = Array.from(new Map(nodes.map(node => [node.id, node])).values())
    return [...unique.filter(n => n.id === 'hermes' || n.id === 'jarvis'), ...unique.filter(n => n.id !== 'hermes' && n.id !== 'jarvis')].slice(0, HOLO_NODE_CAP)
  }, [nodes])
  const staticMotion = reduced || motion === 'reduced' || motion === 'off'
  return <div ref={host} className="mc-hud3d" aria-hidden="true">
    {visible && inView && elements3d.teamGraph && <HoloBoundary>
      <Canvas dpr={[1, 1.5]} frameloop={staticMotion ? 'demand' : 'always'} camera={{ position: [0, 0, 16], fov: 40 }} gl={{ alpha: true, antialias: true }} fallback={<p>3D unavailable. Use the roster below.</p>}>
        <Scene nodes={bounded} selectedId={selectedId} staticMotion={staticMotion} />
      </Canvas>
    </HoloBoundary>}
  </div>
}
