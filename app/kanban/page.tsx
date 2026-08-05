'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const KanbanBoard = dynamic(() => import('@/components/KanbanBoard').then(m => m.KanbanBoard), { ssr: false })

export default function KanbanPage() {
  return (
    <>
      <SectionHead label="HERMES KANBAN · MIRROR" />
      <KanbanBoard />
    </>
  )
}
