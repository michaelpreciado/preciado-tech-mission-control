'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const AgentOffice = dynamic(() => import('@/components/AgentOffice').then(m => m.AgentOffice), { ssr: false })
const AgentCardGrid = dynamic(() => import('@/components/views/AgentViews').then(m => m.AgentCardGrid), { ssr: false })
const SubAgentPanel = dynamic(() => import('@/components/views/SubAgentPanel').then(m => m.SubAgentPanel), { ssr: false })

export default function TeamPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="TEAM / SUB-AGENT MESH" />
      <SubAgentPanel />
      <SectionHead label="TEAM / LIVE FLOOR" />
      <AgentOffice />
      <SectionHead label="TEAM / ROSTER" />
      <AgentCardGrid />
    </>
  )
}
