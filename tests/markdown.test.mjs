import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown, parseInline } from '../lib/markdown.ts'

/* ── blocks ─────────────────────────────────────────────────────────── */

test('parseMarkdown reads paragraphs, keeping soft line breaks', () => {
  const n = parseMarkdown('hello there\nsecond line\n\nnew para')
  assert.equal(n.length, 2)
  assert.equal(n[0].type, 'paragraph')
  assert.deepEqual(n[0].children, [{ type: 'text', text: 'hello there\nsecond line' }])
  assert.deepEqual(n[1].children, [{ type: 'text', text: 'new para' }])
})

test('parseMarkdown reads ATX headings with their level', () => {
  const n = parseMarkdown('# One\n### Three')
  assert.equal(n[0].type, 'heading'); assert.equal(n[0].level, 1)
  assert.deepEqual(n[0].children, [{ type: 'text', text: 'One' }])
  assert.equal(n[1].level, 3)
})

test('parseMarkdown does not treat a bare hash as a heading', () => {
  const n = parseMarkdown('#nothashtag')
  assert.equal(n[0].type, 'paragraph')
})

test('parseMarkdown captures fenced code with its language', () => {
  const n = parseMarkdown('before\n\n```python\nx = 1\ny = 2\n```\n\nafter')
  assert.equal(n[1].type, 'code')
  assert.equal(n[1].lang, 'python')
  assert.equal(n[1].text, 'x = 1\ny = 2')
  assert.equal(n[2].type, 'paragraph')
})

test('parseMarkdown treats an unterminated fence as code to the end', () => {
  const n = parseMarkdown('```\nnever closed\nstill code')
  assert.equal(n.length, 1)
  assert.equal(n[0].type, 'code')
  assert.equal(n[0].text, 'never closed\nstill code')
})

test('parseMarkdown never parses markup inside a fence', () => {
  const n = parseMarkdown('```\n**not bold** and # not heading\n```')
  assert.equal(n[0].text, '**not bold** and # not heading')
})

test('parseMarkdown reads bullet and numbered lists', () => {
  const b = parseMarkdown('- one\n- two\n* three')
  assert.equal(b[0].type, 'list')
  assert.equal(b[0].ordered, false)
  assert.equal(b[0].items.length, 3)
  assert.deepEqual(b[0].items[0], [{ type: 'text', text: 'one' }])

  const o = parseMarkdown('1. first\n2) second')
  assert.equal(o[0].ordered, true)
  assert.equal(o[0].items.length, 2)
})

test('parseMarkdown separates a list from the paragraph after it', () => {
  const n = parseMarkdown('- a\n- b\n\ntrailing text')
  assert.equal(n[0].type, 'list')
  assert.equal(n[1].type, 'paragraph')
})

test('parseMarkdown reads blockquotes and horizontal rules', () => {
  const n = parseMarkdown('> quoted\n\n---')
  assert.equal(n[0].type, 'quote')
  assert.deepEqual(n[0].children, [{ type: 'text', text: 'quoted' }])
  assert.equal(n[1].type, 'hr')
})

test('parseMarkdown returns nothing for empty or whitespace input', () => {
  assert.deepEqual(parseMarkdown(''), [])
  assert.deepEqual(parseMarkdown('   \n\n  '), [])
})

/* ── inline ─────────────────────────────────────────────────────────── */

test('parseInline reads bold, italic and strikethrough', () => {
  assert.deepEqual(parseInline('a **b** c'), [
    { type: 'text', text: 'a ' },
    { type: 'strong', children: [{ type: 'text', text: 'b' }] },
    { type: 'text', text: ' c' },
  ])
  assert.equal(parseInline('_hi_')[0].type, 'em')
  assert.equal(parseInline('~~gone~~')[0].type, 'strike')
})

test('parseInline gives inline code precedence over emphasis', () => {
  const n = parseInline('use `**literal**` here')
  assert.equal(n[1].type, 'code')
  assert.equal(n[1].text, '**literal**')
})

test('parseInline nests emphasis inside strong', () => {
  const n = parseInline('**bold _and italic_**')
  assert.equal(n[0].type, 'strong')
  assert.equal(n[0].children[1].type, 'em')
})

test('parseInline leaves unmatched delimiters as literal text', () => {
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ type: 'text', text: '2 * 3 * 4' }])
  assert.deepEqual(parseInline('**unclosed'), [{ type: 'text', text: '**unclosed' }])
})

test('parseInline reads http and mailto links', () => {
  const n = parseInline('see [docs](https://example.com/x) ok')
  assert.equal(n[1].type, 'link')
  assert.equal(n[1].href, 'https://example.com/x')
  assert.equal(n[1].text, 'docs')
  assert.equal(parseInline('[m](mailto:a@b.c)')[0].type, 'link')
})

test('parseInline refuses javascript: and data: hrefs, keeping them as text', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x']) {
    const n = parseInline(`[click](${bad})`)
    assert.equal(n.length, 1, `${bad} should not become a link`)
    assert.equal(n[0].type, 'text')
    assert.equal(n[0].text, `[click](${bad})`)
  }
})

test('parseInline leaves raw HTML as literal text', () => {
  const n = parseInline('<script>alert(1)</script>')
  assert.equal(n.length, 1)
  assert.equal(n[0].type, 'text')
  assert.equal(n[0].text, '<script>alert(1)</script>')
})
