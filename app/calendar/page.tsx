'use client'

import { AsciiKicker } from '../vf/Ascii'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const TickTickCalendar = dynamic(() => import('@/components/TickTickCalendar').then(m => m.TickTickCalendar), { ssr: false })

export default function CalendarPage() {
  return (
    <>
      <CommandHeader />
      <AsciiKicker view="CALENDAR" detail="WEEK-STATE" />
      <SectionHead label="CALENDAR / TICKTICK WEEK" />
      <div className="v3-kicker v4-legacy-kicker"><span className="jp">暦</span> ticktick week</div>
      <TickTickCalendar />
    </>
  )
}