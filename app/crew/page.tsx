import { PageHeader } from '@/components/PageHeader'
import { Roster } from '@/components/crew/Roster'

export default function CrewPage() {
  return <>
    <PageHeader title="CREW" subtitle="Who is working right now, and the evidence for it." />
    <Roster />
  </>
}
