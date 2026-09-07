'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const PipelineBoard = dynamic(() => import('@/components/PipelineBoard').then(m => m.PipelineBoard), { ssr: false })

export default function PipelinePage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="PIPELINE" detail="FUNNEL-STATE" framed />
      <SectionHead pre={<span className="v2-jp">開発</span>} label="WEB DEV PIPELINE / SCRAPE → SCAFFOLD → ENHANCE → DEPLOY" />
      <PipelineBoard />
    </>
  )
}
