import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import ChatConsole from '@/components/ChatConsole'
import { PageHeader } from '@/components/PageHeader'
import styles from '@/components/AgentConsole.module.css'

const CommandHeader = dynamic(() => import('@/components/views/CommandHeader').then(m => m.CommandHeader))

export const metadata: Metadata = { title: { absolute: 'CHAT' } }

export default function ChatPage() {
  return <div className={styles.page}>
    <CommandHeader />
    <PageHeader eyebrow="~/chat · SIGNAL-STATE" title="CHAT" subtitle="Your bots, and every conversation you've had with them." />
    <ChatConsole />
  </div>
}
