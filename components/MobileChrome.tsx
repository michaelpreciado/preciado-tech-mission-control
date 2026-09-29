'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './icons'
import { FOLD_INNER_MEDIA_QUERY } from './Sidebar'
import { useKanbanSnapshot } from './KanbanSnapshot'
import { useUiSettings } from './ui-settings'
import { applyUiToNav } from '@/lib/nav-tabs'
import styles from './MobileChrome.module.css'

/** Bottom tabs. Everything else lives behind the More sheet. */
const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: '/', label: 'Home', icon: 'deck' },
  { id: '/kanban', label: 'Kanban', icon: 'kanban' },
  { id: '/crew', label: 'Crew', icon: 'team' },
  { id: '/chat', label: 'Chat', icon: 'chat' },
]
const TAB_IDS = new Set(TABS.map(t => t.id))
const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const ui = useUiSettings()
  const nav = useMemo(() => applyUiToNav(ui), [ui])
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
    if (!sheetRef.current || sheetRef.current.scrollTop > 0) return
    swipeStart.current = e.touches[0]?.clientY ?? null
    swipeDistance.current = 0
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (swipeStart.current == null) return
    swipeDistance.current = Math.max(0, (e.touches[0]?.clientY ?? swipeStart.current) - swipeStart.current)
    if (swipeDistance.current > 0) sheetRef.current?.style.setProperty('--mbg-drag', `${Math.min(swipeDistance.current, 160)}px`)
  }
  const onTouchEnd = () => {
    const distance = swipeDistance.current
    swipeStart.current = null
    swipeDistance.current = 0
    sheetRef.current?.style.removeProperty('--mbg-drag')
    if (distance > 80) onClose()
  }

  return (
    <div className={styles.layer} role="dialog" aria-modal="true" aria-label="More destinations">
      <button type="button" className={styles.scrim} aria-label="Close navigation sheet" onClick={onClose} />
      <div className={styles.sheet} ref={sheetRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className={styles.head}>
          <h2>More</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close more destinations">Close</button>
        </div>
        <button
          type="button"
          className={styles.jump}
          aria-label="Open command palette"
          onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('mc:open-cmdp', { detail: { focus: true } })) }}
        >
          <span aria-hidden="true">⌕</span> Jump to…
        </button>
        {nav.map(sec => {
          const items = sec.items.filter(it => !TAB_IDS.has(it.id))
          if (!items.length) return null
          return (
            <section key={sec.section} className={styles.section} aria-label={sec.section}>
              <p className={styles.sectionLabel}>{sec.section}</p>
              <div className={styles.grid}>
                {items.map(it => (
                  <Link key={it.id} href={it.id} aria-current={isActive(pathname, it.id) ? 'page' : undefined} className={styles.cell} onClick={onClose}>
                    <Icon name={it.icon} size={18} />
                    <span>{it.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function MobileChrome() {
  const pathname = usePathname()
  const ui = useUiSettings()
  const { summary } = useKanbanSnapshot()
  const [moreOpen, setMoreOpen] = useState(false)
  const closeMore = useCallback(() => setMoreOpen(false), [])

  const tabs = useMemo(
    () => TABS.filter(t => t.id === '/' || !ui.hiddenTabs.includes(t.id)),
    [ui.hiddenTabs],
  )
  const inMore = useMemo(
    () => applyUiToNav(ui).some(sec => sec.items.some(it => !TAB_IDS.has(it.id) && isActive(pathname, it.id))),
    [ui, pathname],
  )

  useEffect(() => {
    const mobileChrome = window.matchMedia('(max-width: 719px)')
    const foldInner = window.matchMedia(FOLD_INNER_MEDIA_QUERY)
    const closeOnLayoutChange = () => { if (!mobileChrome.matches || foldInner.matches) setMoreOpen(false) }
    closeOnLayoutChange()
    mobileChrome.addEventListener('change', closeOnLayoutChange)
    foldInner.addEventListener('change', closeOnLayoutChange)
    return () => {
      mobileChrome.removeEventListener('change', closeOnLayoutChange)
      foldInner.removeEventListener('change', closeOnLayoutChange)
    }
  }, [])

  const needsYou = summary?.needsYou ?? 0

  return (
    <>
      <nav className={styles.tabbar} data-mobile-nav="" aria-label="Mobile navigation">
        {tabs.map(tab => {
          const active = isActive(pathname, tab.id)
          const badge = tab.id === '/kanban' ? needsYou : 0
          return (
            <Link key={tab.id} href={tab.id} aria-current={active ? 'page' : undefined} className={styles.tab}>
              <Icon name={tab.icon} size={20} />
              <span>{tab.label}</span>
              {badge > 0 && <b className={styles.badge} aria-label={`${badge} need you`}>{badge}</b>}
            </Link>
          )
        })}
        <button
          type="button"
          className={styles.tab}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreOpen || inMore ? 'true' : undefined}
          onClick={() => setMoreOpen(o => !o)}
        >
          <Icon name="more" size={20} />
          <span>More</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </>
  )
}
