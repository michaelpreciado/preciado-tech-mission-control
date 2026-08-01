'use client'

import dynamic from 'next/dynamic'
import { SectionHead } from '@/components/ui'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })
const ApprovalsInbox = dynamic(() => import('@/components/ApprovalsInbox').then(m => m.ApprovalsInbox), { ssr: false })

export default function ApprovalsPage() {
  return (
    <>
      <CommandHeader />
      <SectionHead label="APPROVALS / EVERYTHING WAITING ON YOU" />
      <ApprovalsInbox />
    </>
  )
}
