'use client'

import { useState, type CSSProperties } from 'react'
import { THEME_CSS_VARIABLES } from '@/lib/pt/theme'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Prompt } from '@/components/ui'
import { VaultDocuments, VaultDocumentsProvider } from '@/components/VaultDocuments'
import styles from '@/components/Pipeline.module.css'

const PipelineBoard = dynamic(() => import('@/components/PipelineBoard').then(m => m.PipelineBoard), { ssr: false })

export default function PipelinePage() {
  const [showDocs, setShowDocs] = useState(false)
  return <div className={`${styles.page} ${styles.radar}`} style={THEME_CSS_VARIABLES as CSSProperties}>
    <PageHeader title="PIPELINE" subtitle="Pipeline evidence, decisions, and dated progress." />
    <VaultDocumentsProvider>
      <PipelineBoard />
      <Card className={styles.documents}>
        <Prompt host="desk" cmd="documents" meta={<Button aria-expanded={showDocs} aria-controls="pipeline-documents" onClick={() => setShowDocs(value => !value)}>{showDocs ? 'hide' : 'show'}</Button>} />
        {showDocs && <div id="pipeline-documents"><VaultDocuments /></div>}
      </Card>
    </VaultDocumentsProvider>
  </div>
}
