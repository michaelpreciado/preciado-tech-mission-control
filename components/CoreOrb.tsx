'use client'

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Icon } from './icons'
import { useOrbActivity } from './LiveDataProvider'
import { useUiSettings } from './ui-settings'
import OrbitalKanbanRing from './OrbitalKanbanRing'
import PipelineOrbit, { PipelineKanbanFit } from './PipelineOrbit'
import { NeuralOrbCanvas } from './NeuralOrbCanvas'
import { ACCENT_DEFAULT, SEMANTIC } from '@/lib/tokens'
import type { HostMetrics, HostSample } from '@/lib/host-metrics'
import { apiFetch } from '@/lib/api-base'
import { deriveOrbState, isOrbBelowCoolThreshold, orbLoadIntensity, type OrbState } from '@/lib/orb-state'
import { deriveOrbOverlayVisual, deriveOrbVisual } from '@/lib/orb-visual'
import type { OrbOverlay } from '@/lib/orb-overlay'

const TELEMETRY_POLL_MS = 8_000
type Placement = 'desktop' | 'mobile'
type VisualState = { state: OrbState; intensity: number }

let cachedWebGLSupport: boolean | null = null
let webglFailedForSession = false

function detectWebGL(): boolean {
  if (cachedWebGLSupport != null) return cachedWebGLSupport
  try {
    const canvas = document.createElement('canvas')
    cachedWebGLSupport = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch { cachedWebGLSupport = false }
  return cachedWebGLSupport
}

class WebGLErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { webglFailedForSession = true; this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    update(); document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

const PLASMA_VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position,1.0);}`
const PLASMA_FRAGMENT = `precision highp float;
uniform float uTime; uniform float uBloom; uniform vec3 uColor; varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
void main(){vec2 p=vUv-.5;float r=length(p)*2.;if(r>1.)discard;float a=atan(p.y,p.x);float n=noise(vec2(a*2.2+uTime*.11,r*4.-uTime*.24))+noise(vec2(a*4.-uTime*.08,r*8.+uTime*.15))*.35;float pulse=.5+.5*sin(uTime*6.28318);float core=exp(-r*r*5.8)*(.6+.4*pulse);float rim=pow(smoothstep(.5,1.,r),2.5);vec3 col=uColor*(core+rim*(.42+.25*n));col+=vec3(.85,.96,1.)*core*.22;float alpha=clamp(core+rim*.5,0.,1.)*.88;gl_FragColor=vec4(col*(.72+uBloom*.45),alpha);}`

/** Shader plasma disc; the deterministic neural topology is rendered by the sibling 2D canvas. */
function OrbScene({ visual, overlay, staticMotion, expanded }: { visual: VisualState; overlay: OrbOverlay | null; staticMotion: boolean; expanded: boolean }) {
  const { invalidate } = useThree()
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uBloom: { value: 0.55 }, uColor: { value: new THREE.Color(ACCENT_DEFAULT) },
  }), [])
  const currentColor = useRef(new THREE.Color(ACCENT_DEFAULT))
  useEffect(() => { invalidate() }, [invalidate, visual, overlay])
  useFrame((frame, delta) => {
    const overlayVisual = overlay ? deriveOrbOverlayVisual(overlay.kind) : null
    const target = overlayVisual
      ? new THREE.Color(overlayVisual.palette.hex)
      : visual.state === 'hot' ? new THREE.Color(SEMANTIC.error.hex) : new THREE.Color(visual.state === 'idle' ? ACCENT_DEFAULT : '#7DEFFF')
    if (staticMotion) currentColor.current.copy(target)
    else currentColor.current.lerp(target, Math.min(1, delta / (visual.state === 'hot' ? 1.5 : 3)))
    uniforms.uColor.value.copy(currentColor.current)
    uniforms.uBloom.value = overlayVisual ? overlayVisual.bloom : visual.state === 'idle' ? 0.55 : Math.max(0.75, visual.intensity)
    uniforms.uTime.value = staticMotion ? 0 : frame.clock.elapsedTime * (overlayVisual?.pulseRate ?? (visual.state === 'idle' ? 0.6 : 1.7))
  })
  return <mesh scale={expanded ? 4.9 : 2.2}>
    <planeGeometry args={[2, 2]} />
    <shaderMaterial uniforms={uniforms} vertexShader={PLASMA_VERTEX} fragmentShader={PLASMA_FRAGMENT} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
  </mesh>
}

function OrbRuntime({ placement }: { placement: Placement }) {
  const { motion, density, elements3d } = useUiSettings()
  const ringViewport = useMedia('(min-width: 900px)')
  const showRing = elements3d.coreOrb && density !== 'compact' && ringViewport
  const showOrbit = elements3d.coreOrb && density !== 'compact' && ringViewport && elements3d.pipelineOrbit
  const activity = useOrbActivity()
  const activityRef = useRef(activity)
  const visible = usePageVisible()
  const osReduced = useMedia('(prefers-reduced-motion: reduce)')
  const staticMotion = osReduced || motion === 'reduced' || motion === 'off'
  const sampleRef = useRef<HostSample | null>(null)
  const previousState = useRef<OrbState>('idle')
  const coolBelowSince = useRef<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const [sample, setSample] = useState<HostSample | null>(null)
  const [visual, setVisual] = useState<VisualState>({ state: 'idle', intensity: 0 })
  const [webglFailed, setWebglFailed] = useState(webglFailedForSession)
  const webglAvailable = useMemo(() => detectWebGL(), [])

  useEffect(() => { activityRef.current = activity }, [activity])
  const evaluate = useCallback(() => {
    const now = Date.now(); const sample = sampleRef.current
    if (previousState.current === 'hot' && isOrbBelowCoolThreshold(sample)) coolBelowSince.current ??= now
    else coolBelowSince.current = null
    const state = deriveOrbState(sample, { lastEventAt: activityRef.current.lastEventAt, runningTaskCount: activityRef.current.runningTaskCount, now, previousState: previousState.current, coolBelowSince: coolBelowSince.current })
    previousState.current = state
    const load = orbLoadIntensity(sample)
    const intensity = state === 'surge' ? 0.5 + Math.max(0, load - 0.7) / 0.3 * 0.5 : load
    setVisual(prev => prev.state === state && Math.abs(prev.intensity - intensity) < 0.01 ? prev : { state, intensity: Math.min(1, intensity) })
  }, [])
  useEffect(() => { if (visible) evaluate() }, [evaluate, activity.now, visible])

  // MatrixRainBackground observes this one attribute; no second telemetry loop is needed.
  useEffect(() => {
    document.documentElement.dataset.obOrbState = visual.state
    document.documentElement.style.setProperty('--ob-rain-speed', `${deriveOrbVisual(visual.state).pulseRate / 0.6}`)
  }, [visual])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      abort.current?.abort(); const ctl = new AbortController(); abort.current = ctl
      try {
        const response = await apiFetch('/api/telemetry', { cache: 'no-store', signal: ctl.signal })
        if (!response.ok) return
        const metrics = await response.json() as HostMetrics
        if (!alive) return
        sampleRef.current = metrics.current
        setSample(metrics.current)
        evaluate()
      } catch (error) { if ((error as Error).name !== 'AbortError') { sampleRef.current = null; setSample(null) } }
    }
    let pollTimer: number | null = null; let stateTimer: number | null = null
    const stopTimers = () => {
      if (pollTimer != null) window.clearInterval(pollTimer); if (stateTimer != null) window.clearInterval(stateTimer)
      pollTimer = null; stateTimer = null; abort.current?.abort()
    }
    const startTimers = () => {
      if (pollTimer != null || document.visibilityState !== 'visible') return
      pollTimer = window.setInterval(() => { void poll() }, TELEMETRY_POLL_MS); stateTimer = window.setInterval(evaluate, 1_000)
    }
    if (document.visibilityState === 'visible') { startTimers(); void poll() }
    const onVisible = () => document.visibilityState === 'visible' ? (startTimers(), void poll()) : stopTimers()
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; stopTimers(); document.removeEventListener('visibilitychange', onVisible); abort.current?.abort() }
  }, [evaluate])

  const markWebGLFailed = useCallback(() => { webglFailedForSession = true; setWebglFailed(true) }, [])
  const params = deriveOrbVisual(visual.state)
  const hostLoad = sample ? `${Math.round(Math.min(1, orbLoadIntensity(sample)) * 100)}%` : '—'
  return (
    <div className={`mc-core-orb mc-core-orb-${placement}`} data-orb-state={visual.state} aria-hidden="true">
      {webglAvailable && !webglFailed && (
        <WebGLErrorBoundary onError={markWebGLFailed}>
          <Canvas
            key={`orb-ring-${showRing}-pipeline-${showOrbit}`}
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, showRing || showOrbit ? 8.5 : 3.35], fov: 45 }}
            frameloop={staticMotion || !visible ? 'demand' : 'always'}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <OrbScene visual={visual} overlay={activity.overlay} staticMotion={staticMotion} expanded={showRing || showOrbit} />
            {showRing && (showOrbit ? <PipelineKanbanFit><OrbitalKanbanRing staticMotion={staticMotion} visible={visible} /></PipelineKanbanFit> : <OrbitalKanbanRing staticMotion={staticMotion} visible={visible} />)}
            {showOrbit && <PipelineOrbit staticMotion={staticMotion} visible={visible} />}
          </Canvas>
        </WebGLErrorBoundary>
      )}
      {(!webglAvailable || webglFailed) && (
        <img src="/visuals/reactor-core-poster.svg" alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      )}
      <NeuralOrbCanvas state={visual.state} intensity={visual.intensity} overlay={activity.overlay} staticMotion={staticMotion} visible={visible} />
      <span className="mc-core-orb-mark"><Icon name="brand" size={placement === 'desktop' ? 15 : 11} /></span>
      <span className="ob-orb-readout"><strong>{hostLoad}</strong><small>HOST LOAD</small><em>{params.palette.label.toUpperCase()} · {params.pulseRate.toFixed(1)}HZ</em></span>
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
