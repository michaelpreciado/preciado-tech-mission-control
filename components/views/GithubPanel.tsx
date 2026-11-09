'use client'

import { useLiveData } from '../LiveDataProvider'
import { Divider, EmptyTerminal, Glyph, Prompt, SkeletonPanel, fmtDate } from '../ui'
import { Heatmap } from '../Viz'
import { AsciiBars } from '../ascii-viz'
import { ConnectCard } from './shared'
import styles from '../github.module.css'

/* ── GitHub Panel ─────────────────────────────────────── */

/* Language colours are identity colours (GitHub's own), not theme colours. */
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', HTML: '#e34c26',
  CSS: '#563d7c', Swift: '#F05138', Shell: '#89e051', Rust: '#dea584', Go: '#00ADD8',
}

const EVENT_LABELS: Record<string, { label: string; glyph: string }> = {
  PushEvent: { label: 'push', glyph: '↑' },
  CreateEvent: { label: 'create', glyph: '＋' },
  DeleteEvent: { label: 'delete', glyph: '✕' },
  PullRequestEvent: { label: 'pull request', glyph: '⇄' },
  PullRequestReviewEvent: { label: 'pr review', glyph: '◎' },
  IssuesEvent: { label: 'issue', glyph: '◉' },
  IssueCommentEvent: { label: 'comment', glyph: '✎' },
  WatchEvent: { label: 'star', glyph: '★' },
  ForkEvent: { label: 'fork', glyph: '⑂' },
  ReleaseEvent: { label: 'release', glyph: '◆' },
  PublicEvent: { label: 'made public', glyph: '◇' },
}

