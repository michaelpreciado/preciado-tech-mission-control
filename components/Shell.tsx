'use client'

import { createContext, useContext } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { LiveDataProvider } from './LiveDataProvider'
import { KanbanSnapshotProvider } from './KanbanSnapshot'
import { MobileChrome } from './MobileChrome'
import { Sidebar as OmniBridgeSidebar } from './Sidebar'
import { MotionVisibility } from './MotionVisibility'
import { UiSettingsContext, DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from './ui-settings'

const CommandPalette = dynamic(() => import('./CommandPalette').then(m => m.CommandPalette), { ssr: false })

/** Brand identity resolved server-side in lib/config.ts, provided by <Shell>. */
const BrandContext = createContext<{ appName: string; appTagline: string }>({
  appName: 'F.R.I.D.A.Y.',
  appTagline: 'Framework for Running Intelligent Deployed Agents',
})

export function useBrand() {
  return useContext(BrandContext)
}

// UiSettings context/hook live in ./ui-settings so lazily loaded components can
// read them without a circular import back into this file.
export { useUiSettings, type UiSettings }

export function Shell({ appName, appTagline, ui, children }: { appName: string; appTagline: string; ui?: UiSettings; children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/login') return <>{children}</>
  return (
    <UiSettingsContext.Provider value={ui ?? DEFAULT_UI_SETTINGS}>
    <BrandContext.Provider value={{ appName, appTagline }}>
    <LiveDataProvider>
      <CommandPalette />
      <a href="#mc-main-content" className="mc-skip-nav">
        Skip to main content
      </a>
      <KanbanSnapshotProvider>
      <MotionVisibility />
      <div className="mbg-texture" aria-hidden="true" />

      <div className={`mc-shell${pathname === '/' ? ' is-home' : ''}`}>
        <OmniBridgeSidebar />
        <main id="mc-main-content" className="mc-main">
          {children}
        </main>
      </div>
      <MobileChrome />
      </KanbanSnapshotProvider>
    </LiveDataProvider>
    </BrandContext.Provider>
    </UiSettingsContext.Provider>
  )
}
