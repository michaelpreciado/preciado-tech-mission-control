'use client'

import dynamic from 'next/dynamic'

const SchedulerView = dynamic(() => import('@/components/DashboardViews').then(m => m.SchedulerView), { ssr: false })

export default function CalendarPage() {
  return <SchedulerView />
}
