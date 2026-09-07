'use client'

/**
 * Setup → UI CUSTOMIZATION settings context.
 *
 * Split out of Shell.tsx so any client component (including ones Shell
 * dynamically imports, like AmbientNeuralField) can read these flags without
 * creating a circular import back into Shell.tsx. The Provider itself still
 * lives in Shell — this file only owns the type/context/hook.
 */
import { createContext, useContext, useMemo } from 'react'
import type { FridayAppearance } from '@/lib/config'

type PersistedUiSettings = Pick<FridayAppearance, 'motion' | 'density' | 'hiddenTabs' | 'tabOrder' | 'elements3d'>
export type UiSettings = Omit<PersistedUiSettings, 'elements3d'> & {
  elements3d: PersistedUiSettings['elements3d'] & { pipelineOrbit?: boolean }
}

type ResolvedUiSettings = UiSettings & { elements3d: UiSettings['elements3d'] & { pipelineOrbit: boolean } }

export const DEFAULT_UI_SETTINGS: ResolvedUiSettings = {
  motion: 'full',
  density: 'compact',
  hiddenTabs: [],
  tabOrder: [],
  elements3d: { coreOrb: true, memoryGraph: true, teamGraph: true, pipelineOrbit: true },
}

export const UiSettingsContext = createContext<PersistedUiSettings | UiSettings>(DEFAULT_UI_SETTINGS)

export function useUiSettings() {
  const settings = useContext(UiSettingsContext)
  return useMemo<ResolvedUiSettings>(() => ({
    ...settings,
    elements3d: { ...DEFAULT_UI_SETTINGS.elements3d, ...settings.elements3d },
  }), [settings])
}
