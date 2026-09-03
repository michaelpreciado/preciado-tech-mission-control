'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ProjectGrid = dynamic(() => import('@/components/views/ProjectGrid').then(m => m.ProjectGrid), { ssr: false })

export default function ProjectsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead pre={<span className="v2-jp">案件</span>} label="PROJECTS / ACTIVE REPOS" />
      <ProjectGrid />
    </>
  )
}
