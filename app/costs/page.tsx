'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const CostsPanel = dynamic(() => import('@/components/views/CostsPanel').then(m => m.CostsPanel), { ssr: false })

export default function CostsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="COSTS / MODEL USAGE" />
      <CostsPanel />
    </>
  )
}
