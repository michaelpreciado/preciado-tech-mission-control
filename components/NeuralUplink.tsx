'use client'

import Link from 'next/link'
import Image from 'next/image'
import { type ReactNode } from 'react'
import { useLiveData } from './LiveDataProvider'
import styles from './NeuralUplink.module.css'

/** A single compositor-only scan sweep decorates real, actionable mission telemetry. */
export function NeuralUplink({ portraitArt }: { portraitArt?: ReactNode }) {
  const { data, isLive } = useLiveData()
  const active = data?.crew?.filter(agent => agent.status === 'active').length
  const tasks = data?.kanban?.openTasks ?? data?.counts.openTasks

  return (
    <section className={styles.uplink} data-motion-widget aria-label="Neural uplink">
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
      <div className={styles.reactor}>
        <div className={styles.halo} />
        <div className={styles.portraitArt} aria-hidden="true">{portraitArt}</div>
        <picture className={styles.portrait}>
          <source media="(max-width: 820px)" srcSet="/brand/michael-profile.jpg" />
          <Image src="/brand/mp.jpeg" alt="Michael Preciado" width={160} height={160} priority />
        </picture>
        <div className={styles.scan} aria-hidden="true" />
        <span className={styles.caption}>{isLive ? 'SIGNAL CONNECTED' : 'SIGNAL STANDBY'}</span>
      </div>
      <span className={styles.corner} aria-hidden="true">MC / 01</span>
    </section>
  )
}
