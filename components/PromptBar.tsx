'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLiveData } from './LiveDataProvider'
import { Glyph, type GlyphName } from './ui'
import styles from './PromptBar.module.css'

/* The status line every route sits under: `friday:~$ kanban` on the left,
   live-data state and sync age on the right. Flat, one hairline, no chrome.
   Decorative — the page's own heading carries the route name. */

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? ''

function command(pathname: string) {
  if (pathname === '/') return 'status'
  return pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, ' ')
}

/** Seconds since the last successful sync, re-rendered every second while visible. */
function useAge(since: number | null) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()) }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])
  if (since == null || now == null) return null
  return Math.max(0, Math.round((now - since) / 1000))
}

function fmtAge(sec: number) {
  if (sec < 90) return `${sec}s`
  if (sec < 5400) return `${Math.round(sec / 60)}m`
  return `${Math.round(sec / 3600)}h`
}

const NODE_GLYPH: Record<string, GlyphName> = { connected: 'live', syncing: 'retry', standby: 'idle', degraded: 'fail' }

export function PromptBar() {
  const pathname = usePathname() || '/'
  const { isLive, isLoading, error, lastUpdated } = useLiveData()
  const age = useAge(lastUpdated)
  const node = error ? 'degraded' : isLive ? 'connected' : isLoading ? 'syncing' : 'standby'

  return (
    <div className={styles.bar} aria-hidden="true" data-node={node}>
      <span className={styles.prompt}>
        <span className={styles.host}>friday</span>:~$ <span className={styles.cmd}>{command(pathname)}</span>
      </span>
      <span className={styles.meta}>
        <span className={styles.status}><Glyph g={NODE_GLYPH[node]} /> {node}</span>
        {age != null && <span className={styles.age}>↻ {fmtAge(age)}</span>}
        {BUILD && <span className={styles.build}>build {BUILD}</span>}
      </span>
    </div>
  )
}
