'use client'
import Link from 'next/link'
import { SegBar } from '../charts/SegBar'
import { Divider, Glyph, Kv, KvRow, Prompt, WRow, type GlyphName } from '../ui'
import { BotDesk, isWorking } from './BotDesk'
import { useCrew, type CrewView } from './useCrew'
import styles from './Roster.module.css'

type Row = CrewView['rows'][number]

/** `2d` / `5m` / `now` from an ISO timestamp; empty when there is no evidence to date. */
function shortAge(iso: string | null | undefined, now: number): string {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return ''
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** ▶ confirmed + fresh · ↻ confirmed but stale · × needs intervention · · idle or unknown. */
function glyphFor(row: Row): GlyphName {
  if (row.needsIntervention) return 'fail'
  if (isWorking(row)) return 'run'
  if (row.worker.kind === 'confirmed-worker' && row.worker.freshness === 'stale') return 'retry'
  return 'idle'
}

export function Roster() {
  const view = useCrew()
  const now = Date.now()
  const total = view.counts?.members ?? view.rows.length
  const active = view.active ?? 0
  const needs = view.needsIntervention ?? 0
  const summary = view.rows.length === 0 ? '—' : needs ? `${needs} need you` : active ? `${active} active` : 'all idle'
  return <div className={styles.page}>
    <div className={styles.grid}>
      <section className="mc-widget" aria-label="Agent top">
        <Prompt host="phone" cmd="agent top" />
        <Kv keyWidth="8ch">
          <KvRow k="agents" v={view.rows.length ? total : '—'} r={summary} />
        </Kv>
        <div className={styles.load}>
          <span>load</span>
          <SegBar value={active} max={Math.max(1, total)} segments={16} label="Share of crew actively working" />
          <span>{total ? Math.round((active / total) * 100) : 0}%</span>
        </div>
        <Divider label="agents" />
        {view.error && <WRow g="err" className={styles.alert}>crew refresh: {view.error}{view.lastKnown ? ' · retained observations are stale' : ' · no usable snapshot'}</WRow>}
        {view.rows.length === 0 && !view.error && <WRow g="idle" dim>no crew observations available</WRow>}
        {view.rows.map(row => {
          const task = row.currentTask?.title ?? row.presence.reportedTask
          const age = shortAge(row.worker.sourceAt ?? row.presence.sourceAt, now)
          return <WRow key={row.id} g={glyphFor(row)} dim={glyphFor(row) === 'idle'} right={age} title={task ? `${row.name} — ${task}` : row.name}>
            {row.name}{task ? <span className={styles.rowTask}> {task}</span> : null}
          </WRow>
        })}
        <Prompt host="phone" foot meta={`${view.lastKnown ? 'last known · ' : ''}${view.label}`} />
      </section>
      <BotDesk crew={view} />
    </div>

    {view.rows.length > 0 && <section className="mc-widget" aria-label="Crew evidence">
      <Prompt host="phone" cmd="crew evidence" />
      <p className={styles.note}>Confirmed workers have a task heartbeat within ten minutes and a run ID. Presence is a dated report with a five-minute expiry. Start times, gateways and message history do not establish active work.</p>
      <table className={styles.table}>
        <caption className={styles.sr}>Crew evidence and freshness</caption>
        <thead><tr><th scope="col">Member</th><th scope="col">Reported presence</th><th scope="col">Worker</th><th scope="col">Model observation</th><th scope="col">Current task</th></tr></thead>
        <tbody>{view.rows.map(row => <tr key={row.id} className={`${styles.row} ${row.needsIntervention ? styles.fail : isWorking(row) ? styles.run : styles.idle}`}>
          <th scope="row" data-label="Member"><span className={styles.name}><Glyph g={glyphFor(row)} /> {row.name}</span><span className={styles.detail}>{row.needsIntervention ? 'Needs intervention' : row.kind}</span><span className={styles.detail}>Gateway: {row.gateway.status} · {row.gateway.freshness}{row.gateway.sourceAt ? ` · ${row.gateway.sourceAt}` : ''}</span></th>
          <td data-label="Reported presence"><span className={styles.state}>{row.presence.reportedStatus ?? 'unknown'} · {row.presence.freshness}</span><span className={styles.detail}>{row.presence.sourceAt ?? 'No report'}</span>{row.presence.reason && <span className={styles.detail}>{row.presence.reason}</span>}{row.presence.reportedTask && <span className={styles.detail}>Reported: {row.presence.reportedTask}</span>}</td>
          <td data-label="Worker"><span className={styles.state}>{row.worker.kind} · {row.worker.freshness}</span><span className={styles.detail}>{row.worker.sourceAt ?? 'No worker evidence'}</span><span className={styles.detail}>{row.worker.reason}</span></td>
          <td data-label="Model observation" className={styles.mono}>{row.model.value ?? 'unknown'}<span className={styles.detail}>{row.model.freshness} · {row.model.sourceAt ?? 'No model observation'}</span></td>
          <td data-label="Current task">{row.currentTask ? <><Link href={`/kanban?task=${encodeURIComponent(row.currentTask.id)}`} className={styles.task}>{row.currentTask.title}</Link><span className={styles.detail}>{row.currentTask.status} · {row.worker.kind}</span></> : <span className={styles.detail}>Unknown</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    {!!view.counts?.unassignedTasks && <section className={`mc-widget mc-widget--tight ${styles.unowned}`}>
      <Divider label={`unassigned ${view.counts.unassignedTasks}`} />
      <p>{view.counts.unassignedTasks} open tasks have no owner. <Link href="/kanban">open the board</Link></p>
    </section>}
  </div>
}
