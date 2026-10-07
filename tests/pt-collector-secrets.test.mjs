import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
const fixture = name => JSON.parse(fs.readFileSync(new URL('./pt-parity/' + name, import.meta.url)))[0].envelope
const names = ['INTERNAL_API_SECRET', 'MC_INTERNAL_API_SECRET']
const tokens = ['lane07-legacy-secret-canary', 'lane07-mc-secret-canary']
for (const [id, prefix, filename] of [
  ['pipeline','MC_RADAR','radar-envelopes.json'], ['crew','MC_CREW','crew-envelopes.json'],
  ['command','MC_COMMAND','command-envelopes.json'], ['deliverables','MC_DELIVERABLES','deliverables-envelopes.json'],
]) test(`${id}: fake curl proves both secret names/values absent from argv, env, logs and display`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-lane07-secrets-'))
  const credential = path.join(dir, 'auth.env'), audit = path.join(dir, 'audit.json')
  fs.writeFileSync(credential, `${prefix}_ORIGIN=http://127.0.0.1:4176\nINTERNAL_API_SECRET=${tokens[0]}\n`, { mode: 0o600 })
  const env = { ...process.env, PATH: dir + path.delimiter + process.env.PATH, [prefix + '_ENV_FILE']: credential, [names[0]]: tokens[0], [names[1]]: tokens[1] }
  try {
    for (const status of [200, 401, 503]) {
      const body = fixture(filename)
      body.generatedAt = new Date().toISOString(); body.validUntil = new Date(Date.now() + 180000).toISOString()
      // Fake curl logs only booleans. Deliberate secret-bearing stderr must be suppressed.
      fs.writeFileSync(path.join(dir, 'curl'), `#!${process.execPath}
const fs = require('node:fs');
const names = ${JSON.stringify(names)}, tokens = ${JSON.stringify(tokens)};
let input = '';
process.stdin.on('data', b => input += b);
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  fs.writeFileSync(${JSON.stringify(audit)}, JSON.stringify({
    namesInEnv: names.filter(n => Object.hasOwn(process.env, n)),
    leakedArgs: [...names, ...tokens].some(s => args.some(a => a.includes(s))),
    leakedEnv: tokens.some(t => Object.values(process.env).some(v => v.includes(t))),
    stdinMatches: input === ${JSON.stringify('header = "Authorization: Bearer ' + tokens[0] + '"\n')},
    firstArg: args[0]
  }));
  process.stderr.write([...names, ...tokens].join(' '));
  process.stdout.write(${JSON.stringify(JSON.stringify(body) + '\n' + status)});
});
`, { mode: 0o700 })
      const run = spawnSync(process.execPath, [path.resolve(`../desktop/mp.preciadoTech.${id}/collector.mjs`)], { env, encoding: 'utf8', timeout: 15000 })
      assert.equal(run.status, 0, run.stderr); assert.equal(run.error, undefined)
      const auditText = fs.readFileSync(audit, 'utf8'), captured = JSON.parse(auditText)
      assert.deepEqual(captured.namesInEnv, []); assert.equal(captured.leakedArgs, false); assert.equal(captured.leakedEnv, false)
      assert.equal(captured.stdinMatches, true); assert.equal(captured.firstArg, '-q')
      const display = JSON.parse(run.stdout.trim())
      if (status === 200) assert.equal(display.error, null)
      if (status === 401) assert.equal(display.error, 'access_denied')
      for (const sentinel of [...names, ...tokens]) {
        assert.ok(!run.stdout.includes(sentinel), `${id} display leaked ${sentinel}`)
        assert.ok(!run.stderr.includes(sentinel), `${id} stderr leaked ${sentinel}`)
        assert.ok(!auditText.includes(sentinel), `${id} audit leaked ${sentinel}`)
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
