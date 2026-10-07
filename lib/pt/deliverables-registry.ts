/** Server-owned allowlist. Adding a report collection requires a code review.
 * Configuration relocates the workspace/vault; requests cannot register roots.
 */
import path from 'node:path'
import { getConfig } from '../config'
import { PIPELINE_VAULT_PATH } from '../vault-docs'

export type ArtifactRoot = { id: string; directory: string; kind: 'report' | 'vault'; vaultName?: string; vaultPrefix?: string }
export type TrackerRegistration = {
  rootId: string; path: string; receiptPath: string
  reviews: { path: string; prefix: string; taskIds: string[] }[]
  scopes: { prefix: string; taskIds: string[]; gateIds: string[] }[]
}
export type DeliverablesRegistry = { workspaceDir: string; roots: ArtifactRoot[]; trackers: TrackerRegistration[] }
export function deliverablesRegistry(): DeliverablesRegistry {
  const { deliverablesReportsDir, vaultDir } = getConfig().paths
  return {
    workspaceDir: path.dirname(deliverablesReportsDir),
    roots: [
      { id: 'safe-improvements', directory: path.join(deliverablesReportsDir, '2026-10-02-safe-improvements'), kind: 'report' },
      { id: 'pipeline-vault', directory: path.join(vaultDir, PIPELINE_VAULT_PATH), kind: 'vault', vaultName: path.basename(vaultDir), vaultPrefix: PIPELINE_VAULT_PATH },
    ],
    trackers: [{ rootId: 'safe-improvements', path: 'tracker.json', receiptPath: 'coordinator-acceptance.json',
      reviews: [
        { path: 'prototype/COORDINATOR-VERIFICATION.md', prefix: 'prototype/', taskIds: ['desktop-01', 'desktop-02', 'desktop-03', 'desktop-04', 'desktop-05'] },
        { path: 'workspace/review/VERIFIED-REVIEW.md', prefix: 'workspace/', taskIds: ['workspace-safe-03', 'workspace-safe-04', 'workspace-safe-05', 'workspace-safe-06'] },
        { path: 'cleanup/review/VERIFIED-REVIEW.md', prefix: 'cleanup/', taskIds: ['omarchy-safe-01', 'omarchy-safe-02', 'omarchy-safe-03'] },
      ],
      scopes: [
        { prefix: 'prototype/', taskIds: ['desktop-01', 'desktop-02', 'desktop-03', 'desktop-04', 'desktop-05'], gateIds: ['gate-desktop'] },
        { prefix: 'preview/', taskIds: ['web-02'], gateIds: ['web-03', 'gate-outreach'] },
        { prefix: 'cleanup/', taskIds: [], gateIds: ['gate-cleanup'] },
      ],
    }],
  }
}
