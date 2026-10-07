import { AuroraHome } from '@/components/aurora/AuroraHome'
import { collectAgentTimeline } from '@/lib/agent-timeline'

export const dynamic = 'force-dynamic'

export default function Page() {
  const now = Date.now()
  const d = new Date(now)
  return (
    <AuroraHome
      timeline={collectAgentTimeline(now)}
      dateLabel={d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
      timeLabel={d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
    />
  )
}
