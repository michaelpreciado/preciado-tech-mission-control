'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useLiveData } from './LiveDataProvider'
import styles from './NeuralUplink.module.css'

/** Decorative orbital geometry surrounds real, actionable mission telemetry. */
export function NeuralUplink() {
  const { data, isLive } = useLiveData()
  const root = useRef<HTMLElement>(null)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    let visible = false
    const sync = () => setMoving(visible && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    if (root.current) observer.observe(root.current)
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  const active = data?.crew?.filter(agent => agent.status === 'active').length
  const tasks = data?.kanban?.openTasks ?? data?.counts.openTasks

  return (
    <section ref={root} className={styles.uplink} data-moving={moving} aria-label="Neural uplink">
      <Image className={styles.art} src="/visuals/neural-reactor.webp" alt="" fill sizes="(max-width: 1180px) 100vw, 1180px" priority />
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.copy}>
        <div className={styles.eyebrow}><span className={styles.beacon} data-live={isLive} />NEURAL UPLINK</div>
        <h2>Your mission. In motion.</h2>
        <p>{isLive ? 'Connected to your command network.' : 'Awaiting connection to your command network.'}</p>
        <div className={styles.metrics}>
          <Link href="/bots"><strong>{active ?? '—'}</strong><span>active agents</span><i aria-hidden="true">↗</i></Link>
          <Link href="/kanban"><strong>{tasks ?? '—'}</strong><span>open tasks</span><i aria-hidden="true">↗</i></Link>
        </div>
      </div>
      <div className={styles.reactor} aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.orbit}><b /><b /><b /></div>
        <div className={styles.scan} />
        <span className={styles.caption}>{isLive ? 'SIGNAL CONNECTED' : 'SIGNAL STANDBY'}</span>
      </div>
      <span className={styles.corner} aria-hidden="true">MC / 01</span>
    </section>
  )
}
