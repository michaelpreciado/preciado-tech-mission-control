/** Freeze presentation and labels from their lib/pt owners. Staged output only. */
import fs from 'node:fs'
const out = new URL('../../desktop/mp.preciadoTech.pipeline/', import.meta.url)
for (const file of ['presentation-state.mjs', 'stage-labels.json']) {
  fs.copyFileSync(new URL('../lib/pt/' + file, import.meta.url), new URL(file, out))
}
