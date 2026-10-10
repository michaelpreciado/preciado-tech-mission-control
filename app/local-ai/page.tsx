'use client'

import dynamic from 'next/dynamic'
import { Card } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import styles from '@/components/system.module.css'

const LocalAiPage = dynamic(() => import('@/components/views/LocalAiPage'), {
  loading: () => <Card pad="md" role="status" aria-live="polite">Loading local AI…</Card>,
})

export default function LocalAiRoute() {
  return <div className={styles.page}>
    <PageHeader eyebrow="~/local-ai · RESIDENCY" title="LOCAL AI" subtitle="Models, engines and GPU residency on this machine, read live and never assumed." />
    <LocalAiPage />
  </div>
}
