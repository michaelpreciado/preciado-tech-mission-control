'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const KanbanBoard = dynamic(() => import('@/components/KanbanBoard').then(m => m.KanbanBoard), { ssr: false })
const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })

export default function KanbanPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead pre={<span className="v2-jp">任務</span>} label="HERMES KANBAN · MIRROR" />
      <KanbanBoard />
    </>
  )
}
