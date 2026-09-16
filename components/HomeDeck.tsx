'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { AsciiPortrait } from '@/app/vf/Ascii'
import { useLiveData } from './LiveDataProvider'
import { NeuralUplink } from './NeuralUplink'
import { ActionFeed } from './ActionFeed'
import { HomeChat } from './HomeChat'
import { RevenuePipeline } from './RevenuePipeline'
import { HomeTasks } from './HomeTasks'
import { HomeSystem } from './HomeSystem'
import { GithubPanel } from './views/GithubPanel'
import { BracketFrame } from './BracketFrame'
import { CountUp } from './CountUp'
import styles from './HomeWorkspace.module.css'

const HomeCoreOrb = dynamic(() => import('./CoreOrb'), { ssr: false })

function CardHeader({ label, meta, href }: { label: string; meta?: string; href?: string }) {
  return <div className={styles.obCardHeader}>
    <strong>{label}</strong>
    {meta && <span>{meta}</span>}
    {href && <Link href={href} aria-label={`Open ${label.toLowerCase()}`}>↗</Link>}
  </div>
}

function CrewCard() {
  const { data, isLive } = useLiveData()
  const crew = data?.crew ?? []
  return <section className={`${styles.obCard} ${styles.obCrewCard}`} aria-labelledby="ob-crew-title">
    <CardHeader label="CREW STATUS" meta={isLive ? `${crew.length}/LINKED` : 'SYNCING'} />
    <div className={styles.obCardBody}>
      {crew.length === 0 && <span className={styles.obMuted}>Awaiting crew signal…</span>}
      {crew.slice(0, 5).map(member => <div className={styles.obListRow} key={member.id}>
        <span className={styles.obNode} data-state={member.status} aria-hidden="true" />
        <span className={styles.obListMain}><b>{member.name.toUpperCase()}</b><small>{member.role}</small></span>
        <em data-state={member.status}>{member.status === 'attention' ? 'WATCH' : member.status.toUpperCase()}</em>
      </div>)}
    </div>
  </section>
}

function TelemetryCard() {
  const { data } = useLiveData()
  const telemetry = data?.telemetry
  const cpu = telemetry?.cpu
  const memory = telemetry?.memory
  const memoryPct = memory && memory.totalKb > 0 ? Math.round((1 - memory.availableKb / memory.totalKb) * 100) : null
  const lines = data ? [
    `cpu   ${cpu ? `${cpu.load1.toFixed(2)} load` : '—'}`,
    `cores ${cpu?.cores ?? '—'} online`,
    `mem   ${memoryPct == null ? '—' : `${memoryPct}% used`}`,
  ] : ['uplink awaiting mission data…']
  return <section id="home-telemetry" className={`${styles.obCard} ${styles.obTelemetryCard}`} aria-labelledby="ob-telemetry-title">
    <BracketFrame />
    <CardHeader label="UPLINK TELEMETRY" meta="ASCII BUS" />
    <div className={styles.obTelemetryBody}>
      <pre className={styles.obAscii} aria-hidden="true">{lines.join('\n')}</pre>
      <div className={styles.obReadouts}>
        <span>LOAD <b>{cpu ? <CountUp value={cpu.load1} decimals={2} /> : '—'}</b></span>
        <span>CORES <b>{cpu?.cores == null ? '—' : <CountUp value={cpu.cores} />}</b></span>
        <span>MEM <b>{memoryPct == null ? '—' : <CountUp value={memoryPct} suffix="%" />}</b></span>
        <span>OPEN TASKS <b>{data ? <CountUp value={data.counts.openTasks} /> : '—'}</b></span>
      </div>
    </div>
  </section>
}

function FinanceCard() {
  const { data } = useLiveData()
  const costs = data?.costs
  const amount = costs?.meteredCostUsd ?? costs?.estimatedCostUsd
  return <section className={`${styles.obCard} ${styles.obFinanceCard}`} aria-labelledby="ob-finance-title">
    <BracketFrame />
    <CardHeader label="FINANCE" meta={costs ? `${costs.dailyWindowDays}D WINDOW` : 'SYNCING'} href="/costs" />
    <div className={styles.obFinanceBody}>
      <strong>{amount == null ? '—' : <CountUp value={amount} prefix="$" decimals={2} />}</strong>
      <span>{costs ? `${costs.totalRequests.toLocaleString()} requests · ${costs.dailyWindowDays}d window` : 'Loading ledger…'}</span>
      <small>metered usage · <Link href="/costs">OPEN COST LEDGER ↗</Link></small>
    </div>
  </section>
}

