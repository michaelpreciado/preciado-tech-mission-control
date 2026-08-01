'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const MemoryStream = dynamic(() => import('@/components/views/MemoryStream').then(m => m.MemoryStream), { ssr: false })

export default function MemoryPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="MEMORY / RECENT PROMOTIONS" />
      <MemoryStream />
    </>
  )
}
