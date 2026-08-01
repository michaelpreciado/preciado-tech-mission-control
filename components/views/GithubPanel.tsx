'use client'

import { useLiveData } from '../LiveDataProvider'
import { SectionHead, Window, EmptyTerminal, SkeletonPanel, fmtDate } from '../ui'
import { Heatmap } from '../Viz'
import { ConnectCard } from './shared'

/* ── GitHub Panel ─────────────────────────────────────── */

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

  const repos = gh.repos ?? []
  const totalStars = repos.reduce((s, r) => s + r.stars, 0)
  const totalIssues = repos.reduce((s, r) => s + r.openIssues, 0)
  const totalPrs = repos.reduce((s, r) => s + (r.openPrs ?? 0), 0)
  // Contributions in the last 30 days from the calendar tail
  const last30 = weeks.flatMap(w => w.contributionDays).slice(-30)
  const month = last30.reduce((s, d) => s + d.contributionCount, 0)

  const heroStats = [
    { label: 'CONTRIBUTIONS · 1Y', value: total.toLocaleString() },
    { label: 'LAST 30 DAYS', value: month.toLocaleString() },
    { label: 'STREAK', value: `${streak}d` },
    { label: 'STARS', value: totalStars.toLocaleString() },
    { label: 'OPEN ISSUES', value: totalIssues.toLocaleString() },
    { label: 'OPEN PRS', value: totalPrs.toLocaleString() },
  ]

  return (
    <>
      <div className="mc-gh-stats">
        {heroStats.map(s => (
          <div key={s.label} className="mc-gh-stat">
            <div className="val">{s.value}</div>
            <div className="lbl">{s.label}</div>
          </div>
        ))}
        <a className="mc-gh-profile" href={`https://github.com/${gh.username}`} target="_blank" rel="noreferrer">
          @{gh.username} ↗
        </a>
      </div>

      {heatData.length > 0 && (
        <Window tag="▦" title="GITHUB · CONTRIBUTIONS"
          meta={<>
            <span className="mc-gh-live"><span className="mc-led green" /> LIVE{gh.syncedAt ? ` · synced ${fmtDate(gh.syncedAt)}` : ''}</span>
            <span style={{ color: 'var(--pt-neon-bright)', textShadow: 'var(--pt-glow-sm)' }}> · {total} in the last year · {streak}-day streak{gh.streakNote ? ` (${gh.streakNote})` : ''}</span>
          </>}>
          <div className="mc-gh-heatmap-wrap">
            <div className="mc-gh-day-labels">
              <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
            </div>
            <div className="mc-gh-heatmap-inner">
              <div className="mc-gh-month-labels">
                {monthLabels.map((m, i) => (
                  <span key={i} style={{ left: `calc(${(m.weekIndex / weeks.length) * 100}%)` }}>{m.label}</span>
                ))}
              </div>
              <Heatmap data={heatData} />
            </div>
          </div>
          <div className="mc-heatmap-legend">
            <span>LESS</span>
            <span className="scale">
              <span className="lvl-0" /><span className="lvl-1" /><span className="lvl-2" /><span className="lvl-3" /><span className="lvl-4" />
            </span>
            <span>MORE</span>
            <span style={{ marginLeft: 'auto' }}>WINDOW · 365D</span>
          </div>
        </Window>
      )}

      <SectionHead label={`GITHUB / REPOSITORIES · ${repos.length} MOST RECENT`} />
      <div className="mc-repo-grid">
        {repos.map(repo => (
          <a key={repo.name} className="mc-repo-card" href={repo.url} target="_blank" rel="noreferrer">
            <div className="mc-repo-head">
              <span className="mc-repo-name">{repo.name}</span>
              {repo.private && <span className="mc-repo-private">PRIVATE</span>}
            </div>
            {repo.description && <div className="mc-repo-desc">{repo.description}</div>}
            <div className="mc-repo-meta">
              {repo.language && (
                <span className="mc-repo-lang">
                  <span className="dot" style={{ background: LANG_COLORS[repo.language] ?? '#8b949e' }} />
                  {repo.language}
                </span>
              )}
              {repo.stars > 0 && <span>★ {repo.stars}</span>}
              {repo.openIssues > 0 && <span>◉ {repo.openIssues}</span>}
              {(repo.openPrs ?? 0) > 0 && <span>⇄ {repo.openPrs}</span>}
              <span className="when">{pushedAgo(repo.pushedAt)}</span>
            </div>
          </a>
        ))}
      </div>

      <SectionHead label="GITHUB / RECENT ACTIVITY" />
      <Window tag="◉" title="RECENT EVENTS">
        <div>
          {(gh.recentEvents ?? []).slice(0, 10).map((ev, i) => {
            const pretty = EVENT_LABELS[ev.type] ?? { label: ev.type.replace(/Event$/, '').toLowerCase(), glyph: '·' }
            return (
              <div key={ev.key || i} className="mc-commit">
                <span className="sha">{pretty.glyph} {pretty.label}</span>
                <div>
                  <div className="repo">{ev.repo}</div>
                </div>
                <span className="when">{fmtDate(ev.createdAt)}</span>
              </div>
            )
          })}
        </div>
      </Window>
    </>
  )
}
