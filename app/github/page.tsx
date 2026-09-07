'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const GithubPanel = dynamic(() => import('@/components/views/GithubPanel').then(m => m.GithubPanel), { ssr: false })

export default function GithubPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="GITHUB" detail="REPO-STATE" />
      <SectionHead pre={<span className="v2-jp">貢献</span>} label="GITHUB / CONTRIBUTION GRAPH" />
      <GithubPanel />
    </>
  )
}
