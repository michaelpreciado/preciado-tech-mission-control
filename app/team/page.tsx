'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const SubAgentPanel = dynamic(() => import('@/components/views/SubAgentPanel').then(m => m.SubAgentPanel), { ssr: false })

export default function TeamPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="TEAM / SHIFT ROSTER" />
      <div className="v3-kicker"><span className="jp">班</span> shift roster</div>
      <SubAgentPanel />
    </>
  )
}
