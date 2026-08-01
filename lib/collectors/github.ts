import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitHubActivity, GitHubRepoSignal } from '../types'
import { getConfig } from '../config'

const execFileAsync = promisify(execFile)

export async function githubSnapshot(repo: string) {
  try {
    const [issues, prs, commits] = await Promise.all([
      execFileAsync('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--json', 'number', '--limit', '100'], { timeout: 7000 }),
      execFileAsync('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', 'number', '--limit', '100'], { timeout: 7000 }),
      execFileAsync('gh', ['api', `repos/${repo}/commits`, '--jq', '.[0].commit.message'], { timeout: 7000 }),
    ])
    return {
      repo,
      openIssues: JSON.parse(issues.stdout || '[]').length,
      openPrs: JSON.parse(prs.stdout || '[]').length,
      recentCommit: commits.stdout.trim().split('\n')[0],
    }
  } catch {
    return { repo }
  }
}

/** Consecutive days (ending today or yesterday) with at least one contribution. */
function streakFromCalendar(weeks: GitHubActivity['weeks']): number {
  const days = weeks.flatMap(w => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date))
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date > today) continue
    if (days[i].contributionCount > 0) streak++
    else if (days[i].date === today) continue // today can still get commits; don't break the streak on it
    else break
  }
  return streak
}

export async function collectGithub(): Promise<GitHubActivity> {
  const username = getConfig().github.username
  const empty: GitHubActivity = { username, weeks: [], repos: [], recentEvents: [], source: 'gh cli + GitHub API' }
  if (!username) return { ...empty, source: 'not configured — set github.username in data/config.json' }
  try {
    // No from/to → GitHub returns its natural rolling-year calendar (the exact
    // 52/53-week window the profile page shows). contributionLevel is GitHub's
    // own quartile bucket, so heatmap colors match the real graph rather than a
    // naive min(4, count) approximation.
    const query = `query($login:String!) { user(login:$login) { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } repositories(first: 18, orderBy:{field:PUSHED_AT, direction:DESC}, ownerAffiliations:[OWNER]) { totalCount nodes { name url description isPrivate updatedAt pushedAt stargazerCount primaryLanguage { name } issues(states:OPEN) { totalCount } pullRequests(states:OPEN) { totalCount } } } } }`
    const gql = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `login=${username}`], { timeout: 12000 })
    const json = JSON.parse(gql.stdout)
    const user = json.data?.user
    const calendar = user?.contributionsCollection?.contributionCalendar
    type GitHubGraphQLRepo = {
      name: string; url: string; description?: string; isPrivate: boolean; updatedAt: string; pushedAt: string
      stargazerCount?: number; issues?: { totalCount: number }; pullRequests?: { totalCount: number }; primaryLanguage?: { name: string }
    }
    const repos: GitHubRepoSignal[] = (user?.repositories?.nodes || []).map((r: GitHubGraphQLRepo) => ({
      name: r.name, url: r.url, description: r.description || undefined, private: Boolean(r.isPrivate), updatedAt: r.updatedAt, pushedAt: r.pushedAt, stars: r.stargazerCount || 0, openIssues: r.issues?.totalCount || 0, openPrs: r.pullRequests?.totalCount || 0, language: r.primaryLanguage?.name,
    }))
    const eventsRaw = await execFileAsync('gh', ['api', `users/${username}/events/public`, '--jq', '.[:12] | map({type, repo: .repo.name, createdAt: .created_at})'], { timeout: 8000 }).catch(() => ({ stdout: '[]' }))
    type GitHubEventRaw = { type?: string; repo?: string; createdAt?: string }
    const recentEvents = (JSON.parse(eventsRaw.stdout || '[]') as GitHubEventRaw[]).map((event, index) => ({
      type: String(event.type || 'Event'),
      repo: String(event.repo || 'unknown/repo'),
      createdAt: String(event.createdAt || new Date(0).toISOString()),
      // Keep an index-stabilized server shape because GitHub can return repeated event type/repo/timestamp tuples.
      key: `${event.type || 'Event'}-${event.repo || 'unknown'}-${event.createdAt || 'unknown'}-${index}`,
    }))
    // GitHub's quartile level → 0-4 intensity (exact match to the profile graph).
    const LEVEL_MAP: Record<string, number> = {
      NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
    }
    type GitHubCalDay = { date: string; contributionCount: number; contributionLevel?: string }
    const weeks = (calendar?.weeks || []).map((w: { contributionDays: GitHubCalDay[] }) => ({
      contributionDays: w.contributionDays.map((d: GitHubCalDay) => ({
        date: d.date,
        contributionCount: d.contributionCount,
        level: d.contributionLevel != null ? (LEVEL_MAP[d.contributionLevel] ?? Math.min(4, d.contributionCount)) : Math.min(4, d.contributionCount),
      })),
    }))
    // The contribution calendar counts automated pushes too (e.g. sync bots
    // committing daily), so the streak is labeled rather than presented as personal.
    const hasAutomation = repos.some(r => /claude-sync|auto-?commit|sync-?bot/i.test(r.name))
    return {
      ...empty,
      totalContributions: calendar?.totalContributions,
      weeks,
      repos,
      recentEvents,
      currentStreak: streakFromCalendar(weeks),
      streakNote: hasAutomation ? 'includes automated claude-sync commits' : undefined,
      syncedAt: new Date().toISOString(),
    }
  } catch {
    return empty
  }
}
