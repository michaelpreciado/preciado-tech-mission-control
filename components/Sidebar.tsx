'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from './icons'
import { useLiveData } from './LiveDataProvider'
import styles from './Sidebar.module.css'

type PrimaryItem = {
  id: string
  label: string
  href: string
  icon: IconName
}

const PRIMARY_NAV: PrimaryItem[] = [
  { id: 'home', label: '~/home', href: '/', icon: 'deck' },
  { id: 'kanban', label: '~/kanban', href: '/kanban', icon: 'kanban' },
  { id: 'chat', label: '~/chat', href: '/chat', icon: 'chat' },
  { id: 'system', label: '~/system', href: '/system', icon: 'memory' },
  { id: 'pipeline', label: '~/pipeline', href: '/pipeline', icon: 'pipeline' },
  { id: 'clients', label: '~/clients', href: '/projects', icon: 'projects' },
  { id: 'costs', label: '~/costs', href: '/costs', icon: 'costs' },
  { id: 'github', label: '~/github', href: '/github', icon: 'github' },
]

const CREW_NAV = [
  { id: 'jarvis', label: 'jarvis' },
  { id: 'friday', label: 'friday' },
  { id: 'edith', label: 'edith' },
] as const

const SIDEBAR_STORAGE_KEY = 'omniBridge.sidebar.collapsed'
/** Tablet / unfolded-inner band: icon rail instead of the phone layout. Mirrored verbatim in app/styles/fold.css and Sidebar.module.css. */
export const FOLD_INNER_MEDIA_QUERY = '(min-width: 720px) and (max-width: 1100px), (min-width: 720px) and (max-width: 1400px) and (pointer: coarse)'

function isRouteActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function statusTone(status?: string) {
  if (!status) return 'unknown'
  if (status === 'active') return 'active'
  if (status === 'attention') return 'attention'
  if (status === 'offline') return 'offline'
  return 'standby'
}

export function Sidebar() {
  const pathname = usePathname()
  const { data } = useLiveData()
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

  const liveCrew = useMemo(() => data?.crew ?? [], [data?.crew])
  const crewMember = (id: string) => liveCrew.find(member =>
    member.id.toLowerCase() === id || member.name.toLowerCase().replace(/[^a-z]/g, '').includes(id),
  )
  const visuallyCollapsed = collapsed || foldInner

  return (
    <aside className={`ob-sidebar ${styles.sidebar} ${visuallyCollapsed ? `ob-sidebar--collapsed ${styles.collapsed}` : ''}`} aria-label="Main navigation">
      <div className={styles.brandBlock}>
        <div className={styles.brandMark} aria-hidden="true"><Icon name="brand" size={18} /></div>
        <div className={styles.brandCopy}>
          <div className={styles.wordmark}>PRECIADO<span>TECH</span></div>
          <div className={styles.buildTag}>BUILD // OMNIBRIDGE</div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>PRIMARY</div>
        <nav aria-label="Primary navigation">
          {PRIMARY_NAV.map(item => {
            const active = isRouteActive(pathname, item.href)
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <span className={styles.navIcon}><Icon name={item.icon} size={17} /></span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className={`${styles.section} ${styles.crewSection}`}>
        <div className={styles.sectionLabel}>CREW</div>
        <div className={styles.crewList} aria-label="Crew status">
          {CREW_NAV.map(item => {
            const member = crewMember(item.id)
            const tone = statusTone(member?.status)
            return (
              <div key={item.id} className={styles.crewItem} title={member ? `${item.label}: ${member.status}` : `${item.label}: status unavailable`}>
                <span className={`${styles.statusDot} ${member ? styles[`status_${tone}`] : styles.statusUnknown}`} aria-hidden="true" />
                <span className={styles.crewName}>{item.label}</span>
                <span className={styles.crewStatus}>{member?.status ?? '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.spacer} />

      <div className={styles.footer}>
        <div className={styles.userBlock}>
          <span className={styles.userAvatar} aria-hidden="true">m</span>
          <span className={styles.userCopy}><strong>michael</strong><small>OWNER</small></span>
        </div>
        <button
          type="button"
          className={`${styles.quickGo} ob-btn ob-btn-primary`}
          onClick={() => window.dispatchEvent(new Event('mc:open-cmdp'))}
          title="Open command palette (Ctrl+K)"
        >
          <Icon name="chat" size={15} />
          <span className={styles.quickGoLabel}>QUICK GO</span>
          <kbd>⌘K</kbd>
        </button>
        <button
          type="button"
          className={styles.collapseToggle}
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
