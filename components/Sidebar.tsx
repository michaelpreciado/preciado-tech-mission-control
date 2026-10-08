'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from './icons'
import { useKanbanSnapshot } from './KanbanSnapshot'
import { useLiveData } from './LiveDataProvider'
import { useUiSettings } from './ui-settings'
import { applyUiToNav } from '@/lib/nav-tabs'
import styles from './Sidebar.module.css'

const SIDEBAR_STORAGE_KEY = 'omniBridge.sidebar.collapsed'
/** Tablet / unfolded-inner band: icon rail instead of the phone layout. Mirrored verbatim in app/styles/fold.css and Sidebar.module.css. */
export const FOLD_INNER_MEDIA_QUERY = '(min-width: 720px) and (max-width: 1100px), (min-width: 720px) and (max-width: 1400px) and (pointer: coarse)'

function isRouteActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function Sidebar() {
  const pathname = usePathname()
  const ui = useUiSettings()
  const nav = useMemo(() => applyUiToNav(ui), [ui])
  const { summary } = useKanbanSnapshot()
  const live = useLiveData()
  const sysState = live.error ? 'degraded' : live.isLive ? 'online' : 'syncing'
  const [collapsed, setCollapsed] = useState(false)
  const [foldInner, setFoldInner] = useState(false)
  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(FOLD_INNER_MEDIA_QUERY)
    const update = () => setFoldInner(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
    } catch {
      // A blocked storage API should not prevent the navigation from working.
    } finally { setStorageReady(true) }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed)) } catch {
      // Persistence is a progressive enhancement.
    }
  }, [collapsed, storageReady])

  const visuallyCollapsed = collapsed || foldInner
  const needsYou = summary?.needsYou ?? 0

  return (
    <aside className={`ob-sidebar ${styles.sidebar} ${visuallyCollapsed ? `ob-sidebar--collapsed ${styles.collapsed}` : ''}`} aria-label="Main navigation">
      <Link href="/" className={styles.mark} aria-label="Mission Control home">
        <Icon name="brand" size={20} />
        <span className={`${styles.label} ${styles.markCopy}`}>
          <span className={styles.markName}>Mission Control</span>
          <span className={styles.markHost} aria-hidden="true">friday@system</span>
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Primary navigation">
        {nav.map(section => (
          <div key={section.section} className={styles.group} role="group" aria-label={section.section}>
            <p className={styles.groupLabel}><span aria-hidden="true">~/</span>{section.section}</p>
            {section.items.map(item => {
              const active = isRouteActive(pathname, item.id)
              const count = item.id === '/kanban' ? needsYou : 0
              if (item.enabled === false) return (
                <span key={item.id} className={styles.link} aria-disabled="true" title={`${item.label}: ${item.blockedReason}`}>
                  <Icon name={item.icon} size={18} />
                  <span className={styles.label}>{item.label} · Disabled<small style={{ display: 'block', whiteSpace: 'normal' }}>{item.blockedReason}</small></span>
                </span>
              )
              return (
                <Link
                  key={item.id}
                  href={item.id}
                  className={`${styles.link} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon name={item.icon} size={18} />
                  <span className={styles.label}>{item.label}</span>
                  {active && <span className={styles.caret} aria-hidden="true" />}
                  {count > 0 && <span className={styles.count} aria-label={`${count} need you`}>{count}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className={styles.foot}>
        <dl className={`${styles.label} ${styles.sys}`} aria-hidden="true">
          <div data-state={sysState}><dt>status</dt><dd><b className={styles.sysDot} />{sysState}</dd></div>
          <div><dt>build</dt><dd>2026.10</dd></div>
        </dl>
        <button
          type="button"
          className={styles.palette}
          onClick={() => window.dispatchEvent(new Event('mc:open-cmdp'))}
          title="Open command palette (Ctrl+K)"
          aria-label="Open command palette"
        >
          <Icon name="chat" size={16} />
          <span className={styles.label}>Jump to…</span>
          <kbd className={styles.label}>⌘K</kbd>
        </button>
        <button
          type="button"
          className={styles.toggle}
          aria-label={visuallyCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!visuallyCollapsed}
          onClick={() => setCollapsed(value => !value)}
          title={visuallyCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden="true">{visuallyCollapsed ? '›' : '‹'}</span>
        </button>
      </div>
    </aside>
  )
}
