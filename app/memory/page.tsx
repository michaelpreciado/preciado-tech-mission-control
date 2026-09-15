'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const MemoryGraphView = dynamic(() => import('@/components/views/MemoryGraph').then(m => m.MemoryGraphView), { ssr: false })

export default function MemoryPage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/system · VAULT-STATE" title="SYSTEM" subtitle="Memory graph, vault index, and operational context" />
      <MemoryGraphView />
    </>
  )
}
