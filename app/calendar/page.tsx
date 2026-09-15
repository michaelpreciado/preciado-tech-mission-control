'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v3-lane.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const TickTickCalendar = dynamic(() => import('@/components/TickTickCalendar').then(m => m.TickTickCalendar), { ssr: false })

export default function CalendarPage() {
  return (
    <>
      <CommandHeader />
      <PageHeader eyebrow="~/calendar · WEEK-STATE" title="CALENDAR" subtitle="TickTick week and scheduled work" />
      <TickTickCalendar />
    </>
  )
}
