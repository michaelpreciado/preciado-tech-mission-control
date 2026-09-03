'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const CostsPanel = dynamic(() => import('@/components/views/CostsPanel').then(m => m.CostsPanel), { ssr: false })

export default function CostsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead pre={<span className="v2-jp">費用</span>} label="COSTS / MODEL USAGE" />
      <CostsPanel />
    </>
  )
}
