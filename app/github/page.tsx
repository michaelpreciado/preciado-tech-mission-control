'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const GithubPanel = dynamic(() => import('@/components/views/GithubPanel').then(m => m.GithubPanel), { ssr: false })

export default function GithubPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="GITHUB / CONTRIBUTION GRAPH" />
      <GithubPanel />
    </>
  )
}
