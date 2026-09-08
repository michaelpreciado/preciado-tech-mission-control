'use client'

import { AsciiKicker, AsciiDivider } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead, SkeletonPanel } from '@/components/ui'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ContentCreationBoard = dynamic(() => import('@/components/ContentCreationBoard').then(m => m.ContentCreationBoard), { ssr: false })
const VideoPromptStudio = dynamic(() => import('@/components/VideoPromptStudio').then(m => m.VideoPromptStudio), { ssr: false, loading: () => <SkeletonShell /> })
const SignalFeed = dynamic(() => import('@/components/SignalFeed').then(m => m.SignalFeed), { ssr: false, loading: () => <SkeletonShell /> })

function SkeletonShell() {
  return <SkeletonPanel label="content module" />
}

export default function ContentCreationPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="CONTENT" detail="IDEA-STATE" />
      <SectionHead label="CONTENT CREATION / IDEA QUEUE" />
      <div className="v3-kicker v4-legacy-kicker"><span className="jp">制作</span> idea queue</div>
      <nav className="w2l-section-nav" aria-label="Content sections">
        <a className="mc-btn" href="#ideas">Ideas</a><a className="mc-btn" href="#studio">Studio</a><a className="mc-btn" href="#signals">Signals</a>
      </nav>
      <section id="ideas" aria-label="Idea queue"><ContentCreationBoard /></section>
      <div className="mc-section-gap"><AsciiDivider /></div>
      <SectionHead label="CONTENT CREATION / PRODUCTION STUDIO" />
      <div className="v3-kicker v4-legacy-kicker"><span className="jp">制作</span> production studio</div>
      <section id="studio" aria-label="Production studio"><VideoPromptStudio /></section>
      <div className="mc-section-gap"><AsciiDivider /></div>
      <SectionHead label="CONTENT CREATION / SIGNAL FEED" />
      <div className="v3-kicker v4-legacy-kicker"><span className="jp">信号</span> interest-matched signal feed</div>
      <section id="signals" aria-label="Signal feed"><SignalFeed /></section>
    </>
  )
}
