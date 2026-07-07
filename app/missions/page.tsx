'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const MissionsPanel = dynamic(() => import('@/components/DashboardViews').then(m => m.MissionsPanel), { ssr: false })

export default function MissionsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="MISSIONS / IN FLIGHT" />
      <MissionsPanel />
    </>
  )
}
