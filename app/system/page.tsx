'use client'

import dynamic from 'next/dynamic'
import { Card } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import styles from '@/components/system.module.css'

const SystemPage = dynamic(() => import('@/components/views/SystemPage'), {
  loading: () => <Card pad="md" role="status" aria-live="polite">Loading system…</Card>,
})

export default function SystemRoute() {
  return <div className={styles.page}>
    <PageHeader host="friday" command="uname -n" eyebrow="rig state" title="system" subtitle="This machine, its services, and the health of your data." />
    <SystemPage />
  </div>
}
