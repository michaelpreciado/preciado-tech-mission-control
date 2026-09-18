'use client'

import dynamic from 'next/dynamic'
import ChatConsole from '@/components/ChatConsole'
import { PageHeader } from '@/components/PageHeader'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })

export default function ChatPage() {
  return (
    <>
      <div className="cockpit-standalone"><CommandHeader /></div>
      <PageHeader eyebrow="~/chat · SIGNAL-STATE" title="CHAT" subtitle="Conversation archive and live command console" />
      <ChatConsole />
    </>
  )
}
