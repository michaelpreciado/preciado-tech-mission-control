import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Replace config before importing the collector: never load config.ts or read
// data/config.json. All HTTP is intercepted, including unexpected endpoints.
let config = { keys: { ticktickToken: 'mock-only-token' } }
globalThis.__ticktickTestConfig = () => config
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './config' && context.parentURL?.endsWith('/lib/ticktick.ts')) {
      return { url: 'data:text/javascript,export const getConfig = () => globalThis.__ticktickTestConfig()', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
const { fetchTickTickWeek } = await import('../lib/ticktick.ts')
hooks.deregister()
const originalFetch = globalThis.fetch
const originalTZ = process.env.TZ
let requests
let respond
const event = (id, date = '2031-05-17', extra = {}) => ({
  id, projectId: 'inbox-fixture', title: `Fixture ${id}`, startDate: date, status: 0, ...extra,
})
const ok = body => ({ ok: true, json: async () => body })

beforeEach(() => {
  config = { keys: { ticktickToken: 'mock-only-token' } }
  requests = []
  respond = path => {
    if (path === '/project') return ok([])
    throw new Error('Unexpected mock request')
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.ticktick.com')
    const path = new URL(url).pathname.replace('/open/v1', '')
    assert.ok(['/project', '/task/filter'].includes(path), 'only documented read endpoints')
    assert.equal(options.method, path === '/project' ? 'GET' : 'POST')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.Authorization, 'Bearer mock-only-token')
    const body = options.body ? JSON.parse(options.body) : undefined
    if (body) {
      assert.deepEqual(body.status, [0])
      assert.equal('projectIds' in body, false)
      assert.equal(options.headers['Content-Type'], 'application/json')
    }
    requests.push({ path, body })
    return respond(path, body)
  }
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

function filterResponse(tasks, projects = []) {
  respond = path => ok(path === '/project' ? projects : tasks)
}

test('Inbox appears even when the five listed projects contain no tasks', async () => {
  const projects = Array.from({ length: 5 }, (_, i) => ({ id: `project-${i}` }))
  filterResponse([event('inbox-event')], projects)
  const result = await fetchTickTickWeek()
  assert.equal(result.configured, true)
  assert.equal(result.error, undefined)
  assert.equal(result.tasks.length, 1)
  assert.equal(result.tasks[0].projectId, 'inbox-fixture')
  assert.equal(result.tasks[0].title, 'Fixture inbox-event')
  assert.deepEqual(requests.map(r => r.path), ['/project', '/task/filter'])
  assert.deepEqual(requests[1].body, { status: [0] })
})

test('keeps distant dates for week/month navigation, metadata, due-only tasks; omits completed/undated and dedupes', async () => {
  filterResponse([
    event('old', '2001-01-01', { projectId: 'work' }),
    event('future', '2042-12-31'),
    event('due', undefined, { startDate: undefined, dueDate: '2032-02-29' }),
    event('done', '2031-01-01', { status: 2 }),
    event('undated', undefined, { startDate: undefined }),
    event('future', '2042-12-31'),
  ], [{ id: 'work', name: 'Work', color: '#abcdef' }])
  const result = await fetchTickTickWeek()
  assert.equal(result.error, undefined)
  assert.deepEqual(result.tasks.map(t => t.id), ['old', 'future', 'due'])
  assert.equal(result.tasks[0].projectName, 'Work')
  assert.equal(result.tasks[0].projectColor, '#abcdef')
  assert.equal(result.tasks[2].date, '2032-02-29T00:00:00')
})

test('date-only and all-day dates keep their calendar day in both west/east viewer zones', async () => {
  filterResponse([
    event('date-only', '2031-03-09'),
    event('all-day', '2031-03-08T15:00:00.000+0000', { isAllDay: true, timeZone: 'Asia/Tokyo' }),
    event('all-day-no-zone', '2031-03-09T00:00:00.000+0000', { isAllDay: true }),
  ])
  const result = await fetchTickTickWeek()
  assert.equal(result.error, undefined)
  for (const zone of ['America/Los_Angeles', 'Pacific/Auckland']) {
    process.env.TZ = zone
    for (const task of result.tasks) {
      const date = new Date(task.date)
      assert.equal(date.getFullYear(), 2031)
      assert.equal(date.getMonth(), 2)
      assert.equal(date.getDate(), 9)
      assert.equal(task.isAllDay, true)
    }
  }
})

test('timed events preserve timezone offsets across midnight and DST', async () => {
  const timestamp = '2031-03-09T07:30:00.000+0000'
  filterResponse([event('timed', timestamp)])
  const result = await fetchTickTickWeek()
  assert.equal(result.error, undefined)
  assert.equal(result.tasks[0].date, timestamp)
  process.env.TZ = 'America/Los_Angeles'
  assert.equal(new Date(result.tasks[0].date).getDate(), 8)
  assert.equal(new Date(result.tasks[0].date).getHours(), 23)
})

test('splits exactly-200 results with inclusive boundaries, open outer ranges and deduplication', async () => {
  const initial = Array.from({ length: 200 }, (_, i) => event(`task-${i}`))
  respond = (path, body) => {
    if (path === '/project') return ok([])
    if (!body.startDate && !body.endDate) return ok(initial)
    if (body.endDate) return ok([event('boundary', body.endDate), event('past', '1990-01-01')])
    return ok([event('boundary', body.startDate), event('far-future', '2090-01-01')])
  }
  const result = await fetchTickTickWeek()
  assert.equal(result.tasks.length, 203)
  assert.match(result.error, /tasks without start dates may be missing/)
  const filters = requests.filter(r => r.body).map(r => r.body)
  assert.equal(filters.length, 3)
  assert.equal(filters[1].startDate, undefined)
  assert.equal(filters[2].endDate, undefined)
  assert.equal(filters[1].endDate, filters[2].startDate)
  assert.match(filters[1].endDate, /T00:00:00\+0000$/)
})

test('dense/ignored date filters stop with an explicit incomplete error and bounded requests', async () => {
  filterResponse(Array.from({ length: 200 }, (_, i) => event(`dense-${i}`)))
  const result = await fetchTickTickWeek()
  assert.equal(result.tasks.length, 200)
  assert.match(result.error, /incomplete/)
  assert.match(result.error, /at least 200 tasks share a date range/)
  assert.ok(requests.filter(r => r.body).length <= 64)
})

test('request budget prevents runaway subdivision', async () => {
  const full = Array.from({ length: 200 }, (_, i) => event(`dense-${i}`))
  respond = (path, body) => {
    if (path === '/project') return ok([])
    const low = Date.parse(body.startDate ?? '0001-01-01T00:00:00Z')
    const high = Date.parse(body.endDate ?? '9999-12-31T00:00:00Z')
    return ok(high - low > 86400000 ? full : [])
  }
  const result = await fetchTickTickWeek()
  assert.match(result.error, /request limit reached/)
  assert.equal(requests.filter(r => r.body).length, 64)
})

test('HTTP failures never look like a successful empty calendar or leak response bodies', async () => {
  for (const status of [401, 403, 429, 500]) {
    respond = path => path === '/project' ? ok([]) : {
      ok: false, status, json: async () => { throw new Error('mock-only-token') },
    }
    const result = await fetchTickTickWeek()
    assert.equal(result.configured, true)
    assert.deepEqual(result.tasks, [])
    assert.match(result.error, new RegExp(`HTTP ${status}`))
    assert.ok(!result.error.includes('mock-only-token'))
  }
})

test('project metadata failure still returns Inbox tasks with an error', async () => {
  respond = path => path === '/project' ? { ok: false, status: 503 } : ok([event('inbox')])
  const result = await fetchTickTickWeek()
  assert.equal(result.tasks.length, 1)
  assert.match(result.error, /HTTP 503/)
})

test('later range failure retains collected tasks and reports the failure', async () => {
  respond = (path, body) => {
    if (path === '/project') return ok([])
    if (body.startDate || body.endDate) return { ok: false, status: 502 }
    return ok(Array.from({ length: 200 }, (_, i) => event(`partial-${i}`)))
  }
  const result = await fetchTickTickWeek()
  assert.equal(result.tasks.length, 200)
  assert.match(result.error, /HTTP 502/)
})

test('malformed data, JSON and network errors are explicit and sanitized', async () => {
  for (const response of [
    () => ok({ tasks: [] }),
    () => ok(null),
    () => ok([null]),
    () => ok([{ id: 'broken', startDate: '2031-01-01' }]),
    () => ({ ok: true, json: async () => { throw new Error('mock-only-token') } }),
    () => { throw new Error('mock-only-token') },
  ]) {
    respond = path => path === '/project' ? ok([]) : response()
    const result = await fetchTickTickWeek()
    assert.ok(result.error)
    assert.ok(!result.error.includes('mock-only-token'))
  }
})

test('invalid calendar dates/time zones produce errors instead of silent omissions', async () => {
  for (const task of [
    event('invalid', 'not-a-date'), event('invalid', '2031-02-30'),
    event('invalid', '2031-13-01'), event('invalid', '2031-01-01T99:00:00Z'),
    event('invalid', '2031-01-01T00:00:00Z', { isAllDay: true, timeZone: 'invalid-zone' }),
  ]) {
    filterResponse([task])
    const result = await fetchTickTickWeek()
    assert.match(result.error, /invalid task/)
    assert.deepEqual(result.tasks, [])
  }
})

test('unconfigured makes no HTTP calls; config errors are sanitized', async () => {
  config = { keys: { ticktickToken: '' } }
  assert.deepEqual(await fetchTickTickWeek(), { configured: false, tasks: [] })
  assert.equal(requests.length, 0)
  config = null
  const result = await fetchTickTickWeek()
  assert.equal(result.configured, true)
  assert.ok(result.error)
  assert.equal(requests.length, 0)
})

test('a genuinely empty filter succeeds', async () => {
  filterResponse([])
  assert.deepEqual(await fetchTickTickWeek(), { configured: true, tasks: [] })
})
