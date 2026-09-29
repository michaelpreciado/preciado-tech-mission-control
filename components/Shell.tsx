'use client'

import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { LiveDataProvider } from './LiveDataProvider'
import { BridgeStrip } from './BridgeStrip'
import { Button } from './ui'
import { Icon, type IconName } from './icons'
import { FOLD_INNER_MEDIA_QUERY, Sidebar as OmniBridgeSidebar } from './Sidebar'
import { MatrixRainBackground } from './MatrixRainBackground'
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
        {/* Home docks the desktop orb in its left rail; keep the shell orb on
            every other route and preserve the mobile home orb fallback. */}
        {(!active || mobile) && <CoreOrb placement={placement} />}
      </span>
      {mobile && <span className="mc-mobile-label">Home</span>}
    </Link>
  )
}

/** Primary bottom-tabs. Everything else lives behind the More sheet. */
const PRIMARY: { id: string; label: string; icon: IconName }[] = [
  { id: '/', label: 'Home', icon: 'deck' },
  { id: '/kanban', label: 'Kanban', icon: 'kanban' },
  { id: '/chat', label: 'Chat', icon: 'chat' },
  { id: '/system', label: 'System', icon: 'memory' },
]

const PRIMARY_IDS = new Set(PRIMARY.map(p => p.id))

