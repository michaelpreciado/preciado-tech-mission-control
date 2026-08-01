import path from 'node:path'
import type { MissionProject, MissionTask } from '../types'
import { getConfig, joinIf } from '../config'
import { ROOTS, exists, readText, rel, hashId } from './shared'
import { githubSnapshot } from './github'

export async function collectProjects(tasks: MissionTask[]): Promise<MissionProject[]> {
  const projects: MissionProject[] = []
  const activeHub = joinIf(ROOTS.fridayVault, '500 Friday Hub/Active Projects Hub.md')
  const activeText = activeHub ? await readText(activeHub) : ''
  const links = [...activeText.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)]
  for (const m of links) {
    const label = (m[2] || m[1]).trim()
    const relevant = tasks.filter(t => `${t.title} ${t.source}`.toLowerCase().includes(label.toLowerCase().split(/\s+/)[0] || label.toLowerCase()))
    // No progress number: nothing on disk measures completion, so we don't invent one.
    projects.push({
      id: `obs-${hashId(label)}`,
      name: label,
      kind: 'obsidian',
      source: rel(activeHub),
      signal: 'Listed in Active Projects Hub',
      tasks: relevant.length,
    })
  }
  const pinnedRepo = getConfig().github.projectRepo
  if (pinnedRepo) {
    const github = await githubSnapshot(pinnedRepo)
    projects.unshift({
      id: `github-${hashId(pinnedRepo)}`,
      name: pinnedRepo.split('/')[1] || pinnedRepo,
      kind: 'github',
      source: `github.com/${pinnedRepo}`,
      signal: github.recentCommit ? `Latest commit: ${github.recentCommit}` : 'GitHub reachable; commit detail unavailable',
      tasks: tasks.filter(t => /dashboard|github|mission|code|next/i.test(`${t.title} ${t.source}`)).length,
      github,
    })
  }
  const dirs = [ROOTS.repo, ROOTS.fridayWorkspace]
  for (const d of dirs) {
    if (await exists(d)) {
      projects.push({ id: `ws-${hashId(d)}`, name: path.basename(d), kind: 'workspace', source: rel(d), signal: 'Live filesystem workspace', tasks: tasks.filter(t => t.source.includes(path.basename(d))).length })
    }
  }
  return projects.slice(0, 16)
}
