'use client'
import Link from 'next/link'
import { useCrew } from './useCrew'
import styles from './Roster.module.css'

export function Roster() {
  const view = useCrew()
  return <div className={styles.page}>
    <header className={styles.head}>
      <p className={styles.eyebrow}>Now · Crew</p><h1 className={styles.title}>Crew</h1>
      <p className={styles.sub}>Confirmed workers have a task heartbeat within ten minutes and a run ID. Presence is a dated report with a five-minute expiry. Start times, gateways and message history do not establish active work.</p>
      <p className={styles.note} role="status">{view.lastKnown ? 'Last known · ' : ''}{view.active ?? '—'} active members · {view.needsIntervention ?? '—'} need intervention · {view.label}</p>
    </header>
    {view.error && <p className={styles.note} role="alert">Crew refresh: {view.error}. {view.lastKnown ? 'Retained observations are stale.' : 'No usable snapshot.'}</p>}
    {view.rows.length === 0 && <p className={styles.note}>No crew observations available.</p>}
    {view.rows.length > 0 && <table className={styles.table}>
      <caption className={styles.sr}>Crew evidence and freshness</caption>
      <thead><tr><th scope="col">Member</th><th scope="col">Reported presence</th><th scope="col">Worker</th><th scope="col">Model observation</th><th scope="col">Current task</th></tr></thead>
      <tbody>{view.rows.map(row => <tr key={row.id} className={`${styles.row} ${row.needsIntervention ? styles.you : row.worker.kind === 'confirmed-worker' && row.worker.freshness === 'fresh' ? styles.run : styles.idle}`}>
        <th scope="row" data-label="Member"><span className={styles.name}>{row.name}</span><span className={styles.detail}>{row.needsIntervention ? 'Needs intervention' : row.kind}</span><span className={styles.detail}>Gateway: {row.gateway.status} · {row.gateway.freshness}{row.gateway.sourceAt ? ` · ${row.gateway.sourceAt}` : ''}</span></th>
        <td data-label="Reported presence"><span className={styles.state}>{row.presence.reportedStatus ?? 'unknown'} · {row.presence.freshness}</span><span className={styles.detail}>{row.presence.sourceAt ?? 'No report'}</span>{row.presence.reason && <span className={styles.detail}>{row.presence.reason}</span>}{row.presence.reportedTask && <span className={styles.detail}>Reported: {row.presence.reportedTask}</span>}</td>
        <td data-label="Worker"><span className={styles.state}>{row.worker.kind} · {row.worker.freshness}</span><span className={styles.detail}>{row.worker.sourceAt ?? 'No worker evidence'}</span><span className={styles.detail}>{row.worker.reason}</span></td>
        <td data-label="Model observation" className={styles.mono}>{row.model.value ?? 'unknown'}<span className={styles.detail}>{row.model.freshness} · {row.model.sourceAt ?? 'No model observation'}</span></td>
        <td data-label="Current task">{row.currentTask ? <><Link href={`/kanban?task=${encodeURIComponent(row.currentTask.id)}`} className={styles.task}>{row.currentTask.title}</Link><span className={styles.detail}>{row.currentTask.status} · {row.worker.kind}</span></> : <span className={styles.detail}>Unknown</span>}</td>
      </tr>)}</tbody>
    </table>}
    {!!view.counts?.unassignedTasks && <section className={styles.unowned}><h2>Unassigned</h2><p>{view.counts.unassignedTasks} open tasks have no owner. <Link href="/kanban">Open the board</Link></p></section>}
  </div>
}
