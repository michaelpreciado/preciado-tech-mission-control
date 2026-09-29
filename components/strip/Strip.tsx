import Link from 'next/link'
import type { HermesTask } from '@/lib/types'
import { isUnassigned, stateWord, toneFor, type StripTone } from '@/lib/flight-strip'
import styles from './Strip.module.css'

export type StripProps = {
  tone: StripTone
  callsign: string
  unassigned?: boolean
  title: string
  meta?: string | null
  state: string
  href: string
  /** Render the strip body without its own <li>, for callers that own the list item. */
  asFragment?: boolean
}

/** One flight strip: 3px state rail, dashed-separated callsign, full title, state word. */
export function Strip({ tone, callsign, unassigned, title, meta, state, href, asFragment }: StripProps) {
  const Wrap = asFragment ? 'div' : 'li'
  return (
    <Wrap className={`${styles.strip} ${styles[`tone_${tone}`]}`}>
      <Link href={href} className={styles.link}>
        <span className={`${styles.call} ${unassigned ? styles.none : ''}`}>{callsign}</span>
        <span className={styles.what}>
          <span className={styles.title}>{title}</span>
          {meta && <span className={styles.meta}>{meta}</span>}
        </span>
        <span className={styles.state}>{state}</span>
      </Link>
    </Wrap>
  )
}

export function taskMeta(task: HermesTask): string | null {
  const bits: string[] = []
  if ((task.consecutiveFailures ?? 0) > 0) bits.push(`${task.consecutiveFailures} failed run${task.consecutiveFailures === 1 ? '' : 's'}`)
  if (task.priority) bits.push(`priority ${task.priority}`)
  return bits.length ? bits.join(' · ') : null
}

export function TaskStrip({ task, now }: { task: HermesTask; now: number }) {
  const unassigned = isUnassigned(task.assignee)
  return (
    <Strip
      tone={toneFor(task, now)}
      callsign={unassigned ? 'unassigned' : String(task.assignee)}
      unassigned={unassigned}
      title={task.title}
      meta={taskMeta(task)}
      state={stateWord(task, now)}
      href={`/kanban?task=${encodeURIComponent(task.id)}`}
    />
  )
}

export function StripList({ children, label }: { children: React.ReactNode; label: string }) {
  return <ul className={styles.list} aria-label={label}>{children}</ul>
}

export function StripEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {hint}
    </div>
  )
}
