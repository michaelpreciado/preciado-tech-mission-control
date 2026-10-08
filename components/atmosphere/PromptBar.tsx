'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLiveData } from '../LiveDataProvider'
import styles from './PromptBar.module.css'

/* The window bar every route sits under: traffic lights, a shell prompt whose
   directory follows the route, and a few lines of system texture. Decorative —
   the page's own H1 carries the route name for assistive tech. */

const BUILD = '2026.10'

function directory(pathname: string) {
  if (pathname === '/') return '~/home'
  return `~${pathname.replace(/\/+$/, '')}`
}

function useMinuteClock() {
  const [now, setNow] = useState<string | null>(null)
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    setNow(fmt())
    let interval = 0
    const timeout = window.setTimeout(() => {
      setNow(fmt())
      interval = window.setInterval(() => setNow(fmt()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => { window.clearTimeout(timeout); window.clearInterval(interval) }
  }, [])
  return now
}

export function PromptBar() {
  const pathname = usePathname() || '/'
  const { isLive, isLoading, error } = useLiveData()
  const clock = useMinuteClock()
  const dir = directory(pathname)
  const node = error ? 'degraded' : isLive ? 'connected' : isLoading ? 'syncing' : 'standby'

  return (
    <div className={styles.bar} aria-hidden="true" data-node={node}>
      <span className={styles.lights}>
        <i /><i /><i />
      </span>
      <span className={styles.prompt}>
        <span className={styles.host}>friday@system</span>
        <span className={styles.sep}>:</span>
        <span key={dir} className={styles.dir} style={{ '--n': dir.length } as React.CSSProperties}>{dir}</span>
        <span className={styles.sigil}>$</span>
        <span className={styles.caret} />
      </span>
      <span className={styles.meta}>
        <span className={styles.status}><b className={styles.dot} />node {node}</span>
        <span className={styles.build}>build {BUILD}</span>
        {clock && <span className={styles.clock}>{clock}</span>}
      </span>
    </div>
  )
}
