'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const PipelineBoard = dynamic(() => import('@/components/PipelineBoard').then(m => m.PipelineBoard), { ssr: false })

export default function PipelinePage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="WEB DEV PIPELINE / SCRAPE → SCAFFOLD → ENHANCE → DEPLOY" />
      <PipelineBoard />
    </>
  )
}
