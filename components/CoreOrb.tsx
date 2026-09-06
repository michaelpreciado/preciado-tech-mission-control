'use client'

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Icon } from './icons'
import { useOrbActivity } from './LiveDataProvider'
import { useUiSettings } from './ui-settings'
import { ACCENT_DEFAULT, SEMANTIC } from '@/lib/tokens'
import type { HostMetrics, HostSample } from '@/lib/host-metrics'
import {
  deriveOrbState,
  isOrbBelowCoolThreshold,
  orbLoadIntensity,
  type OrbState,
} from '@/lib/orb-state'

const TELEMETRY_POLL_MS = 8_000
const PARTICLE_COUNT = 192

type Placement = 'desktop' | 'mobile'
type VisualState = { state: OrbState; intensity: number }

let cachedWebGLSupport: boolean | null = null
let webglFailedForSession = false

function detectWebGL(): boolean {
  if (cachedWebGLSupport != null) return cachedWebGLSupport
  try {
    const canvas = document.createElement('canvas')
    cachedWebGLSupport = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    cachedWebGLSupport = false
  }
  return cachedWebGLSupport
}

class WebGLErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    webglFailedForSession = true
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

function particleGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = golden * i
    const shell = 0.93 + ((i * 37) % 19) / 95
    positions[i * 3] = Math.cos(angle) * radius * shell
    positions[i * 3 + 1] = y * shell
    positions[i * 3 + 2] = Math.sin(angle) * radius * shell
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uFlicker;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
    float facet = 0.92 + 0.08 * sin((vNormal.x + vNormal.y * 1.7) * 18.0 + uTime * uFlicker);
    float energy = (0.24 + rim * 1.15) * uIntensity * facet;
    gl_FragColor = vec4(uColor * energy, min(0.98, 0.38 + rim * 0.58));
  }
