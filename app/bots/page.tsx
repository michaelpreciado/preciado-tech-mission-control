'use client'

import dynamic from 'next/dynamic'
import { SkeletonPanel } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })
const BotsPanel = dynamic(() => import('@/components/views/BotsPanel').then(m => m.BotsPanel), { loading: () => <SkeletonPanel label="loading bots" /> })

export default function BotsPage() {
  return (
    <>
      <CommandHeader />
      <BotsPanel />
    </>
  )
}
