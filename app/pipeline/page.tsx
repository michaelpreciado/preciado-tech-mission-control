'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, CardHead } from '@/components/ui'
import { VaultDocuments, VaultDocumentsProvider } from '@/components/VaultDocuments'
import styles from '@/components/Pipeline.module.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const PipelineBoard = dynamic(() => import('@/components/PipelineBoard').then(m => m.PipelineBoard), { ssr: false })

export default function PipelinePage() {
  const [showDocs, setShowDocs] = useState(false)
  return <div className={styles.page}>
    <CommandHeader />
    <PageHeader eyebrow="~/pipeline · FUNNEL-STATE" title="PIPELINE" subtitle="Move clients from first contact to delivery." />
    <VaultDocumentsProvider>
      <PipelineBoard />
      <Card className={styles.documents}>
        <CardHead title="Documents" sub="Client notes and delivery references" right={<Button aria-expanded={showDocs} aria-controls="pipeline-documents" onClick={() => setShowDocs(value => !value)}>{showDocs ? 'Hide' : 'Show'}</Button>} />
        {showDocs && <div id="pipeline-documents"><VaultDocuments /></div>}
      </Card>
    </VaultDocumentsProvider>
  </div>
}
