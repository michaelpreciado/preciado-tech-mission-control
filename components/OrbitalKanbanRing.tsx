'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { HermesTask } from '@/lib/types'
import {
  kanbanRingArcs, layoutKanbanRing, RING_LIMIT, RING_RADII, ringLane,
  type RingLayout,
} from '@/lib/kanban-ring-layout'

type KanbanSnapshot = {
  available: boolean
  counts: Record<string, number>
  tasks: HermesTask[]
}
const POLL_MS = 15_000
const LANE_INDEX = { doing: 0, todo: 1, done: 2 } as const
const VELOCITIES = [0.018, -0.028, 0.038] as const
const ignoreRaycast = () => null

function useKanbanSnapshot(): KanbanSnapshot | null {
  const [snapshot, setSnapshot] = useState<KanbanSnapshot | null>(null)
  useEffect(() => {
    let alive = true
    let inFlight: AbortController | null = null
    const refresh = async () => {
      if (!alive || document.visibilityState !== 'visible' || !navigator.onLine || inFlight) return
      const controller = new AbortController()
      inFlight = controller
      try {
        const response = await fetch('/api/kanban?limit=200', {
          cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const next: KanbanSnapshot = await response.json()
        if (alive && !controller.signal.aborted && next?.available && Array.isArray(next.tasks) && next.counts) {
          setSnapshot(next)
        }
      } catch {
        // Keep the last good snapshot. An unavailable first poll renders nothing.
      } finally {
        if (inFlight === controller) inFlight = null
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
      else {
        inFlight?.abort()
        inFlight = null
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      alive = false
      window.clearInterval(timer)
      inFlight?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [])
  return snapshot
}

const vertexShader = /* glsl */ `
  attribute vec2 nodeEnergy;
  varying vec3 vColor;
  varying vec2 vEnergy;
  varying float vFacet;
  void main() {
    vColor = instanceColor;
    vEnergy = nodeEnergy;
    vFacet = 0.65 + 0.35 * abs(normal.z);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  varying vec3 vColor;
  varying vec2 vEnergy;
  varying float vFacet;
  void main() {
    // Self-emissive per-instance energy: failed nodes pulse without another pass.
    float pulse = 1.0 + vEnergy.x * uMotion * (0.35 + 0.35 * sin(uTime * 3.0));
    gl_FragColor = vec4(vColor * vEnergy.y * vFacet * pulse, 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function RingInstances({ layout, staticMotion, visible }: {
  layout: RingLayout
  staticMotion: boolean
  visible: boolean
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const { invalidate, viewport } = useThree()
  const offsets = useMemo(() => new Float64Array(3), [])
  const scales = useMemo(() => new Float64Array(RING_LIMIT), [])
  const previousIds = useRef<string[]>([])
  const elapsed = useRef(0)
  const scratch = useMemo(() => ({ transform: new THREE.Object3D(), color: new THREE.Color() }), [])
  const geometry = useMemo(() => {
    const result = new THREE.IcosahedronGeometry(1, 0)
    result.setAttribute('nodeEnergy', new THREE.InstancedBufferAttribute(new Float32Array(RING_LIMIT * 2), 2))
    return result
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } },
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }), [])
  const arcs = useMemo(() => layout.arcs.map(arc => {
    const segments = 96
    const positions = new Float32Array((segments + 1) * 3)
    for (let i = 0; i <= segments; i++) {
      const angle = arc.fromAngle + (arc.toAngle - arc.fromAngle) * i / segments
      positions[i * 3] = Math.cos(angle) * RING_RADII[arc.stage]
      positions[i * 3 + 1] = Math.sin(angle) * RING_RADII[arc.stage]
    }
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
      color: arc.color, opacity: arc.stage === 'done' ? 0.07 : 0.1,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    line.raycast = ignoreRaycast
    return line
  }), [layout.arcs])

  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useEffect(() => () => {
    for (const arc of arcs) { arc.geometry.dispose(); arc.material.dispose() }
  }, [arcs])

  useLayoutEffect(() => {
    const instance = mesh.current
    if (!instance) return
    // Reconcile by id only when data changes; polling preserves scale convergence.
    const oldScales = new Map(previousIds.current.map((id, i) => [id, scales[i]]))
    const energy = geometry.getAttribute('nodeEnergy') as THREE.InstancedBufferAttribute
    instance.count = layout.nodes.length
    instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i]
      scales[i] = oldScales.get(node.id) ?? 0
      const angle = node.angle + offsets[LANE_INDEX[ringLane(node.stage)]]
      scratch.transform.position.set(Math.cos(angle) * node.radius, Math.sin(angle) * node.radius, 0)
      scratch.transform.scale.setScalar(scales[i])
      scratch.transform.updateMatrix()
      instance.setMatrixAt(i, scratch.transform.matrix)
      instance.setColorAt(i, scratch.color.set(node.color))
      energy.setXY(i, node.failed ? 1 : 0, ringLane(node.stage) === 'done' && !node.failed ? 0.35 : 1)
    }
    previousIds.current = layout.nodes.map(node => node.id)
    energy.needsUpdate = true
    instance.instanceMatrix.needsUpdate = true
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true
    invalidate()
  }, [geometry, invalidate, layout, offsets, scales, scratch])

  useEffect(() => { invalidate() }, [invalidate, staticMotion, visible])
  useFrame((_frame, delta) => {
    const instance = mesh.current
    if (!instance || !visible) return
    // Fixed arrays and one scratch transform: no objects/colors/matrices allocated here.
    const step = Math.min(delta, 0.1)
    if (!staticMotion) {
      elapsed.current += step
      for (let lane = 0; lane < 3; lane++) offsets[lane] = (offsets[lane] + step * VELOCITIES[lane]) % (Math.PI * 2)
    }
    material.uniforms.uTime.value = elapsed.current
    material.uniforms.uMotion.value = staticMotion ? 0 : 1
    const ease = 1 - Math.exp(-step * 8)
    let converging = false
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i]
      const gap = node.scale - scales[i]
      if (Math.abs(gap) > 0.0001) {
        scales[i] += gap * ease
        converging = true
      } else scales[i] = node.scale
      const angle = node.angle + offsets[LANE_INDEX[ringLane(node.stage)]]
      scratch.transform.position.set(Math.cos(angle) * node.radius, Math.sin(angle) * node.radius, 0)
      scratch.transform.scale.setScalar(scales[i])
      scratch.transform.updateMatrix()
      instance.setMatrixAt(i, scratch.transform.matrix)
    }
    for (let i = 0; i < arcs.length; i++) arcs[i].rotation.z = offsets[LANE_INDEX[layout.arcs[i].stage]]
    instance.instanceMatrix.needsUpdate = true
    // CoreOrb uses demand rendering for reduced motion; stop once sizes settle.
    if (staticMotion && converging) invalidate()
  })

  const fit = Math.min(1, viewport.width / 6.6, viewport.height / 6.6)
  return (
    <group rotation={[0.32, 0, 0]} scale={fit}>
      <instancedMesh ref={mesh} args={[geometry, material, RING_LIMIT]} raycast={ignoreRaycast} frustumCulled={false} />
      {arcs.map((arc, i) => <primitive key={layout.arcs[i].stage} object={arc} />)}
    </group>
  )
}

/** Scene-only: CoreOrb owns the settings/viewport gate, Canvas, and WebGL failure latch. */
export default function OrbitalKanbanRing({ staticMotion, visible }: { staticMotion: boolean; visible: boolean }) {
  const snapshot = useKanbanSnapshot()
  const layout = useMemo(() => {
    if (!snapshot) return null
    const result = layoutKanbanRing(snapshot.tasks.map(task => ({
      id: task.id, status: task.status, priority: task.priority, failures: task.consecutiveFailures,
    })))
    // Snapshot counts are not restricted by either the API limit or the instance cap.
    result.arcs = kanbanRingArcs(snapshot.counts)
    result.maxRadius = result.arcs.reduce((radius, arc) => Math.max(radius, RING_RADII[arc.stage]), result.maxRadius)
    return result
  }, [snapshot])
  return layout ? <RingInstances layout={layout} staticMotion={staticMotion} visible={visible} /> : null
}
