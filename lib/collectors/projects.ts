import path from 'node:path'
import type { MissionProject, MissionTask } from '../types'
import { getConfig, joinIf } from '../config'
import { ROOTS, exists, readText, rel, hashId } from './shared'
import { githubSnapshot } from './github'

/** Open (non-done) tasks whose title/source matches this project's label. */
function todosFor(label: string, tasks: MissionTask[]): MissionProject['todo'] {
  const needle = label.toLowerCase()
  const base = needle.split(/\s+/)[0]
  const m = tasks.filter(t => t.status !== 'done')
  const matched = m.filter(t => {
    const hay = `${t.title} ${t.source} ${t.detail ?? ''}`.toLowerCase()
    return base.length > 2 ? hay.includes(base) || hay.includes(needle) : hay.includes(needle)
  })
  return matched.slice(0, 8).map(t => ({
    id: t.id, title: t.title, ownerName: t.ownerName, priority: t.priority, status: t.status,
  }))
}

export async function collectProjects(tasks: MissionTask[]): Promise<MissionProject[]> {
  const projects: MissionProject[] = []
  const activeHub = joinIf(ROOTS.fridayVault, '500 Friday Hub/Active Projects Hub.md')
  const activeText = activeHub ? await readText(activeHub) : ''
  const links = [...activeText.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)]
  for (const m of links) {
    const label = (m[2] || m[1]).trim()
    const relevant = tasks.filter(t => `${t.title} ${t.source}`.toLowerCase().includes(label.toLowerCase().split(/\s+/)[0] || label.toLowerCase()))
    const todo = todosFor(label, tasks)
    // No progress number: nothing on disk measures completion, so we don't invent one.
    projects.push({
      id: `obs-${hashId(label)}`,
      name: label,
      kind: 'obsidian',
      source: rel(activeHub),
      signal: 'Listed in Active Projects Hub',
      tasks: relevant.length,
      todo,
    })
  }
  const pinnedRepo = getConfig().github.projectRepo
  if (pinnedRepo) {
    const repoName = pinnedRepo.split('/')[1] || pinnedRepo
    const github = await githubSnapshot(pinnedRepo)
    projects.unshift({
      id: `github-${hashId(pinnedRepo)}`,
      name: repoName,
      kind: 'github',
      source: `github.com/${pinnedRepo}`,
      signal: github.recentCommit ? `Latest commit: ${github.recentCommit}` : 'GitHub reachable; commit detail unavailable',
      tasks: tasks.filter(t => /dashboard|github|mission|code|next/i.test(`${t.title} ${t.source}`)).length,
      todo: todosFor(repoName, tasks),
      github,
    })
  }
  const dirs = [ROOTS.repo, ROOTS.fridayWorkspace]
  for (const d of dirs) {
    if (await exists(d)) {
      const name = path.basename(d)
      projects.push({ id: `ws-${hashId(d)}`, name, kind: 'workspace', source: rel(d), signal: 'Live filesystem workspace', tasks: tasks.filter(t => t.source.includes(name)).length, todo: todosFor(name, tasks) })
    }
  }
  return projects.slice(0, 16)
}
