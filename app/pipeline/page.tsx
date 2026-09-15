'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import { VaultDocuments, VaultDocumentsProvider } from '@/components/VaultDocuments'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const PipelineBoard = dynamic(() => import('@/components/PipelineBoard').then(m => m.PipelineBoard), { ssr: false })

export default function PipelinePage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/pipeline · FUNNEL-STATE" title="PIPELINE" subtitle="Scrape → scaffold → enhance → deploy" />
      <VaultDocumentsProvider>
        <PipelineBoard />
        <VaultDocuments />
      </VaultDocumentsProvider>
    </>
  )
}
