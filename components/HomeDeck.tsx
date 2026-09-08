'use client'

import { AsciiPortrait } from '@/app/vf/Ascii'
import { NeuralUplink } from './NeuralUplink'
import { ActionFeed } from './ActionFeed'
import { HomeChat } from './HomeChat'
import { HomeTasks } from './HomeTasks'
import { HomeSystem } from './HomeSystem'
import styles from './HomeWorkspace.module.css'

/** Home's reading order: hero → urgent → conversation → work → system metrics. */
export function HomeDeck() {
  return <div className={`${styles.home} mc-home-workspace`}>
    <NeuralUplink portraitArt={<AsciiPortrait />} />
    <div className={styles.topbar}>
      <button className={styles.menuButton} aria-label="Open navigation tabs" onClick={() => window.dispatchEvent(new Event('mc:open-home-nav'))}>☰</button>
      <ActionFeed compact />
    </div>
    <HomeChat />
    <HomeTasks />
    <HomeSystem />
  </div>
}
