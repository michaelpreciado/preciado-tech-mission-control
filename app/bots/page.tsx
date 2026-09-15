'use client'

import dynamic from 'next/dynamic'
import { SkeletonPanel } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })
const BotsPanel = dynamic(() => import('@/components/views/BotsPanel').then(m => m.BotsPanel), { loading: () => <SkeletonPanel label="loading bots" /> })

export default function BotsPage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="CREW · CREW-STATE" title="BOTS" subtitle="Connected agent roster and controls" />
      <BotsPanel />
    </>
  )
}
