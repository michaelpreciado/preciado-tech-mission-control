'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const ProjectGrid = dynamic(() => import('@/components/DashboardViews').then(m => m.ProjectGrid), { ssr: false })

export default function ProjectsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="PROJECTS / ACTIVE REPOS" />
      <ProjectGrid />
    </>
  )
}
