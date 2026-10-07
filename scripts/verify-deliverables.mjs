/** Read-only inventory and tracker comparison. No receipts or statuses are written. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { collectDeliverables } from '../lib/pt/deliverables.ts'
import { deliverablesRegistry } from '../lib/pt/deliverables-registry.ts'
import { sha256 } from '../lib/pt/artifact-files.ts'
const registry = deliverablesRegistry()
const before = new Map()
for (const registration of registry.trackers) {
  const file = path.join(registry.roots.find(r => r.id === registration.rootId).directory, registration.path)
  before.set(file, sha256(await fs.readFile(file)))
}
const envelope = await collectDeliverables({ registry })
console.log(`INDEX COUNT ${envelope.data.count}; complete=${envelope.data.complete}`)
const counts = {}
for (const item of envelope.data.items) {
  counts[item.reviewState] = (counts[item.reviewState] || 0) + 1
  console.log(`${item.rootId}:${item.path ?? item.title}\t${item.reviewState}\ttracker.json: ${item.trackerStates.map(t => `${t.id}=${t.status}`).join(', ') || 'none'}\t${item.unavailableReason || 'readable'}`)
}
console.log('STATE COUNTS', JSON.stringify(counts))
console.log('SOURCE ERRORS', JSON.stringify(envelope.errors))
for (const [file, revision] of before) {
  if (sha256(await fs.readFile(file)) !== revision) throw Error('tracker_changed_during_verification')
  console.log('TRACKER UNCHANGED SHA256',revision)
}
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(envelope,null,2)+'\n')
