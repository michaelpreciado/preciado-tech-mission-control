'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ProjectGrid = dynamic(() => import('@/components/views/ProjectGrid').then(m => m.ProjectGrid), { ssr: false })

export default function ProjectsPage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/clients · BUILD-STATE" title="CLIENTS" subtitle="Active client workspaces and delivery repos" />
      <ProjectGrid />
    </>
  )
}