function MobileNavSheet({
  open,
  onClose,
  title,
  ariaLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  ariaLabel: string
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<number | null>(null)
  const swipeDistance = useRef(0)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const main = document.querySelector('main')
    const wasInert = main?.inert ?? false
    if (main) main.inert = true
    const controls = () => Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])
    controls()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const items = controls()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (main) main.inert = wasInert
      previousFocus?.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current
    if (!sheet || sheet.scrollTop > 0) return
    swipeStart.current = e.touches[0]?.clientY ?? null
    swipeDistance.current = 0
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStart.current == null) return
    const distance = (e.touches[0]?.clientY ?? swipeStart.current) - swipeStart.current
    swipeDistance.current = Math.max(0, distance)
    if (swipeDistance.current > 0 && sheetRef.current) {
      sheetRef.current.style.setProperty('--mc-sheet-drag', `${Math.min(swipeDistance.current, 160)}px`)
    }
  }
  const onTouchEnd = () => {
    const distance = swipeDistance.current
    swipeStart.current = null
    swipeDistance.current = 0
    sheetRef.current?.style.removeProperty('--mc-sheet-drag')
    if (distance > 80) onClose()
  }

  return (
    <div className="mc-more-layer" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button type="button" className="mc-more-backdrop" aria-label="Close navigation sheet" onClick={onClose} />
      <div
        className="mc-more-sheet"
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="mc-more-handle" aria-hidden="true" />
        <div className="mc-more-heading">
          <div className="mc-more-title">{title}</div>
          <Button className="mc-sheet-close" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>Close ×</Button>
        </div>
        <div className="mc-mobile-sheet-quick-actions" aria-label="Quick actions">
          <button
            type="button"
            className="mc-more-search"
            aria-label="Open command palette"
            onClick={() => {
              onClose()
              window.dispatchEvent(new CustomEvent('mc:open-cmdp', { detail: { focus: true } }))
            }}
          >
            <span className="mc-more-search-ic" aria-hidden="true">⌕</span>
            <span className="mc-more-search-ph">Jump to…</span>
            <kbd className="mc-more-search-kbd">⌘K</kbd>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const nav = useVisibleNav()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <MobileNavSheet open={open} onClose={onClose} title="More destinations" ariaLabel="More destinations">
        {nav.map(sec => {
          const items = sec.items.filter(it => !PRIMARY_IDS.has(it.id))
          if (!items.length) return null
          return (
            <div key={sec.section} className="mc-more-section">
              <div className="mc-more-seclabel">{sec.section}</div>
              <div className="mc-more-grid">
                {items.map(it => (
                  <Link key={it.id} href={it.id} aria-current={isActive(it.id) ? 'page' : undefined} className={`mc-more-cell ${isActive(it.id) ? 'is-active' : ''}`} onClick={onClose}>
                    <span className="mc-more-ic"><Icon name={it.icon} size={18} /></span>
                    <span className="mc-more-lbl">{it.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
    </MobileNavSheet>
  )
}

function MobileNav() {
  const pathname = usePathname()
  const ui = useUiSettings()
  const [moreOpen, setMoreOpen] = useState(false)
  const closeMore = useCallback(() => setMoreOpen(false), [])
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

  // A sheet opened on the cover must not linger over the desktop shell.
  useEffect(() => {
    const mobileChrome = window.matchMedia('(max-width: 719px)')
    const foldInner = window.matchMedia(FOLD_INNER_MEDIA_QUERY)
    const closeOnLayoutChange = () => {
      if (!mobileChrome.matches || foldInner.matches) setMoreOpen(false)
    }
    closeOnLayoutChange()
    mobileChrome.addEventListener('change', closeOnLayoutChange)
    foldInner.addEventListener('change', closeOnLayoutChange)
    return () => {
      mobileChrome.removeEventListener('change', closeOnLayoutChange)
      foldInner.removeEventListener('change', closeOnLayoutChange)
    }
  }, [])

  // Slide the pill to whichever bottom tab is active (primary or the More toggle).
  useEffect(() => {
    const measure = () => {
      const inner = navInnerRef.current
      if (!inner) return
      const active = inner.querySelector<HTMLElement>('.mc-mobile-item.is-active')
      if (!active) { setPill(null); return }
      setPill({ left: active.offsetLeft, width: active.offsetWidth })
    }
    // Measure after paint so layout (incl. the mobile bar showing) is settled.
    const raf = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    if (navInnerRef.current) observer.observe(navInnerRef.current)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [pathname, moreOpen, visiblePrimary])

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
          {visiblePrimary.filter(item => item.id === '/system').map(item => {
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
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </>
  )
}

function HomeNavDrawer() {
  const nav = useVisibleNav()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    const openDrawer = () => setOpen(true)
    const foldInner = window.matchMedia(FOLD_INNER_MEDIA_QUERY)
    const closeOnFold = () => { if (foldInner.matches) setOpen(false) }
    window.addEventListener('mc:open-home-nav', openDrawer)
    foldInner.addEventListener('change', closeOnFold)
    closeOnFold()
    return () => {
      window.removeEventListener('mc:open-home-nav', openDrawer)
      foldInner.removeEventListener('change', closeOnFold)
    }
  }, [])
  useEffect(() => { setOpen(false) }, [pathname])
  return (
    <MobileNavSheet open={open} onClose={close} title="Navigation" ariaLabel="Navigation tabs">
      <nav aria-label="Home navigation tabs">
        {nav.map(section => (
          <div key={section.section} className="mc-more-section">
            <p className="mc-more-seclabel">{section.section}</p>
            <div className="mc-more-grid">
              {section.items.map(item => {
                const active = item.id === '/' ? pathname === '/' : pathname.startsWith(item.id)
                return <Link key={item.id} href={item.id} aria-current={active ? 'page' : undefined} className={`mc-more-cell ${active ? 'is-active' : ''}`} onClick={close}>
                  <span className="mc-more-ic"><Icon name={item.icon} size={18} /></span>
                  <span className="mc-more-lbl">{item.label}</span>
                </Link>
              })}
            </div>
          </div>
        ))}
      </nav>
    </MobileNavSheet>
  )
}

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
      <div className="mc-bg" />
      <MatrixRainBackground />
      <div className="mc-scanlines" aria-hidden="true" />
      <div className="mc-vignette" aria-hidden="true" />

      <div className={`mc-shell${pathname === '/' ? ' is-home' : ''}`}>
        <OmniBridgeSidebar />
        <main id="mc-main-content" className="mc-main">
          <BridgeStrip />
          {children}
        </main>
      </div>
      <MobileNav />
      <HomeNavDrawer />
    </LiveDataProvider>
    </BrandContext.Provider>
    </UiSettingsContext.Provider>
  )
}
