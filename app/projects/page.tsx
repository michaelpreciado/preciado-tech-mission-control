'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v2-lane.css'

const ProjectGrid = dynamic(() => import('@/components/views/ProjectGrid').then(m => m.ProjectGrid), { ssr: false })

export default function ProjectsPage() {
  return (
    <>
      <PageHeader eyebrow="~/clients · BUILD-STATE" title="CLIENTS" subtitle="Active client workspaces and delivery repos" />
      <ProjectGrid />
    </>
  )
}
