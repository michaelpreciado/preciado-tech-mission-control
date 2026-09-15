'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const GithubPanel = dynamic(() => import('@/components/views/GithubPanel').then(m => m.GithubPanel), { ssr: false })

export default function GithubPage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/github · REPO-STATE" title="GITHUB" subtitle="Contribution graph and repository activity" />
      <GithubPanel />
    </>
  )
}
