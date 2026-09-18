'use client'

import dynamic from 'next/dynamic'
import { Suspense, useState } from 'react'
import { Button, SkeletonPanel } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import styles from '@/components/Kanban.module.css'

const KanbanBoard = dynamic(() => import('@/components/KanbanBoard').then(m => m.KanbanBoard), { loading: () => <SkeletonPanel label="Loading kanban" /> })
const AgentDeck = dynamic(() => import('@/components/AgentDeck'), { loading: () => <SkeletonPanel label="Loading agent deck" /> })
const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader))

export default function KanbanPage() {
  const [token, setToken] = useState('')
  const [showAgents, setShowAgents] = useState(false)
  return (
    <div className={styles.page}>
      <CommandHeader />
      <PageHeader eyebrow="~/kanban · TASK-STATE" title="KANBAN" subtitle="Agent deck and Hermes task state" />
      <section aria-label="Kanban tasks"><Suspense fallback={<SkeletonPanel label="Loading kanban" />}><KanbanBoard token={token} /></Suspense></section>
      <section className={styles.agentSection} aria-label="Agent management">
        <Button className={styles.agentToggle} aria-expanded={showAgents} aria-controls="kanban-agents" onClick={() => setShowAgents(value => !value)}>
          Agents and access <span aria-hidden="true">{showAgents ? '−' : '+'}</span>
        </Button>
        <div id="kanban-agents" hidden={!showAgents}><AgentDeck onCredentialChange={setToken} /></div>
      </section>
    </div>
  )
}
