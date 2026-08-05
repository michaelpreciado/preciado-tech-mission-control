'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LiveDataProvider, useLiveData } from './LiveDataProvider'
import { Icon, type IconName } from './icons'

/** Brand identity resolved server-side in lib/config.ts, provided by <Shell>. */
const BrandContext = createContext<{ appName: string; appTagline: string }>({
  appName: 'F.R.I.D.A.Y.',
  appTagline: 'Framework for Running Intelligent Deployed Agents',
})

export function useBrand() {
  return useContext(BrandContext)
}

/** Pending-approvals count for nav badges (sidebar + mobile tab bar). */
function usePendingApprovals(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch('/api/approvals?count=1', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (alive && typeof json.pending === 'number') setCount(json.pending)
      } catch { /* offline — keep last count */ }
    }
    void poll()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll()
    }, 30_000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  return count
}

const NAV: { section: string; items: { id: string; label: string; icon: IconName }[] }[] = [
  { section: 'Overview', items: [
    { id: '/', label: 'Home', icon: 'deck' },
    { id: '/kanban', label: 'Kanban', icon: 'kanban' },
    { id: '/approvals', label: 'Approvals', icon: 'approvals' },
    { id: '/calendar', label: 'Calendar', icon: 'calendar' },
  ]},
  { section: 'Intelligence', items: [
    { id: '/chat', label: 'Chat', icon: 'chat' },
    { id: '/github', label: 'GitHub', icon: 'github' },
    { id: '/costs', label: 'Costs', icon: 'costs' },
  ]},
  { section: 'Operations', items: [
    { id: '/projects', label: 'Projects', icon: 'projects' },
    { id: '/pipeline', label: 'Web Dev Pipeline', icon: 'pipeline' },
    { id: '/ml-content', label: 'ML Content', icon: 'ml' },
  ]},
  { section: 'System', items: [
    { id: '/memory', label: 'Memory', icon: 'memory' },
    { id: '/team', label: 'Team', icon: 'team' },
    { id: '/setup', label: 'Setup', icon: 'setup' },
  ]},
]

function Sidebar() {
  const pathname = usePathname()
  const { data, isLive } = useLiveData()
  const pending = usePendingApprovals()
  const { appName } = useBrand()

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="mc-side" aria-label="Main navigation">
      <div className="mc-brand">
        <div className="mc-brand-mark"><Icon name="brand" size={20} /></div>
        <div className="mc-brand-text">
          <div className="mc-brand-name">
            {appName.split(' ').map(word => <span key={word} style={{ display: 'block' }}>{word}</span>)}
          </div>
        </div>
      </div>
      <div className="mc-status-pill" style={{ display: 'none' }}>
        <span className={`mc-led ${isLive ? 'green' : ''}`} />
        <span>MISSION CTRL {isLive ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
      {NAV.map((sec) => (
        <div key={sec.section} className="mc-side-section">
          <div className="mc-side-label">&gt; {sec.section}</div>
          {sec.items.map((it, idx) => (
            <Link
              key={it.id}
              href={it.id}
              aria-current={isActive(it.id) ? 'page' : undefined}
              aria-label={it.id === '/approvals' && pending > 0 ? `${it.label}, ${pending} pending` : undefined}
              className={`mc-nav-item ${isActive(it.id) ? 'is-active' : ''}`}
              style={{ '--i': idx } as React.CSSProperties}
            >
              <span className="mc-nav-rail" />
              <span className="mc-nav-ic"><Icon name={it.icon} size={16} /></span>
              <span className="mc-nav-label">{it.label}</span>
              {it.id === '/approvals' && pending > 0 && (
                <span className="mc-nav-badge">{pending}</span>
              )}
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
  { id: '/approvals', label: 'Approvals', icon: 'approvals' },
  { id: '/chat', label: 'Chat', icon: 'chat' },
]

const PRIMARY_IDS = new Set(PRIMARY.map(p => p.id))

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
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
        <div className="mc-more-title">&gt; MORE</div>
        {NAV.map(sec => {
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
  const pending = usePendingApprovals()
  const [moreOpen, setMoreOpen] = useState(false)
  const navInnerRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  // The More tab lights up whenever the current route lives behind the sheet.
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
          {PRIMARY.map(item => {
            const active = isActive(item.id)
            return (
              <Link key={item.id} href={item.id} aria-current={active ? 'page' : undefined}
                aria-label={item.id === '/approvals' && pending > 0 ? `${item.label}, ${pending} pending` : undefined}
                className={`mc-mobile-item ${active ? 'is-active' : ''}`}>
                <span className="mc-mobile-glyph">
                  <Icon name={item.icon} size={20} />
                  {item.id === '/approvals' && pending > 0 && (
                    <span className="mc-mobile-badge">{pending > 9 ? '9+' : pending}</span>
                  )}
                </span>
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

export function Shell({ appName, appTagline, children }: { appName: string; appTagline: string; children: React.ReactNode }) {
  return (
    <BrandContext.Provider value={{ appName, appTagline }}>
    <LiveDataProvider>
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
  )
}
