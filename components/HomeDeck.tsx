'use client'

import { AsciiPortrait } from '@/app/vf/Ascii'
import { NeuralUplink } from './NeuralUplink'
import { ActionFeed } from './ActionFeed'
import { HomeChat } from './HomeChat'
import { RevenuePipeline } from './RevenuePipeline'
import { HomeTasks } from './HomeTasks'
import { HomeSystem } from './HomeSystem'
import styles from './HomeWorkspace.module.css'

/** Home's reading order: hero → urgent → conversation → revenue → work → system metrics. */
export function HomeDeck() {
  return <div className={`${styles.home} mc-home-workspace`}>
    <nav className="w2l-home-jumps" aria-label="Home sections"><a className="mc-btn" href="#home-conversation">Chat ↓</a><a className="mc-btn" href="#home-revenue">Revenue ↓</a><a className="mc-btn" href="#home-open-tasks">Tasks ↓</a></nav>
    <NeuralUplink portraitArt={<AsciiPortrait />} />
    <div className={styles.topbar}>
      <button className={styles.menuButton} aria-label="Open navigation tabs" onClick={() => window.dispatchEvent(new Event('mc:open-home-nav'))}>☰</button>
      <ActionFeed compact />
    </div>
    <HomeChat />
    <RevenuePipeline />
    <div className={styles.overview}><HomeTasks /><HomeSystem /></div>
  </div>
}
