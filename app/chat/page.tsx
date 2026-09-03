'use client'

import dynamic from 'next/dynamic'
import ChatConsole from '@/components/ChatConsole'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader), { ssr: false })

export default function ChatPage() {
  return (
    <>
      <div className="cockpit-standalone"><CommandHeader /></div>
      <ChatConsole />
    </>
  )
}
