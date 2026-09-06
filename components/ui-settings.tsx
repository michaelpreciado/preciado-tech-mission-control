'use client'

/**
 * Setup → UI CUSTOMIZATION settings context.
 *
 * Split out of Shell.tsx so any client component (including ones Shell
 * dynamically imports, like AmbientNeuralField) can read these flags without
 * creating a circular import back into Shell.tsx. The Provider itself still
 * lives in Shell — this file only owns the type/context/hook.
 */
import { createContext, useContext } from 'react'
import type { FridayAppearance } from '@/lib/config'

export type UiSettings = Pick<FridayAppearance, 'motion' | 'density' | 'hiddenTabs' | 'tabOrder' | 'elements3d'>

export const DEFAULT_UI_SETTINGS: UiSettings = {
  motion: 'full',
  density: 'compact',
  hiddenTabs: [],
  tabOrder: [],
  elements3d: { coreOrb: true, memoryGraph: true, teamGraph: true },
}

export const UiSettingsContext = createContext<UiSettings>(DEFAULT_UI_SETTINGS)

export function useUiSettings() {
  return useContext(UiSettingsContext)
}