function pushedAgo(iso?: string): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `${Math.max(1, min)}m ago`
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`
  if (min < 60 * 24 * 30) return `${Math.round(min / 1440)}d ago`
  return `${Math.round(min / 43200)}mo ago`
}

export function GithubPanel() {
  const { data } = useLiveData()
  if (!data) return <SkeletonPanel label="loading github" />

  const gh = data.github
  if (!gh) return <EmptyTerminal label="no github data" />
  if (!gh.username) {
    return <ConnectCard name="GitHub" hint="Set your GitHub username in Setup (and authenticate the gh CLI) to light up the contributions heatmap and repo grid." />
  }

  const weeks = gh.weeks ?? []
  // Use GitHub's own quartile level so colors match the real profile graph;
  // fall back to a count cap only for legacy data without levels.
  const heatData = weeks.map(w => w.contributionDays.map(d => d.level ?? Math.min(4, d.contributionCount)))
  const total = gh.totalContributions ?? weeks.flatMap(w => w.contributionDays).reduce((a, d) => a + d.contributionCount, 0)
  const streak = gh.currentStreak ?? 0
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Month labels derived from the actual rolling-year window (GitHub places a
  // label above the first column of each month).
  const monthLabels: { label: string; weekIndex: number }[] = []
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0]
    if (!first) return
    const m = new Date(first.date).getUTCMonth()
    const prev = monthLabels[monthLabels.length - 1]
    if ((!prev || MONTHS[m] !== prev.label) && wi < weeks.length - 1) {
      monthLabels.push({ label: MONTHS[m], weekIndex: wi })
    }
  })

  // Relative sync age for the contributions Window meta. GitHub data refreshes
  // slowly, so only flag `is-stale` (amber) once it's older than ~24h.
  const ghSyncAgo = pushedAgo(gh.syncedAt)
  const ghSyncStale = !!gh.syncedAt && Date.now() - new Date(gh.syncedAt).getTime() > 86_400_000

  const activityCounts = new Map<string, number>()
  for (const event of gh.recentEvents ?? []) {
    activityCounts.set(event.repo, (activityCounts.get(event.repo) ?? 0) + 1)
  }
  const topActivity = [...activityCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
  const repos = gh.repos ?? []
  const totalStars = repos.reduce((s, r) => s + r.stars, 0)
  const totalIssues = repos.reduce((s, r) => s + r.openIssues, 0)
  const totalPrs = repos.reduce((s, r) => s + (r.openPrs ?? 0), 0)
  // Contributions in the last 30 days from the calendar tail
  const last30 = weeks.flatMap(w => w.contributionDays).slice(-30)
  const month = last30.reduce((s, d) => s + d.contributionCount, 0)

  const heroStats = [
    { label: 'contributions · 1y', value: total.toLocaleString() },
    { label: 'last 30 days', value: month.toLocaleString() },
    { label: 'streak', value: `${streak}d` },
    { label: 'stars', value: totalStars.toLocaleString() },
    { label: 'open issues', value: totalIssues.toLocaleString() },
    { label: 'open prs', value: totalPrs.toLocaleString() },
  ]

  const syncText = gh.syncedAt ? (ghSyncStale ? `sync stale · ${ghSyncAgo}` : `synced ${ghSyncAgo}`) : 'sync unknown'

  return (
    <div className={styles.page}>
      <div className={styles.stats}>
        {heroStats.map(s => (
          <div key={s.label} className={styles.stat}>
            <div className={styles.val}>{s.value}</div>
            <div className={styles.lbl}>{s.label}</div>
          </div>
        ))}
        <a className={styles.profile} href={`https://github.com/${gh.username}`} target="_blank" rel="noreferrer">
          @{gh.username} ↗
        </a>
      </div>

      {heatData.length > 0 && (
        <section className="mc-widget" aria-label="Contributions">
          <Prompt host="desk" cmd="github --contributions" meta={
            <span
              className={ghSyncStale ? styles.stale : undefined}
              title={gh.syncedAt ? `GitHub data synced ${fmtDate(gh.syncedAt)}` : undefined}
              aria-label={ghSyncStale ? `GitHub sync is stale, ${ghSyncAgo}` : `GitHub ${syncText}`}
            ><Glyph g={ghSyncStale ? 'fail' : gh.syncedAt ? 'ok' : 'idle'} /> {syncText}</span>
          } />
          <p className={styles.summary}>{total.toLocaleString()} in the last year · {streak}-day streak{gh.streakNote ? ` (${gh.streakNote})` : ''}</p>
          <div className={styles.heatWrap}>
            <div className={styles.dayLabels}>
              <span /><span>mon</span><span /><span>wed</span><span /><span>fri</span><span />
            </div>
            <div className={styles.heatInner}>
              <div className={styles.monthLabels}>
                {monthLabels.map((m, i) => (
                  <span key={i} style={{ left: `calc(${(m.weekIndex / weeks.length) * 100}%)` }}>{m.label.toLowerCase()}</span>
                ))}
              </div>
              <Heatmap data={heatData} />
            </div>
          </div>
          <div className={styles.legend}>
            <span>less</span>
            <span className={styles.scale} aria-hidden="true">
              <span className={styles.lvl0} /><span className={styles.lvl1} /><span className={styles.lvl2} /><span className={styles.lvl3} /><span className={styles.lvl4} />
            </span>
            <span>more</span>
            <span className={styles.window}>window · 365d</span>
          </div>
        </section>
      )}

      <div className={styles.columns}>
        <section aria-label="Repositories">
          <Divider label={`repositories ${repos.length}`} />
          {repos.length === 0 ? (
            <p className={styles.empty}>· no repositories — nothing public is being surfaced for @{gh.username}.</p>
          ) : (
            <div className={styles.repoGrid}>
              {repos.map(repo => (
                <a key={repo.name} className={styles.repoCard} href={repo.url} target="_blank" rel="noreferrer">
                  <div className={styles.repoHead}>
                    <span className={styles.repoName} title={repo.name}>{repo.name}</span>
                    {repo.private && <span className={styles.private}>private</span>}
                  </div>
                  {repo.description && <div className={styles.repoDesc} title={repo.description}>{repo.description}</div>}
                  <div className={styles.repoMeta}>
                    {repo.language && (
                      <span className={styles.lang}>
                        <span className={styles.dot} style={{ background: LANG_COLORS[repo.language] ?? 'var(--pt-text-mute)' }} />
                        {repo.language}
                      </span>
                    )}
                    {repo.stars > 0 && <span>★ {repo.stars}</span>}
                    {repo.openIssues > 0 && <span>◉ {repo.openIssues}</span>}
                    {(repo.openPrs ?? 0) > 0 && <span>⇄ {repo.openPrs}</span>}
                    <span className={styles.when}>{pushedAgo(repo.pushedAt)}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Recent activity" className="mc-widget">
          <Prompt host="desk" cmd="github --events" meta={`${(gh.recentEvents ?? []).length} events`} />
          {topActivity.length > 0 && <div className="asciiviz-inset">
            <div className="asciiviz-caption">top repos · events in current feed</div>
            {topActivity.map(([repo, count]) => <div className="asciiviz-repo" key={repo}>
              <span className="asciiviz-repo-name" title={repo}>{repo}</span>{' '}<AsciiBars values={[count]} max={topActivity[0][1]} />
            </div>)}
          </div>}
          {(gh.recentEvents ?? []).length === 0 ? (
            <p className={styles.empty}>· no recent events — push, PR and issue activity appears here as it happens.</p>
          ) : (
            <div>
              {(gh.recentEvents ?? []).slice(0, 10).map((ev, i) => {
                const pretty = EVENT_LABELS[ev.type] ?? { label: ev.type.replace(/Event$/, '').toLowerCase(), glyph: '·' }
                return (
                  <div key={ev.key || i} className={styles.commit}>
                    <span className={styles.sha}>{pretty.glyph} {pretty.label}</span>
                    <span className={styles.repo}>{ev.repo}</span>
                    <span className={styles.commitWhen}>{fmtDate(ev.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
