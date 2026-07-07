'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const TaskBoard = dynamic(() => import('@/components/DashboardViews').then(m => m.TaskBoard), { ssr: false })
const HermesKanban = dynamic(() => import('@/components/HermesKanban').then(m => m.HermesKanban), { ssr: false })

export default function TasksPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="TASKS / CREW QUEUE" />
      <TaskBoard />
      <SectionHead label="TASKS / HERMES MULTI-AGENT KANBAN" />
      <HermesKanban />
    </>
  )
}
