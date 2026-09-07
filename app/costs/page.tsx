'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead, SkeletonPanel } from '@/components/ui'
import '../vf/v2-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { loading: () => <SkeletonPanel label="loading header" /> })
const CostsPanel = dynamic(() => import('@/components/views/CostsPanel').then(m => m.CostsPanel), { loading: () => <SkeletonPanel label="loading costs" /> })

export default function CostsPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="COSTS" detail="BURN-STATE" />
      <SectionHead pre={<span className="v2-jp">費用</span>} label="COSTS / MODEL USAGE" />
      <CostsPanel />
    </>
  )
}
