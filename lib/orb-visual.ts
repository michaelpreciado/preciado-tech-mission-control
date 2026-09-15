import type { OrbState } from './orb-state'
import type { OrbOverlayKind } from './orb-overlay'

export type OrbPalette = {
  /** Linear RGB values are convenient for both WebGL and canvas compositing. */
  rgb: readonly [number, number, number]
  hex: string
  label: string
}

export type OrbVisualParams = {
  pulseRate: number
  bloom: number
  palette: OrbPalette
}

export type OrbOverlayVisualParams = {
  palette: OrbPalette
  pulseRate: number
  bloom: number
  ringDirection: 1 | -1
}

const PALETTES = {
  cyan: { rgb: [0, 0.898, 1] as const, hex: '#00E5FF', label: 'cyan' },
  working: { rgb: [0.35, 0.85, 1] as const, hex: '#7DEFFF', label: 'working' },
  alert: { rgb: [1, 0.42, 0.42] as const, hex: '#F87171', label: 'alert' },
  success: { rgb: [0.302, 0.949, 0.722] as const, hex: '#4DF2B8', label: 'success' },
  sync: { rgb: [0.561, 0.949, 1] as const, hex: '#8FF2FF', label: 'sync' },
} as const

/**
 * Pure visual mapping for the orb. Keep state derivation in orb-state.ts and
 * all presentation tuning here so the renderer stays unit-testable.
 */
export function deriveOrbVisual(state: OrbState): OrbVisualParams {
  switch (state) {
    case 'active':
      return { pulseRate: 1.7, bloom: 0.85, palette: PALETTES.working }
    case 'surge':
      return { pulseRate: 2.2, bloom: 0.98, palette: PALETTES.working }
    case 'hot':
      return { pulseRate: 2.6, bloom: 1, palette: PALETTES.alert }
    case 'idle':
    default:
      return { pulseRate: 0.6, bloom: 0.55, palette: PALETTES.cyan }
  }
}

export const orbVisualForState = deriveOrbVisual

/** Additive treatment layered over the base state while an event window is live. */
export function deriveOrbOverlayVisual(kind: OrbOverlayKind): OrbOverlayVisualParams {
  return kind === 'success'
    ? { palette: PALETTES.success, pulseRate: 2.8, bloom: 1, ringDirection: 1 }
    : { palette: PALETTES.sync, pulseRate: 3.8, bloom: 0.98, ringDirection: -1 }
}
