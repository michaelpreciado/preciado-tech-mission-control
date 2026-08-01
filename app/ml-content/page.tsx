'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const MLContentBoard = dynamic(() => import('@/components/MLContentBoard').then(m => m.MLContentBoard), { ssr: false })

export default function MLContentPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="ML CONTENT / SCRIPT → FILM → EDIT → POST" />
      <MLContentBoard />
    </>
  )
}
