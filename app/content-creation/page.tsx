'use client'

import dynamic from 'next/dynamic'
import { Divider, SkeletonPanel } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import styles from '@/components/content.module.css'

const ContentCreationBoard = dynamic(() => import('@/components/ContentCreationBoard').then(m => m.ContentCreationBoard), { ssr: false })
const VideoPromptStudio = dynamic(() => import('@/components/VideoPromptStudio').then(m => m.VideoPromptStudio), { ssr: false, loading: () => <SkeletonShell /> })
const SignalFeed = dynamic(() => import('@/components/SignalFeed').then(m => m.SignalFeed), { ssr: false, loading: () => <SkeletonShell /> })

function SkeletonShell() {
  return <SkeletonPanel label="content module" />
}

export default function ContentCreationPage() {
  return (
    <div className={styles.content}>
      <PageHeader title="CONTENT" subtitle="Idea queue, production studio, and signal feed" />
      <nav className={styles.nav} aria-label="Content sections">
        <a className="ob-btn ob-btn-ghost ob-btn-sm" href="#ideas">Ideas</a><a className="ob-btn ob-btn-ghost ob-btn-sm" href="#studio">Studio</a><a className="ob-btn ob-btn-ghost ob-btn-sm" href="#signals">Signals</a>
      </nav>
      <Divider as="h2" label="content board" />
      <section id="ideas" aria-label="Idea queue"><ContentCreationBoard /></section>
      <Divider as="h2" label="studio" />
      <section id="studio" aria-label="Production studio"><VideoPromptStudio /></section>
      <Divider as="h2" label="signals" />
      <section id="signals" aria-label="Signal feed"><SignalFeed /></section>
    </div>
  )
}
