/** Display ordering, search and paging rules for the adapter list. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesQuery, orderTools, pageSlice } from '../lib/index.js'

/** One snapshot row with the fields the list rules read. */
function tool(id, { enabled = false, exists = true, name = id, ...rest } = {}) {
  return { id, name, enabled, exists, displayPath: `~/${id}`, path: `/home/u/${id}`, ...rest }
}

test('pinned rows come first, then configured, then unconfigured, then missing files', () => {
  const tools = [
    tool('a-missing', { enabled: true, exists: false }),
    tool('b-off'),
    tool('c-on', { enabled: true }),
    tool('d-pinned-off'),
    tool('e-pinned-on', { enabled: true }),
    tool('f-missing', { exists: false }),
  ]
  const ordered = orderTools(tools, ['d-pinned-off', 'e-pinned-on'])
  assert.deepEqual(ordered.map(entry => entry.id), [
    'd-pinned-off',
    'e-pinned-on',
    'c-on',
    'b-off',
    'a-missing',
    'f-missing',
  ])
})

test('a pinned row keeps pin order, not registry order', () => {
  const tools = [tool('first'), tool('second'), tool('third')]
  assert.deepEqual(orderTools(tools, ['third', 'first']).map(entry => entry.id), ['third', 'first', 'second'])
})

test('search matches name, id, path, proxy and category case-insensitively', () => {
  const git = tool('git', { name: 'Git', category: 'version-control', url: 'http://127.0.0.1:52345' })
  assert.equal(matchesQuery(git, ''), true)
  assert.equal(matchesQuery(git, '  '), true)
  assert.equal(matchesQuery(git, 'GIT'), true)
  assert.equal(matchesQuery(git, 'gitconfig'), false)
  assert.equal(matchesQuery(git, '~/git'), true)
  assert.equal(matchesQuery(git, 'version'), true)
  assert.equal(matchesQuery(git, '52345'), true)
  assert.equal(matchesQuery(git, 'npm'), false)
})

test('the page shows 10 rows per page by default', () => {
  const rows = Array.from({ length: 13 }, (_, index) => tool(`t${String(index)}`))
  const first = pageSlice(rows, 1, 10)
  assert.equal(first.items.length, 10)
  assert.equal(first.pages, 2, '13 adapters need two pages')
  assert.equal(pageSlice(rows, 2, 10).items.length, 3)
})

test('paging clamps an out-of-range page', () => {
  const rows = Array.from({ length: 45 }, (_, index) => tool(`t${String(index)}`))
  const first = pageSlice(rows, 1, 20)
  assert.equal(first.items.length, 20)
  assert.equal(first.pages, 3)
  assert.equal(first.total, 45)
  assert.equal(first.items[0].id, 't0')

  const second = pageSlice(rows, 2, 20)
  assert.equal(second.items.length, 20)
  assert.equal(second.items[0].id, 't20')

  const third = pageSlice(rows, 3, 20)
  assert.equal(third.items.length, 5)

  // A page beyond the end shows the last page; page 0 shows the first.
  assert.equal(pageSlice(rows, 99, 20).page, 3)
  assert.equal(pageSlice(rows, 0, 20).page, 1)
  assert.equal(pageSlice([], 5, 20).pages, 1)
  assert.equal(pageSlice([], 5, 20).items.length, 0)
})
