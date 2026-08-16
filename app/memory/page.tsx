'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const MemoryGraphView = dynamic(() => import('@/components/views/MemoryGraph').then(m => m.MemoryGraphView), { ssr: false })

export default function MemoryPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="MEMORY / VAULT GRAPH" />
      <MemoryGraphView />
    </>
  )
}
