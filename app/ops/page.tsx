'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/DashboardViews').then(m => m.CommandHeader), { ssr: false })
const OperationsPanel = dynamic(() => import('@/components/DashboardViews').then(m => m.OperationsPanel), { ssr: false })
const SystemHealthPanel = dynamic(() => import('@/components/SystemHealthPanel').then(m => m.SystemHealthPanel), { ssr: false })

export default function OpsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="OPS / SYSTEM HEALTH" />
      <SystemHealthPanel />
      <SectionHead label="OPS / SYSTEM CHANNELS" />
      <OperationsPanel />
    </>
  )
}
