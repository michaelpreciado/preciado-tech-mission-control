'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead, SkeletonPanel } from '@/components/ui'
import '../vf/v2-lane.css'

const KanbanBoard = dynamic(() => import('@/components/KanbanBoard').then(m => m.KanbanBoard), { loading: () => <SkeletonPanel label="loading kanban" /> })
const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })

export default function KanbanPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="KANBAN" detail="TASK-STATE" />
      <SectionHead pre={<span className="v2-jp">任務</span>} label="HERMES KANBAN · MIRROR" />
      <KanbanBoard />
    </>
  )
}
