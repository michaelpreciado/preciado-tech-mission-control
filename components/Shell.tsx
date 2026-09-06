'use client'

import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { LiveDataProvider, useLiveData } from './LiveDataProvider'
import { Button } from './ui'
import { Icon, type IconName } from './icons'
import { UiSettingsContext, DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from './ui-settings'
import { NAV, PINNED_TAB_IDS } from '@/lib/nav-tabs'

const CommandPalette = dynamic(() => import('./CommandPalette').then(m => m.CommandPalette), { ssr: false })
const CoreOrb = dynamic(() => import('./CoreOrb'), { ssr: false })

/** Brand identity resolved server-side in lib/config.ts, provided by <Shell>. */
const BrandContext = createContext<{ appName: string; appTagline: string }>({
  appName: 'F.R.I.D.A.Y.',
  appTagline: 'Framework for Running Intelligent Deployed Agents',
})

export function useBrand() {
  return useContext(BrandContext)
}

// UiSettings context/hook now live in ./ui-settings (see import above) so
// components Shell dynamically imports (e.g. AmbientNeuralField) can read
// them without a circular import back into this file. NAV/PINNED_TAB_IDS
// live in lib/nav-tabs.ts so the Setup page can read tab ids/labels without
// pulling in this whole 'use client' shell chunk.
export { useUiSettings, type UiSettings }

/** Apply hiddenTabs + tabOrder to the static NAV shape: hide non-pinned tabs
 * the user turned off, and reorder items WITHIN each section (Array.sort is
 * stable, so ids missing from tabOrder keep their default relative order). */
function applyUiToNav(ui: UiSettings) {
  return NAV
    .map(sec => ({
      section: sec.section,
      items: sec.items
        .filter(it => PINNED_TAB_IDS.has(it.id) || !ui.hiddenTabs.includes(it.id))
        .slice()
        .sort((a, b) => {
          const ia = ui.tabOrder.indexOf(a.id)
          const ib = ui.tabOrder.indexOf(b.id)
          if (ia === -1 && ib === -1) return 0
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        }),
    }))
    .filter(sec => sec.items.length > 0)
}

function useVisibleNav() {
  const ui = useUiSettings()
  return useMemo(() => applyUiToNav(ui), [ui])
}

function HomeControl({ placement }: { placement: 'desktop' | 'mobile' }) {
  const pathname = usePathname()
  const active = pathname === '/'
  const mobile = placement === 'mobile'
  return (
    <Link
      href="/"
      aria-label="Home"
      aria-current={active ? 'page' : undefined}
      className={`${mobile ? 'mc-mobile-item mc-mobile-home' : 'mc-home-control'}${active ? ' is-active' : ''}`}
    >
      <span className="mc-home-control-visual">
        <span className="mc-home-control-fallback" aria-hidden="true"><Icon name="brand" size={mobile ? 20 : 24} /></span>
        <CoreOrb placement={placement} />
      </span>
      {mobile && <span className="mc-mobile-label">Home</span>}
    </Link>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { data, isLive } = useLiveData()
  const { appName } = useBrand()
  const nav = useVisibleNav()
  const sidebarNav = useMemo(
    () => nav.map(sec => ({ ...sec, items: sec.items.filter(item => item.id !== '/') })).filter(sec => sec.items.length > 0),
    [nav],
  )

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="mc-side" aria-label="Main navigation">
      <HomeControl placement="desktop" />
      <div className="mc-brand">
        <div className="mc-brand-mark"><Icon name="brand" size={20} /></div>
        <div className="mc-brand-text">
          <div className="mc-brand-name">
            {appName.split(' ').map(word => <span key={word} style={{ display: 'block' }}>{word}</span>)}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        className="mc-cmdp-trigger"
        aria-label="Open command palette (Ctrl+K)"
        title="Jump anywhere — Ctrl/⌘+K  or  /"
        onClick={() => window.dispatchEvent(new Event('mc:open-cmdp'))}
      >
        <span className="mc-cmdp-trigger-ic"><Icon name="chat" size={13} /></span>
        <span>Jump to…</span>
        <kbd className="mc-cmdp-trigger-kbd">⌘K</kbd>
      </Button>
      <div className="mc-status-pill" style={{ display: 'none' }}>
        <span className={`mc-led ${isLive ? 'green' : ''}`} />
        <span>MISSION CTRL {isLive ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
      {sidebarNav.map((sec) => (
        <div key={sec.section} className="mc-side-section">
          <div className="mc-side-label">&gt; {sec.section}</div>
          {sec.items.map((it, idx) => (
            <Link
              key={it.id}
              href={it.id}
              aria-current={isActive(it.id) ? 'page' : undefined}
              className={`mc-nav-item ${isActive(it.id) ? 'is-active' : ''}`}
              style={{ '--i': idx } as React.CSSProperties}
            >
              <span className="mc-nav-rail" />
              <span className="mc-nav-ic"><Icon name={it.icon} size={16} /></span>
              <span className="mc-nav-label">{it.label}</span>
              <span className="mc-nav-scan" />
            </Link>
          ))}
        </div>
      ))}

      <div className="mc-side-footer">
        <div className="mc-side-foot-title">&gt; SYSTEM STATUS</div>
        <div>{data ? `${data.counts.openTasks} open · ${data.counts.enabledCronJobs} jobs live` : 'indexing...'}</div>
        <div style={{ marginTop: 6, color: 'var(--pt-text-dim)' }}>
          {data?.warnings.length ? `${data.warnings.length} warning(s)` : 'All nominal'}
        </div>
      </div>
    </aside>
  )
}

/** Primary bottom-tabs. Everything else lives behind the More sheet. */
const PRIMARY: { id: string; label: string; icon: IconName }[] = [
  { id: '/', label: 'Home', icon: 'deck' },
  { id: '/kanban', label: 'Kanban', icon: 'kanban' },
  { id: '/chat', label: 'Chat', icon: 'chat' },
  { id: '/bots', label: 'Bots', icon: 'team' },
]

const PRIMARY_IDS = new Set(PRIMARY.map(p => p.id))

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const nav = useVisibleNav()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="mc-more-layer" role="dialog" aria-modal="true" aria-label="More destinations">
      <div className="mc-more-backdrop" onClick={onClose} />
      <div className="mc-more-sheet" onClick={e => e.stopPropagation()}>
        <div className="mc-more-handle" />
        <button
          type="button"
          className="mc-more-search"
          aria-label="Jump to a page, agent, or task"
          onClick={() => {
            onClose()
            window.dispatchEvent(new CustomEvent('mc:open-cmdp', { detail: { focus: true } }))
          }}
        >
          <span className="mc-more-search-ic" aria-hidden="true">⌕</span>
          <span className="mc-more-search-ph">Jump to…</span>
          <kbd className="mc-more-search-kbd">⌘K</kbd>
        </button>
        <div className="mc-more-title">&gt; MORE</div>
        {nav.map(sec => {
          const items = sec.items.filter(it => !PRIMARY_IDS.has(it.id))
          if (!items.length) return null
          return (
            <div key={sec.section} className="mc-more-section">
              <div className="mc-more-seclabel">{sec.section}</div>
              <div className="mc-more-grid">
                {items.map(it => (
                  <Link key={it.id} href={it.id} className={`mc-more-cell ${isActive(it.id) ? 'is-active' : ''}`} onClick={onClose}>
                    <span className="mc-more-ic"><Icon name={it.icon} size={18} /></span>
                    <span className="mc-more-lbl">{it.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MobileNav() {
  const pathname = usePathname()
  const ui = useUiSettings()
  const [moreOpen, setMoreOpen] = useState(false)
  const navInnerRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  // Bottom-bar slots respect hiddenTabs too — a hidden tab shouldn't get a
  // reserved thumb-reach slot just because it's one of the 3 primaries.
  const visiblePrimary = useMemo(
    () => PRIMARY.filter(p => p.id !== '/' && (PINNED_TAB_IDS.has(p.id) || !ui.hiddenTabs.includes(p.id))),
    [ui.hiddenTabs],
  )
  // The More tab lights up whenever the current route lives behind the sheet.
  // Bots is a PRIMARY tab now, so PRIMARY_IDS excludes it — no special case.
  const inMore = NAV.some(sec => sec.items.some(it => !PRIMARY_IDS.has(it.id) && isActive(it.id)))

  // Slide the pill to whichever bottom tab is active (primary or the More toggle).
  useEffect(() => {
    const measure = () => {
      const inner = navInnerRef.current
      if (!inner) return
      const active = inner.querySelector<HTMLElement>('.mc-mobile-item.is-active')
      if (!active) return
      setPill({ left: active.offsetLeft, width: active.offsetWidth })
    }
    // Measure after paint so layout (incl. the mobile bar showing) is settled.
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure) }
  }, [pathname, moreOpen])

  return (
    <>
      <nav className="mc-mobile-nav" aria-label="Mobile navigation">
        <div className="mc-mobile-nav-inner" ref={navInnerRef}>
          {/* Sliding active-tab pill — glides to the active item on nav change */}
          {pill && <span className="mc-mobile-pill" style={{ left: pill.left, width: pill.width }} aria-hidden="true" />}
          {visiblePrimary.filter(item => item.id === '/kanban' || item.id === '/chat').map(item => {
            const active = isActive(item.id)
            return (
              <Link key={item.id} href={item.id} aria-current={active ? 'page' : undefined}
                className={`mc-mobile-item ${active ? 'is-active' : ''}`}>
                <span className="mc-mobile-glyph">
                  <Icon name={item.icon} size={20} />
                </span>
                <span className="mc-mobile-label">{item.label}</span>
              </Link>
            )
          })}
          <HomeControl placement="mobile" />
          {visiblePrimary.filter(item => item.id === '/bots').map(item => {
            const active = isActive(item.id)
            return (
              <Link key={item.id} href={item.id} aria-current={active ? 'page' : undefined}
                className={`mc-mobile-item ${active ? 'is-active' : ''}`}>
                <span className="mc-mobile-glyph"><Icon name={item.icon} size={20} /></span>
                <span className="mc-mobile-label">{item.label}</span>
              </Link>
            )
          })}
          <button type="button" aria-haspopup="true" aria-expanded={moreOpen}
            aria-label={moreOpen ? 'Close more destinations' : 'Open more destinations'}
            className={`mc-mobile-item mc-more-btn ${(moreOpen || inMore) ? 'is-active' : ''}`}
            onClick={() => setMoreOpen(o => !o)}>
            <span className="mc-mobile-glyph"><Icon name="more" size={20} /></span>
            <span className="mc-mobile-label">More</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

export function Shell({ appName, appTagline, ui, children }: { appName: string; appTagline: string; ui?: UiSettings; children: React.ReactNode }) {
  return (
    <UiSettingsContext.Provider value={ui ?? DEFAULT_UI_SETTINGS}>
    <BrandContext.Provider value={{ appName, appTagline }}>
    <LiveDataProvider>
      <CommandPalette />
      <a href="#mc-main-content" className="mc-skip-nav">
        Skip to main content
      </a>
      <div className="mc-bg" />
      <canvas id="mc-rain-canvas" className="mc-rain" aria-hidden="true" />
      <div className="mc-scanlines" aria-hidden="true" />
      <div className="mc-vignette" aria-hidden="true" />

      <div className="mc-shell">
        <Sidebar />
        <main id="mc-main-content" className="mc-main">
          {children}
        </main>
      </div>
      <MobileNav />
    </LiveDataProvider>
    </BrandContext.Provider>
    </UiSettingsContext.Provider>
  )
}
