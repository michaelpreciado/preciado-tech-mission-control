'use client'

import dynamic from 'next/dynamic'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const TickTickCalendar = dynamic(() => import('@/components/TickTickCalendar').then(m => m.TickTickCalendar), { ssr: false })

export default function CalendarPage() {
  return (
    <>
      <CommandHeader />
      <TickTickCalendar />
    </>
  )
}
