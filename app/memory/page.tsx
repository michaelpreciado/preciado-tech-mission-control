'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const MemoryGraphView = dynamic(() => import('@/components/views/MemoryGraph').then(m => m.MemoryGraphView), { ssr: false })

export default function MemoryPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="MEMORY" detail="VAULT-STATE" />
      <SectionHead label="MEMORY / VAULT GRAPH" />
      <div className="v3-kicker v4-legacy-kicker"><span className="jp">記憶</span> vault graph</div>
      <MemoryGraphView />
    </>
  )
}
