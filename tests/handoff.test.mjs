import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { registerHooks } from 'node:module'
import { buildHandoffBrief, codexHandoffArgs, assertHandoffCwd, runCodexHandoff } from '../lib/handoff.ts'
import { withAgentFlight } from '../lib/agent-adapters.ts'

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
const { POST } = await import('../app/api/handoff/route.ts')
const request = body => new Request('http://localhost/api/handoff', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body),
})
const valid = { sessionId: 'test', agent: 'codex', task: 'test' }

test('brief bounds user/assistant context and explicitly starts a new context', () => {
  const brief = JSON.parse(buildHandoffBrief({ id: 'a', agent: 'pi' }, [
    { role: 'user', content: 'old' }, { role: 'tool', content: 'ignored' },
    { role: 'assistant', content: 'a'.repeat(5000) }, { role: 'user', content: 'latest' },
  ], 'objective', '/repo', 2))
  assert.equal(brief.kind, 'new-agent-handoff')
  assert.equal(brief.from, 'pi')
  assert.equal(brief.cwd, '/repo')
  assert.equal(brief.excerpt.length, 2)
  assert.equal(brief.excerpt[0].content.length, 4000)
  assert.equal(brief.objective, 'objective')
  const args = codexHandoffArgs('/repo with spaces', '/repo with spaces/brief')
  assert.equal(args[args.indexOf('-C') + 1], '/repo with spaces')
  assert.ok(args.includes('--add-dir'))
  assert.ok(!args.includes('--continue') && !args.includes('resume'))
})

test('route rejects malformed input, extra cwd, and foreign origin before execution', async () => {
  for (const body of [null, [], {}, { ...valid, agent: 'pi' }, { ...valid, task: ' ' }, { ...valid, task: 'x'.repeat(4001) }, { ...valid, cwd: '/unrelated' }]) {
    assert.equal((await POST(request(body))).status, 400)
  }
  const foreign = new Request('http://localhost/api/handoff', { method: 'POST', headers: { host: 'localhost', origin: 'https://foreign.invalid', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(valid) })
  assert.equal((await POST(foreign)).status, 403)
  await assert.rejects(assertHandoffCwd('/'), /server repository/)
})

test('handoff returns 409 while the shared Codex flight is held, releases on error', async () => {
  let release
  const held = withAgentFlight('codex', () => new Promise(resolve => { release = resolve }))
  try { assert.equal((await POST(request(valid))).status, 409) }
  finally { release(); await held }
  await assert.rejects(withAgentFlight('codex', async () => { throw new Error('fail') }))
  assert.equal((await withAgentFlight('codex', async () => 'next')).status, 200)
})

test('runner captures actual exit, diff and last 20 lines, cleans brief on failure and success', async () => {
  const previous = process.cwd()
  const dir = await mkdtemp(path.join(previous, '.mc-handoff-test-'))
  try {
    process.chdir(dir)
    execFileSync('git', ['init', '-q'], { cwd: dir })
    await writeFile(path.join(dir, 'tracked.txt'), 'before\n')
    execFileSync('git', ['add', 'tracked.txt'], { cwd: dir })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'], { cwd: dir })
    await writeFile(path.join(dir, 'package.json'), '{"type":"commonjs"}')
    const cli = path.join(dir, 'fake-codex')
    await writeFile(cli, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const dir = args[args.indexOf('--add-dir') + 1];
if (!fs.existsSync(dir + '/brief.json')) process.exit(9);
fs.writeFileSync('tracked.txt', 'after\\n');
fs.writeFileSync('new.txt', 'new\\n');
for (let i = 0; i < 25; i++) console.log('line-' + i);
process.exit(7);
`, { mode: 0o700 })
    const report = await runCodexHandoff(cli, '{}')
    assert.equal(report.ok, false)
    assert.equal(report.exitCode, 7)
    assert.equal(report.outputTail.split('\n').length, 20)
    assert.equal(report.outputTail.split('\n')[0], 'line-5')
    assert.match(report.diffStat, /tracked.txt.*\|/)
    assert.match(report.diffStat, /new.txt/)
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('.mc-handoff-')))
    const success = await runCodexHandoff('/usr/bin/true', '{}')
    assert.equal(success.ok, true)
    assert.equal(success.exitCode, 0)
    const missing = await runCodexHandoff(path.join(dir, 'missing-cli'), '{}')
    assert.equal(missing.ok, false)
    assert.equal(missing.exitCode, null)
    assert.match(missing.outputTail, /ENOENT/)
    const sleeper = path.join(dir, 'sleep-codex')
    await writeFile(sleeper, '#!/usr/bin/env node\nsetTimeout(() => {}, 30000)\n', { mode: 0o700 })
    const timed = await runCodexHandoff(sleeper, '{}', dir, 50)
    assert.equal(timed.ok, false)
    assert.equal(timed.exitCode, null)
    assert.match(timed.outputTail, /SIGTERM/)
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('.mc-handoff-')))
  } finally { process.chdir(previous); await rm(dir, { recursive: true, force: true }) }
})
