'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const SubAgentPanel = dynamic(() => import('@/components/views/SubAgentPanel').then(m => m.SubAgentPanel), { ssr: false })

export default function TeamPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="TEAM / SHIFT ROSTER" />
      <SubAgentPanel />
    </>
  )
}
