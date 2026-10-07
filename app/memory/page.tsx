'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v3-lane.css'

const MemoryGraphView = dynamic(() => import('@/components/views/MemoryGraph').then(m => m.MemoryGraphView), { ssr: false })

export default function MemoryPage() {
  return (
    <>
      <PageHeader eyebrow="~/memory · VAULT-STATE" title="MEMORY" subtitle="Memory graph, vault index, and operational context" />
      <MemoryGraphView />
    </>
  )
}
