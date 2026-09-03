'use client'

import dynamic from 'next/dynamic'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const BotsPanel = dynamic(() => import('@/components/views/BotsPanel').then(m => m.BotsPanel), { ssr: false })

export default function BotsPage() {
  return (
    <>
      <CommandHeader />
      <BotsPanel />
    </>
  )
}
