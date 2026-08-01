'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LiveDataProvider, useLiveData } from './LiveDataProvider'

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

const NAV = [
  { section: 'Overview', items: [
    { id: '/', label: 'Deck', glyph: '🏠' },
    { id: '/approvals', label: 'Approvals', glyph: '✅' },
    { id: '/tasks', label: 'Tasks', glyph: '📋' },
    { id: '/calendar', label: 'Calendar', glyph: '📅' },
  ]},
  { section: 'Intelligence', items: [
    { id: '/chat', label: 'Chat', glyph: '💬' },
    { id: '/github', label: 'GitHub', glyph: '🐙' },
    { id: '/costs', label: 'Costs', glyph: '📊' },
  ]},
  { section: 'Operations', items: [
    { id: '/projects', label: 'Projects', glyph: '📁' },
    { id: '/pipeline', label: 'Web Dev Pipeline', glyph: '🌐' },
    { id: '/ml-content', label: 'ML Content', glyph: '🤖' },
  ]},
  { section: 'System', items: [
    { id: '/memory', label: 'Memory', glyph: '🧠' },
    { id: '/team', label: 'Team', glyph: '👥' },
    { id: '/setup', label: 'Setup', glyph: '🛠' },
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
        <div className="mc-brand-mark">🏠</div>
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
              className={`mc-nav-item ${isActive(it.id) ? 'is-active' : ''}`}
              style={{ '--i': idx } as React.CSSProperties}
            >
              <span className="mc-nav-rail" />
              <span className="mc-nav-ic">{it.glyph}</span>
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

function MobileNav() {
  const pathname = usePathname()
  const pending = usePendingApprovals()

  // Flatten all NAV items into a single list for the bottom tab bar
  const mobileItems = NAV.flatMap(sec => sec.items)

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="mc-mobile-nav" aria-label="Mobile navigation">
      <div className="mc-mobile-nav-inner">
        {mobileItems.map(item => {
          const active = isActive(item.id)
          return (
            <Link key={item.id} href={item.id} aria-current={active ? 'page' : undefined}
              className={`mc-mobile-item ${active ? 'is-active' : ''}`}>
              <span className="mc-mobile-glyph">
                {item.glyph}
                {item.id === '/approvals' && pending > 0 && (
                  <span className="mc-mobile-badge">{pending > 9 ? '9+' : pending}</span>
                )}
              </span>
              <span className="mc-mobile-label">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
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
