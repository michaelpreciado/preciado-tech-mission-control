'use client'

import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/PageHeader'
import '../vf/v3-lane.css'

const TickTickCalendar = dynamic(() => import('@/components/TickTickCalendar').then(m => m.TickTickCalendar), { ssr: false })

export default function CalendarPage() {
  return (
    <>
      <PageHeader eyebrow="~/calendar · WEEK-STATE" title="CALENDAR" subtitle="TickTick week and scheduled work" />
      <TickTickCalendar />
    </>
  )
}
