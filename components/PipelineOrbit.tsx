'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createPipelineProbeGeometry, PIPELINE_PROBE_ATLAS } from '@/components/threed/pipeline-probe'
import type { PipelineData } from '@/lib/types'
import { layoutPipelineOrbit, ORBIT_LIMIT, type OrbitLayout, type OrbitNode, type OrbitPlanet } from '@/lib/pipeline-orbit-layout'

const POLL_MS = 15_000
const VELOCITIES = [0.008, -0.012, 0.016, -0.02] as const
const ignoreRaycast = () => null

function usePipelineSnapshot(): PipelineData | null {
  const [snapshot, setSnapshot] = useState<PipelineData | null>(null)
  useEffect(() => {
    let alive = true
    let inFlight: AbortController | null = null
    const refresh = async () => {
      if (!alive || document.visibilityState !== 'visible' || !navigator.onLine || inFlight) return
      const controller = new AbortController()
      inFlight = controller
      try {
        const response = await fetch('/api/pipeline', {
          cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' },
        })
        if (!response.ok) return
        const next: PipelineData = await response.json()
        if (alive && !controller.signal.aborted && next && Array.isArray(next.leads) && next.counts) {
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
  #ifdef PIPELINE_PROBE
    attribute float probePart;
    attribute vec2 probeShape;
  #endif
  uniform float uTime;
  uniform float uMotion;
  varying vec3 vColor;
  varying float vEnergy;
  varying float vFacet;
  void main() {
    vColor = instanceColor;
    vEnergy = nodeEnergy.y;
    vFacet = 0.65 + 0.35 * abs(normal.z);
    float pulse = 1.0 + nodeEnergy.x * uMotion * 0.05 * sin(uTime * 1.4);
    vec3 localPosition = position;
    #ifdef PIPELINE_PROBE
      localPosition.x *= probePart == 1.0 ? probeShape.x : 1.0;
      localPosition.y *= probePart == 2.0 ? probeShape.y : 1.0;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(localPosition * pulse, 1.0);
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vEnergy;
  varying float vFacet;
  void main() {
    gl_FragColor = vec4(vColor * vEnergy * vFacet, 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
type RenderNode = (OrbitNode | OrbitPlanet) & { ring: number; colorValue: number }
type Slot = { node: RenderNode | null; next: RenderNode | null; retained: boolean }

function OrbitInstances({ nodes, capacity, planet, staticMotion, visible }: {
  nodes: RenderNode[]; capacity: number; planet: boolean; staticMotion: boolean; visible: boolean
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const { invalidate } = useThree()
  const offsets = useMemo(() => new Float64Array(4), [])
  const scales = useMemo(() => new Float64Array(capacity), [capacity])
  const slots = useMemo<Slot[]>(() => Array.from({ length: capacity }, () => ({ node: null, next: null, retained: false })), [capacity])
  const elapsed = useRef(0)
  const settled = useRef(false)
  const scratch = useMemo(() => ({ transform: new THREE.Object3D(), color: new THREE.Color() }), [])
  const geometry = useMemo(() => {
    const result = planet ? createPipelineProbeGeometry() : new THREE.IcosahedronGeometry(1, 0)
    if (planet) result.setAttribute('probeShape', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    result.setAttribute('nodeEnergy', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2))
    return result
  }, [capacity, planet])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } },
    defines: planet ? { PIPELINE_PROBE: 1 } : {},
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [planet])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  useLayoutEffect(() => {
    const instance = mesh.current
    if (!instance) return
    // Preserve live ids and fade departing nodes before reusing their bounded slots.
    for (const slot of slots) { slot.retained = false; slot.next = null }
    for (const node of nodes) {
      const slot = slots.find(slot => slot.node?.id === node.id)
      if (slot) { slot.node = node; slot.retained = true }
    }
    for (const node of nodes) {
      if (slots.some(slot => slot.retained && slot.node?.id === node.id)) continue
      const slot = slots.find(slot => !slot.node && !slot.next) ?? slots.find(slot => !slot.retained && !slot.next)
      if (slot) slot.next = node
    }
    instance.count = capacity
    instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const energy = geometry.getAttribute('nodeEnergy') as THREE.InstancedBufferAttribute
    const shape = geometry.getAttribute('probeShape') as THREE.InstancedBufferAttribute | undefined
    for (let i = 0; i < capacity; i++) {
      const node = slots[i].node
      const angle = node ? node.angle + offsets[node.ring] : 0
      scratch.transform.position.set(node ? Math.cos(angle) * node.radius : 0, node ? Math.sin(angle) * node.radius : 0, 0)
      scratch.transform.scale.setScalar(scales[i])
      scratch.transform.updateMatrix()
      instance.setMatrixAt(i, scratch.transform.matrix)
      instance.setColorAt(i, scratch.color.set(node?.color ?? 0))
      energy.setXY(i, planet ? 1 : 0, planet ? 1.8 : 1)
      if (shape) {
        const variant = PIPELINE_PROBE_ATLAS[node?.ring ?? 0]
        shape.setXY(i, variant[0], variant[1])
      }
    }
    energy.needsUpdate = true
    if (shape) shape.needsUpdate = true
    instance.instanceMatrix.needsUpdate = true
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true
    settled.current = false
    invalidate()
  }, [nodes, capacity, slots, scales, offsets, geometry, scratch, planet, invalidate])
  useEffect(() => { settled.current = false; invalidate() }, [invalidate, staticMotion, visible])

  useFrame((_frame, delta) => {
    const instance = mesh.current
    if (!instance || !visible || (staticMotion && settled.current)) return
    const step = Math.min(delta, 0.1)
    if (!staticMotion) {
      elapsed.current += step
      for (let ring = 0; ring < 4; ring++) offsets[ring] = (offsets[ring] + step * VELOCITIES[ring]) % (Math.PI * 2)
    }
    material.uniforms.uTime.value = elapsed.current
    material.uniforms.uMotion.value = staticMotion ? 0 : 1
    const ease = 1 - Math.exp(-step * 8)
    let converging = false
    let colorsChanged = false
    for (let i = 0; i < capacity; i++) {
      const slot = slots[i]
      if (!slot.retained && scales[i] <= 0.0001) {
        slot.node = slot.next
        slot.next = null
        slot.retained = slot.node !== null
        scales[i] = 0
        if (slot.node) {
          instance.setColorAt(i, scratch.color.setHex(slot.node.colorValue))
          colorsChanged = true
          const shape = geometry.getAttribute('probeShape') as THREE.InstancedBufferAttribute | undefined
          if (shape) {
            const variant = PIPELINE_PROBE_ATLAS[slot.node.ring]
            shape.setXY(i, variant[0], variant[1])
            shape.needsUpdate = true
          }
        }
      }
      const node = slot.node
      const target = slot.retained && node ? node.scale : 0
      const gap = target - scales[i]
      if (Math.abs(gap) > 0.0001) { scales[i] += gap * ease; converging = true }
      else scales[i] = target
      // One more demand frame retires a node that just reached zero.
      if (!slot.retained && (node || slot.next)) converging = true
      const angle = node ? node.angle + offsets[node.ring] : 0
      scratch.transform.position.set(node ? Math.cos(angle) * node.radius : 0, node ? Math.sin(angle) * node.radius : 0, 0)
      scratch.transform.scale.setScalar(scales[i])
      scratch.transform.updateMatrix()
      instance.setMatrixAt(i, scratch.transform.matrix)
    }
    instance.instanceMatrix.needsUpdate = true
    if (colorsChanged && instance.instanceColor) instance.instanceColor.needsUpdate = true
    settled.current = !converging
    if (staticMotion && converging) invalidate()
  })
  return <instancedMesh ref={mesh} args={[geometry, material, capacity]} raycast={ignoreRaycast} frustumCulled={false} />
}

// 12.4 includes the 11-unit diameter, planet pulse, tilt perspective, and margin.
// Apply the same effective fit to the kanban rings so 3.4 remains outside 3.0.
const FIT_DIAMETER = 12.4
export function PipelineKanbanFit({ children }: { children: ReactNode }) {
  const { viewport } = useThree()
  const orbitFit = Math.min(1, viewport.width / FIT_DIAMETER, viewport.height / FIT_DIAMETER)
  const kanbanFit = Math.min(1, viewport.width / 6.6, viewport.height / 6.6)
  return <group scale={orbitFit / kanbanFit}>{children}</group>
}
function OrbitScene({ layout, staticMotion, visible }: { layout: OrbitLayout; staticMotion: boolean; visible: boolean }) {
  const { viewport } = useThree()
  const nodes = useMemo(() => layout.orbits.flatMap((ring, i) => ring.nodes.map(node => ({ ...node, ring: i, colorValue: parseInt(node.color.slice(1), 16) }))), [layout])
  const planets = useMemo(() => layout.orbits.flatMap((ring, i) => ring.planet ? [{ ...ring.planet, ring: i, colorValue: parseInt(ring.planet.color.slice(1), 16) }] : []), [layout])
  const guides = useMemo(() => {
    const total = layout.orbits.reduce((sum, ring) => sum + ring.count, 0)
    return layout.orbits.map(ring => {
      const positions = new Float32Array(97 * 3)
      const colors = new Float32Array(97 * 3)
      const color = new THREE.Color(ring.color)
      // A brighter sweep encodes uncapped totals on each complete faint circle.
      const share = total ? ring.count / total : 0
      for (let i = 0; i <= 96; i++) {
        const angle = -Math.PI / 2 + Math.PI * 2 * i / 96
        positions[i * 3] = Math.cos(angle) * ring.radius
        positions[i * 3 + 1] = Math.sin(angle) * ring.radius
        const brightness = i / 96 <= share ? 1 : 0.25
        colors[i * 3] = color.r * brightness
        colors[i * 3 + 1] = color.g * brightness
        colors[i * 3 + 2] = color.b * brightness
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        vertexColors: true, opacity: ring.count ? 0.07 : 0.025, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      line.raycast = ignoreRaycast
      line.frustumCulled = false
      return line
    })
  }, [layout])
  useEffect(() => () => { for (const line of guides) { line.geometry.dispose(); line.material.dispose() } }, [guides])
  const fit = Math.min(1, viewport.width / FIT_DIAMETER, viewport.height / FIT_DIAMETER)
  return (
    <group rotation={[0.32, 0, 0]} scale={fit}>
      <OrbitInstances nodes={nodes} capacity={ORBIT_LIMIT} planet={false} staticMotion={staticMotion} visible={visible} />
      <OrbitInstances nodes={planets} capacity={4} planet staticMotion={staticMotion} visible={visible} />
      {guides.map((line, i) => <primitive key={layout.orbits[i].stage} object={line} raycast={ignoreRaycast} />)}
    </group>
  )
}

/** Scene-only: inherits CoreOrb's Canvas, visibility/settings gates, and WebGL latch. */
export default function PipelineOrbit({ staticMotion, visible }: { staticMotion: boolean; visible: boolean }) {
  const snapshot = usePipelineSnapshot()
  const layout = useMemo(() => snapshot ? layoutPipelineOrbit(snapshot.leads.map(lead => ({
    id: lead.id, stage: lead.stage, score: lead.score, businessName: lead.businessName,
    approval: lead.approval, approved: lead.approval?.status === 'approved' ? true : undefined,
    progress: lead.development?.progressPct,
    blocked: /(?:block|fail|error|stuck|stall|reject)/i.test(lead.development?.status ?? ''),
  })), snapshot.counts) : null, [snapshot])
  return layout ? <OrbitScene layout={layout} staticMotion={staticMotion} visible={visible} /> : null
}
