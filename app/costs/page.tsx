'use client'

import dynamic from 'next/dynamic'
import { SkeletonPanel } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })
const CostsPanel = dynamic(() => import('@/components/views/CostsPanel').then(m => m.CostsPanel), { loading: () => <SkeletonPanel label="loading costs" /> })

export default function CostsPage() {
  return (
    <div className="mc-costs-page">
      <CommandHeader />
      <PageHeader eyebrow="~/costs · USAGE-STATE" title="COSTS" subtitle="Model usage, billing, and burn" />
      <CostsPanel />
    </div>
  )
}
