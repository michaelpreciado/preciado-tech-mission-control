'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const IdeasPanel = dynamic(() => import('@/components/DashboardViews').then(m => m.IdeasPanel), { ssr: false })

export default function IdeasPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="IDEAS / SCRATCHPAD" />
      <IdeasPanel />
    </>
  )
}
