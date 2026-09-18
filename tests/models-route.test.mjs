/**
 * The model catalogue behind the dashboard's picker.
 *
 * These cover the pure parsers, which is where the real risk lives: `ollama
 * list` is human-formatted table output, and the CLI's provider cache is
 * someone else's JSON. The route handler only wires them together and is
 * covered by the live check in the handoff note.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })

const { parseOllamaList, parseConfigModel, parseProviderCache, buildModelGroups } = await import('../app/api/models/route.ts')

/* ── ollama list ─────────────────────────────────────────────────────────── */

test('parseOllamaList reads the real table output and skips the header', () => {
  const stdout = [
    'NAME           ID              SIZE      MODIFIED    ',
    'qwen3.8:27b    67a1c5bfe600    17 GB     5 days ago  ',
    'qwen3-vl:8b    901cae732162    6.1 GB    9 days ago  ',
    'gemma4:12b     4eb23ef187e2    7.6 GB    4 weeks ago ',
    '',
  ].join('\n')
  assert.deepEqual(parseOllamaList(stdout), [
    { id: 'qwen3.8:27b', provider: 'ollama' },
    { id: 'qwen3-vl:8b', provider: 'ollama' },
    { id: 'gemma4:12b', provider: 'ollama' },
  ])
})

test('parseOllamaList handles an empty or header-only response', () => {
  assert.deepEqual(parseOllamaList(''), [])
  assert.deepEqual(parseOllamaList('NAME  ID  SIZE  MODIFIED\n'), [])
})

/* ── config.yaml model block ─────────────────────────────────────────────── */

test('parseConfigModel reads the default and provider and stops at the next top-level key', () => {
  const yaml = [
    'model:',
    '  default: hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS',
    '  provider: ollama',
    '  context_length: 65536',
    'providers:',
    '  openrouter:',
    '    api_key: ${OPENROUTER_API_KEY}',
    '',
  ].join('\n')
  assert.deepEqual(parseConfigModel(yaml), { model: 'hf.co/unsloth/Qwen3.8-27B-GGUF:UD-IQ4_XS', provider: 'ollama' })
})

test('parseConfigModel returns nulls for a config with no model block', () => {
  assert.deepEqual(parseConfigModel('providers:\n  openrouter: {}\n'), { model: null, provider: null })
  assert.deepEqual(parseConfigModel(''), { model: null, provider: null })
})

/* ── provider cache ──────────────────────────────────────────────────────── */

test('parseProviderCache keeps providers that list models and drops malformed ones', () => {
  const raw = JSON.stringify({
    openrouter: { fp: 'x', at: 1, models: ['anthropic/claude-opus-5', 'deepseek/deepseek-v4-pro'] },
    empty: { models: [] },
    broken: { models: 'nope' },
  })
  assert.deepEqual(parseProviderCache(raw), [
    { provider: 'openrouter', models: ['anthropic/claude-opus-5', 'deepseek/deepseek-v4-pro'] },
  ])
  assert.deepEqual(parseProviderCache('not json'), [])
  assert.deepEqual(parseProviderCache('null'), [])
})

/* ── grouping ────────────────────────────────────────────────────────────── */

test('buildModelGroups leads with the configured default, then local, then provider catalogues', () => {
  const groups = buildModelGroups({
    current: { model: 'qwen3.8:27b', provider: 'ollama' },
    local: [{ id: 'qwen3.8:27b', provider: 'ollama' }, { id: 'gemma4:12b', provider: 'ollama' }],
    providers: [{ provider: 'openrouter', models: ['deepseek/deepseek-v4-pro'] }],
  })
  assert.deepEqual(groups.map(group => group.label), ['CURRENT', 'LOCAL · OLLAMA', 'OPENROUTER'])
  // qwen3.8:27b is both the default and installed locally: shown once, at the top.
  assert.deepEqual(groups[0].models, [{ id: 'qwen3.8:27b', provider: 'ollama', note: 'configured default' }])
  assert.deepEqual(groups[1].models, [{ id: 'gemma4:12b', provider: 'ollama' }])
  assert.deepEqual(groups[2].models, [{ id: 'deepseek/deepseek-v4-pro', provider: 'openrouter' }])
})

test('buildModelGroups omits empty groups and caps a long provider catalogue', () => {
  const groups = buildModelGroups({
    current: { model: null, provider: null },
    local: [],
    providers: [{ provider: 'openrouter', models: Array.from({ length: 200 }, (_, i) => `vendor/model-${i}`) }],
  })
  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, 'OPENROUTER')
  assert.equal(groups[0].models.length, 60)
  assert.deepEqual(buildModelGroups({ current: { model: null, provider: null }, local: [], providers: [] }), [])
})

test('buildModelGroups does not advertise an Ollama default absent from ollama list', () => {
  assert.deepEqual(buildModelGroups({
    current: { model: 'missing:latest', provider: 'ollama' },
    local: [{ id: 'installed:latest', provider: 'ollama' }],
    providers: [],
  }), [{ label: 'LOCAL · OLLAMA', models: [{ id: 'installed:latest', provider: 'ollama' }] }])
})
