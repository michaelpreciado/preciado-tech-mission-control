'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { SkeletonPanel } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v2-lane.css'
import './deck.css'

const KanbanBoard = dynamic(() => import('@/components/KanbanBoard').then(m => m.KanbanBoard), { loading: () => <SkeletonPanel label="loading kanban" /> })
const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })
const AgentDeck = dynamic(() => import('@/components/AgentDeck'), { loading: () => <SkeletonPanel label="loading agent deck" /> })

export default function KanbanPage() {
  const [token, setToken] = useState('')
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/kanban · TASK-STATE" title="KANBAN" subtitle="Agent deck and Hermes task state" />
      <div className="mc-command-deck">
        <AgentDeck onCredentialChange={setToken} />
        <section className="mc-command-tasks" aria-label="Kanban tasks"><KanbanBoard token={token} /></section>
      </div>
    </>
  )
}
