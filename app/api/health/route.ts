import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'

import { getConfig } from '@/lib/config'
const startedAt = Date.now()

async function canAccess(p: string): Promise<boolean> {
  if (!p) return false
  try { await fs.access(p); return true } catch { return false }
}

export async function GET() {
  const { paths } = getConfig()
  const uptimeMs = Date.now() - startedAt
  const checks = {
    workspace: await canAccess(paths.workspaceDir),
    vault: await canAccess(paths.vaultDir),
    cronJobs: await canAccess(paths.cronJobsFile),
    agentSessions: await canAccess(paths.agentsDir),
    kanbanDb: await canAccess(paths.kanbanDbFile),
  }

  const allOk = Object.values(checks).every(Boolean)

  return NextResponse.json({
    ok: allOk,
    uptime: uptimeMs,
    uptimeHuman: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
    collectors: checks,
    generatedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