`

function OrbScene({ visual, staticMotion }: { visual: VisualState; staticMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null)
  const particles = useRef<THREE.Points>(null)
  const particleMaterial = useRef<THREE.PointsMaterial>(null)
  const { invalidate } = useThree()
  const geometry = useMemo(particleGeometry, [])
  const blue = useMemo(() => {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--pt-neon').trim()
    return new THREE.Color(css || ACCENT_DEFAULT)
  }, [])
  const red = useMemo(() => new THREE.Color(SEMANTIC.error.hex), [])
  const currentColor = useRef(blue.clone())
  const uniforms = useMemo(() => ({
    uColor: { value: blue.clone() },
    uIntensity: { value: 0.72 },
    uTime: { value: 0 },
    uFlicker: { value: 0 },
  }), [blue])
  const coreMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [uniforms])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => coreMaterial.dispose(), [coreMaterial])
  useEffect(() => { invalidate() }, [invalidate, visual])

  useFrame((frame, delta) => {
    const state = visual.state
    const target = state === 'hot' ? red : blue
    const colorSeconds = state === 'hot' ? 1.5 : 3
    if (staticMotion) currentColor.current.copy(target)
    else currentColor.current.lerp(target, Math.min(1, delta / colorSeconds))

    const speed = state === 'idle' ? 0.05 : state === 'active' ? 0.4 : state === 'surge' ? 0.75 : 0.9
    const pulseHz = state === 'idle' ? 1 / 6 : state === 'active' ? 0.55 : state === 'hot' ? 1 : 0.8 + visual.intensity * 0.45
    const pulse = 0.5 + Math.sin(frame.clock.elapsedTime * Math.PI * 2 * pulseHz) * 0.5
    const base = state === 'idle' ? 0.52 : state === 'active' ? 0.74 : 0.82
    const strength = staticMotion ? base : base + pulse * (state === 'hot' ? 0.28 : 0.16) * Math.max(0.5, visual.intensity)

    coreMaterial.uniforms.uColor.value.copy(currentColor.current)
    coreMaterial.uniforms.uIntensity.value = strength
    coreMaterial.uniforms.uTime.value = staticMotion ? 0 : frame.clock.elapsedTime
    coreMaterial.uniforms.uFlicker.value = state === 'surge' ? 7 : 0
    if (ring.current) {
      ring.current.rotation.z += staticMotion ? 0 : delta * speed * -0.72
      ;(ring.current.material as THREE.MeshBasicMaterial).color.copy(currentColor.current)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.42 + strength * 0.3
    }
    if (particles.current) {
      particles.current.rotation.y += staticMotion ? 0 : delta * speed
      particles.current.rotation.x += staticMotion ? 0 : delta * speed * 0.18
    }
    if (particleMaterial.current) {
      particleMaterial.current.color.copy(currentColor.current)
      particleMaterial.current.opacity = state === 'idle' ? 0.42 : 0.72
    }
  })

  return (
    <>
      <mesh scale={0.82}>
        <sphereGeometry args={[1, 16, 12]} />
        <primitive object={coreMaterial} attach="material" />
      </mesh>
      <mesh ref={ring} rotation={[1.18, 0.28, 0]} scale={1.1}>
        <torusGeometry args={[0.96, 0.025, 5, 40]} />
        <meshBasicMaterial color={blue} transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={particles} geometry={geometry} scale={1.23}>
        <pointsMaterial ref={particleMaterial} color={blue} size={0.035} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  )
}

function OrbRuntime({ placement }: { placement: Placement }) {
  const { motion } = useUiSettings()
  const activity = useOrbActivity()
  const activityRef = useRef(activity)
  const visible = usePageVisible()
  const osReduced = useMedia('(prefers-reduced-motion: reduce)')
  const staticMotion = osReduced || motion === 'reduced' || motion === 'off'
  const sampleRef = useRef<HostSample | null>(null)
  const previousState = useRef<OrbState>('idle')
  const coolBelowSince = useRef<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const [visual, setVisual] = useState<VisualState>({ state: 'idle', intensity: 0 })
  const [webglFailed, setWebglFailed] = useState(webglFailedForSession)
  const webglAvailable = useMemo(() => detectWebGL(), [])

  useEffect(() => { activityRef.current = activity }, [activity])

  const evaluate = useCallback(() => {
    const now = Date.now()
    const sample = sampleRef.current
    if (previousState.current === 'hot' && isOrbBelowCoolThreshold(sample)) {
      coolBelowSince.current ??= now
    } else {
      coolBelowSince.current = null
    }
    const state = deriveOrbState(sample, {
      lastEventAt: activityRef.current.lastEventAt,
      runningTaskCount: activityRef.current.runningTaskCount,
      now,
      previousState: previousState.current,
      coolBelowSince: coolBelowSince.current,
    })
    previousState.current = state
    const load = orbLoadIntensity(sample)
    const intensity = state === 'surge' ? 0.5 + Math.max(0, load - 0.7) / 0.3 * 0.5 : load
    setVisual(prev => prev.state === state && Math.abs(prev.intensity - intensity) < 0.01
      ? prev
      : { state, intensity: Math.min(1, intensity) })
  }, [])

  useEffect(() => {
    if (visible) evaluate()
  }, [evaluate, activity.now, visible])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      abort.current?.abort()
      const ctl = new AbortController()
      abort.current = ctl
      try {
        const response = await fetch('/api/telemetry', { cache: 'no-store', signal: ctl.signal })
        if (!response.ok) return
        const metrics = await response.json() as HostMetrics
        if (!alive) return
        sampleRef.current = metrics.current
        evaluate()
      } catch (error) {
        if ((error as Error).name !== 'AbortError') sampleRef.current = null
      }
    }
    let pollTimer: number | null = null
    let stateTimer: number | null = null
    const stopTimers = () => {
      if (pollTimer != null) window.clearInterval(pollTimer)
      if (stateTimer != null) window.clearInterval(stateTimer)
      pollTimer = null
      stateTimer = null
      abort.current?.abort()
    }
    const startTimers = () => {
      if (pollTimer != null || document.visibilityState !== 'visible') return
      pollTimer = window.setInterval(() => { void poll() }, TELEMETRY_POLL_MS)
      stateTimer = window.setInterval(evaluate, 1_000)
    }
    if (document.visibilityState === 'visible') {
      startTimers()
      void poll()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        startTimers()
        void poll()
      } else {
        stopTimers()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      stopTimers()
      document.removeEventListener('visibilitychange', onVisible)
      abort.current?.abort()
    }
  }, [evaluate])

  const markWebGLFailed = useCallback(() => {
    webglFailedForSession = true
    setWebglFailed(true)
  }, [])

  return (
    <div className={`mc-core-orb mc-core-orb-${placement}`} data-orb-state={visual.state} aria-hidden="true">
      {webglAvailable && !webglFailed && (
        <WebGLErrorBoundary onError={markWebGLFailed}>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 3.35], fov: 45 }}
            frameloop={staticMotion || !visible ? 'demand' : 'always'}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <OrbScene visual={visual} staticMotion={staticMotion} />
          </Canvas>
        </WebGLErrorBoundary>
      )}
      <span className="mc-core-orb-mark"><Icon name="brand" size={placement === 'desktop' ? 15 : 11} /></span>
    </div>
  )
}

export default function CoreOrb({ placement }: { placement: Placement }) {
  const { elements3d } = useUiSettings()
  const [mounted, setMounted] = useState(false)
  const mobile = useMedia('(max-width: 820px)')
  useEffect(() => { setMounted(true) }, [])
  const isActivePlacement = placement === 'mobile' ? mobile : !mobile
  if (!mounted || !elements3d.coreOrb || !isActivePlacement) return null
  return <OrbRuntime placement={placement} />
}
