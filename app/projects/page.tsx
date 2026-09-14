'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ProjectGrid = dynamic(() => import('@/components/views/ProjectGrid').then(m => m.ProjectGrid), { ssr: false })

export default function ProjectsPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="PROJECTS" detail="BUILD-STATE" />
      <SectionHead pre={<span className="v2-jp">案件</span>} label="PROJECTS / ACTIVE REPOS" />
      <ProjectGrid />
    </>
  )
}