function DatastreamCard() {
  const { data } = useLiveData()
  const warningCount = data ? data.warnings.length + Object.keys(data.collectorErrors ?? {}).length : null
  const lines = data ? [
    `crew  ${data.crew.length.toString().padStart(2, '0')} linked`,
    `tasks ${data.counts.openTasks.toString().padStart(2, '0')} open`,
    `cron  ${data.counts.enabledCronJobs.toString().padStart(2, '0')} enabled`,
    `vault ${data.counts.vaultMarkdown.toString().padStart(2, '0')} indexed`,
    `warn  ${warningCount?.toString().padStart(2, '0') ?? '—'} raised`,
  ] : ['connecting to mission bus…']
  return <section className={`${styles.obCard} ${styles.obDatastream}`} aria-labelledby="ob-datastream-title">
    <CardHeader label="DATASTREAM" meta="RAW" />
    <pre className={styles.obAscii}>{lines.join('\n')}</pre>
  </section>
}

/** OmniBridge shell: all data panels remain the existing polling components. */
export function HomeDeck() {
  const { data, isLive, isLoading, eventStream } = useLiveData()
  const collectorErrorCount = Object.keys(data?.collectorErrors ?? {}).length
  const warningCount = (data?.warnings.length ?? 0) + collectorErrorCount
  const systemLabel = !data ? (isLoading ? 'SYNCING MISSION DATA' : 'MISSION DATA OFFLINE') : isLive ? (warningCount ? `${warningCount} WARNINGS` : 'ALL SYSTEMS NOMINAL') : 'MISSION DATA STALE'
  const syncLabel = data?.generatedAt ? `SYNC ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'SYNCING'
  const githubWeeks = data?.github?.weeks?.length
  const githubMeta = data?.github?.syncedAt ? 'SYNCED' : data ? 'SYNC UNKNOWN' : 'SYNCING'
  return <div className={`${styles.home} mc-home-workspace ob-home`}>
    <nav className={styles.obJumps} aria-label="Home sections">
      <a href="#home-mission-feed">Feed ↓</a><a href="#home-open-tasks">Tasks ↓</a><a href="#home-telemetry">Telemetry ↓</a>
    </nav>
    <header className={styles.obHeader}>
      <div className={styles.obHeaderBrand}><span className={styles.obHeaderDots}>● ● ●</span><b>PRECIADO<span>TECH</span></b><small>michael@preciado-tech:~<i>/mission-control</i></small></div>
      <div className={styles.obHeaderStatus}><span><i className={styles.obLed} /> {systemLabel}</span><span>{syncLabel}</span><button onClick={() => window.dispatchEvent(new Event('mc:open-cmdp'))}>QUICK GO <kbd>⌘K</kbd></button></div>
      <ActionFeed compact />
    </header>

    <HomeChat />

    <div className={styles.obGrid}>
      <aside className={styles.obRail} aria-label="Mission overview">
        <CrewCard />
        <div className={`${styles.obCard} ${styles.obSystemCard}`}><HomeSystem /></div>
        <div className={`${styles.obCard} ${styles.obTasksCard}`}><HomeTasks /></div>
        <div className={styles.obUplink}><NeuralUplink portraitArt={<AsciiPortrait />} /></div>
        <div className={styles.obOrbDock}>
          <div className={styles.obOrbStage}><BracketFrame /><HomeCoreOrb placement="desktop" /></div>
          <span className={styles.obOrbLabel}>NEURAL CORE</span>
        </div>
      </aside>

      <main className={styles.obCenter}>
        <section id="home-mission-feed" className={`${styles.obCard} ${styles.obMissionCard}`} aria-label="Mission feed">
          <CardHeader label="MISSION FEED" meta={`/var/log/mission · ${eventStream.toUpperCase()}`} />
          <ActionFeed />
        </section>
        <div className={styles.obMetricRow}><TelemetryCard /><FinanceCard /></div>
      </main>

      <aside className={styles.obRail} aria-label="Mission signals">
        <section className={`${styles.obCard} ${styles.obPipelineCard}`} aria-label="Revenue pipeline"><CardHeader label="PIPELINE" meta="POLLING" href="/pipeline" /><RevenuePipeline /></section>
        <section className={`${styles.obCard} ${styles.obGithubCard}`} aria-label="GitHub activity"><CardHeader label={`GITHUB · ${githubWeeks ?? '—'}WK`} meta={githubMeta} href="/github" /><GithubPanel /></section>
        <DatastreamCard />
      </aside>
    </div>

  </div>
}
