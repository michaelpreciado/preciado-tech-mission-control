import fs from 'node:fs/promises'
import { deliverablesFixture } from '../tests/helpers/deliverables-fixture.mjs'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.deliverables/collector.mjs'
import { collectDeliverables } from '../lib/pt/deliverables.ts'
const fixture = await deliverablesFixture()
try {
  const { envelope, options } = fixture
  const cases = [{ id: 'all-six-states', now: options.now, envelope }]
  await fixture.write('verified note.md','# Edited after coordinator acceptance\n')
  cases.push({id:'verified-then-edited',now:options.now,envelope:await collectDeliverables(options)})
  await fs.writeFile('tests/pt-parity/deliverables-envelopes.json',JSON.stringify(cases,null,2)+'\n')
  await fs.writeFile('../desktop/mp.preciadoTech.deliverables/fixture.json',JSON.stringify(displaySnapshot(envelope,Date.parse(options.now)),null,2)+'\n')
} finally { await fs.rm(fixture.temp,{recursive:true,force:true}) }
