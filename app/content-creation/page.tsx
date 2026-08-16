'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ContentCreationBoard = dynamic(() => import('@/components/ContentCreationBoard').then(m => m.ContentCreationBoard), { ssr: false })

export default function ContentCreationPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="CONTENT CREATION / IDEA INSPIRATION" />
      <ContentCreationBoard />
    </>
  )
}
