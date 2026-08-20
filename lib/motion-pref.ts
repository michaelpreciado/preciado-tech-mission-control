/**
 * Shared motion-guard helper for every ambient/3D component (CoreOrb3D,
 * AmbientNeuralField, CoreOrb3D, Tilt, ...).
 *
 * Two independent signals decide whether a component freezes to a static
 * frame:
 *   1. The OS-level `prefers-reduced-motion` media query (+ coarse pointer,
 *      as a battery heuristic) — always respected, never overridden.
 *   2. The explicit in-app override from Setup → UI CUSTOMIZATION
 *      (`appearance.motion`), which lets a user turn animation down even on
 *      a machine that doesn't report a reduced-motion preference.
 *
 * 'full' (the default) adds nothing — components fall back to the OS/battery
 * heuristics exactly as before this setting existed. 'reduced' and 'off' both
 * force the static-frame codepath: none of the gated components currently
 * have an intermediate "some but less" animation state, so building one
 * would be new product surface, not wiring. They're kept as distinct menu
 * choices for forward compatibility (a future component could split them).
 */
export type MotionSetting = 'full' | 'reduced' | 'off'

export function wantsStaticMotion(setting: MotionSetting | undefined): boolean {
  if (setting === 'off' || setting === 'reduced') return true
  if (typeof window === 'undefined') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return false
}
