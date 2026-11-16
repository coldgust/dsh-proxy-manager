/**
 * Behaviour tests for the proxy manager core, run against the built bundle so
 * the shipped code is what is verified. Each test uses its own temporary home.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  ProxyManager,
  applyTool,
  builtinAdapters,
  clearTool,
  clearToolConfig,
  currentEnv,
  inspectTool,
  parseProxy,
  readToolConfig,
  readValue,
  removeValue,
  writeToolConfig,
  writeValue,
} from '../lib/index.js'

const temporaries = []

/** Create a throwaway home directory with its own harness home. */
async function temporaryEnv() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-manager-'))
  temporaries.push(root)
  return {
    root,
    env: currentEnv({
      HOME: root,
      DSH_HOME: path.join(root, '.dsh'),
      PATH: process.env.PATH ?? '',
    }),
  }
}

/** Adapter by id. */
function adapter(id) {
  const found = builtinAdapters.find(entry => entry.id === id)
  assert.ok(found, `adapter ${id} exists`)
  return found
}

after(async () => {
  await Promise.all(temporaries.map(root => fs.rm(root, { recursive: true, force: true })))
})

test('parseProxy accepts URLs and bare host:port', () => {
  assert.equal(parseProxy('http://127.0.0.1:7890')?.url, 'http://127.0.0.1:7890')
  assert.equal(parseProxy('127.0.0.1:7890')?.scheme, 'http')
  assert.equal(parseProxy('socks5://127.0.0.1:1080')?.port, '1080')
  assert.equal(parseProxy('https://proxy.example.com')?.port, '443')
  assert.equal(parseProxy('not a proxy'), undefined)
  assert.equal(parseProxy('   '), undefined)
})

test('ini dialect edits one section and keeps comments', () => {
  const text = ['# my git config', '[user]', '\tname = Zephyr', '[http]', '\tproxy = http://old:1234', ''].join('\n')
  const target = { kind: 'ini', section: 'http', key: 'proxy' }
  assert.equal(readValue(text, target), 'http://old:1234')
  const updated = writeValue(text, target, 'http://new:7890')
  assert.match(updated, /# my git config/)
  assert.match(updated, /name = Zephyr/)
  assert.match(updated, /proxy = http:\/\/new:7890/)
  assert.doesNotMatch(updated, /old:1234/)
  assert.equal(readValue(removeValue(updated, target), target), undefined)
  assert.match(removeValue(updated, target), /\[http\]/)
})

test('ini dialect appends a missing section at the end', () => {
  const updated = writeValue('[user]\n\tname = a\n', { kind: 'ini', section: 'https', key: 'proxy' }, 'http://x:1')
  assert.equal(updated, '[user]\n\tname = a\n\n[https]\nproxy = http://x:1\n')
})

test('props, yaml, toml and env dialects round-trip', () => {
  const props = writeValue('registry=https://r.example\n', { kind: 'props', key: 'proxy' }, 'http://p:1')
  assert.equal(readValue(props, { kind: 'props', key: 'proxy' }), 'http://p:1')
  assert.match(props, /registry=https:\/\/r\.example/)

  const yaml = writeValue('nodeLinker: node-modules\n', { kind: 'yaml', key: 'httpProxy' }, 'http://y:2')
  assert.equal(readValue(yaml, { kind: 'yaml', key: 'httpProxy' }), 'http://y:2')
  assert.match(yaml, /nodeLinker: node-modules/)

  const toml = writeValue('[net]\nretry = 3\n', { kind: 'toml', section: 'http', key: 'proxy' }, 'http://t:3')
  assert.equal(readValue(toml, { kind: 'toml', section: 'http', key: 'proxy' }), 'http://t:3')
  assert.match(toml, /\[http\]\nproxy = "http:\/\/t:3"/)

  const env = writeValue('EXISTING=1\n', { kind: 'env', key: 'HTTPS_PROXY' }, 'http://e:4')
  assert.equal(readValue(env, { kind: 'env', key: 'https_proxy' }), 'http://e:4')
  assert.match(env, /EXISTING=1/)
})

test('json dialect writes nested proxy objects and keeps sibling keys', () => {
  const text = JSON.stringify({ auths: { 'ghcr.io': {} } }, null, 2)
  const written = writeToolConfig(text, adapter('docker'), { url: 'http://127.0.0.1:7890', noProxy: 'localhost' })
  const parsed = JSON.parse(written)
  assert.equal(parsed.proxies.default.httpProxy, 'http://127.0.0.1:7890')
  assert.equal(parsed.proxies.default.httpsProxy, 'http://127.0.0.1:7890')
  assert.equal(parsed.proxies.default.noProxy, 'localhost')
  assert.deepEqual(parsed.auths, { 'ghcr.io': {} })
  const cleared = JSON.parse(clearToolConfig(written, adapter('docker')))
  assert.equal(cleared.proxies.default.httpProxy, undefined)
  assert.deepEqual(cleared.auths, { 'ghcr.io': {} })
})

test('every built-in adapter enables, reports and clears on a clean home', async () => {
  for (const spec of builtinAdapters) {
    const { env } = await temporaryEnv()
    const before = await inspectTool(spec, env)
    assert.equal(before.enabled, false, `${spec.id} starts disabled`)
    assert.equal(before.exists, false, `${spec.id} file starts absent`)

    const enabled = await applyTool(spec, { url: 'http://127.0.0.1:7890', noProxy: 'localhost,127.0.0.1' }, env)
    assert.equal(enabled.error, undefined, `${spec.id} wrote without error`)
    assert.equal(enabled.enabled, true, `${spec.id} reports the proxy`)
    assert.equal(enabled.url, 'http://127.0.0.1:7890', `${spec.id} reports the written URL`)

    const configText = await fs.readFile(enabled.path, 'utf8')
    assert.ok(configText.length > 0, `${spec.id} wrote a file`)

    const cleared = await clearTool(spec, env)
    assert.equal(cleared.enabled, false, `${spec.id} clears the proxy`)
    assert.equal(cleared.error, undefined)
  }
})

test('gradle stores host and port separately and joins the bypass list with pipes', async () => {
  const { env } = await temporaryEnv()
  const spec = adapter('gradle')
  const status = await applyTool(spec, { url: 'http://127.0.0.1:7890', noProxy: 'localhost,127.0.0.1' }, env)
  const text = await fs.readFile(status.path, 'utf8')
  assert.match(text, /systemProp\.http\.proxyHost=127\.0\.0\.1/)
  assert.match(text, /systemProp\.http\.proxyPort=7890/)
  assert.match(text, /systemProp\.http\.nonProxyHosts=localhost\|127\.0\.0\.1/)
  assert.equal(status.url, 'http://127.0.0.1:7890')
  assert.equal(status.noProxy, 'localhost,127.0.0.1')
})

test('the dsh adapter writes the harness-home .env', async () => {
  const { env } = await temporaryEnv()
  const spec = adapter('dsh')
  const status = await applyTool(spec, { url: 'http://127.0.0.1:7890', noProxy: 'localhost' }, env)
  assert.equal(status.path, path.join(env.dshHome, '.env'))
  assert.equal(status.displayPath, '$DSH_HOME/.env')
  const reading = readToolConfig(await fs.readFile(status.path, 'utf8'), spec)
  assert.equal(reading.url, 'http://127.0.0.1:7890')
  assert.equal(reading.noProxy, 'localhost')
})

test('service applies and clears every adapter and persists settings', async () => {
  const { env } = await temporaryEnv()
  const manager = new ProxyManager(env)

  const initial = await manager.snapshot()
  assert.equal(initial.tools.length, builtinAdapters.length)
  assert.deepEqual(initial.enabled, [])

  await manager.saveSettings({ url: '127.0.0.1:7890', noProxy: 'localhost' })
  const applied = await manager.apply()
  assert.equal(applied.snapshot.enabled.length, builtinAdapters.length)
  assert.ok(applied.results.every(result => result.ok), 'no adapter failed')

  const stateFile = path.join(env.dshHome, 'proxy-manager', 'state.json')
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'))
  assert.equal(state.settings.url, 'http://127.0.0.1:7890')

  const cleared = await manager.clear({ tools: ['git'] })
  assert.deepEqual(cleared.snapshot.enabled.includes('git'), false)
  assert.equal(cleared.snapshot.enabled.length, builtinAdapters.length - 1)

  const fresh = new ProxyManager(env).snapshot()
  assert.equal((await fresh).settings.noProxy, 'localhost', 'settings survive a restart')
})

test('service rejects an invalid proxy address and an unknown tool id', async () => {
  const { env } = await temporaryEnv()
  const manager = new ProxyManager(env)
  await assert.rejects(() => manager.saveSettings({ url: 'not a proxy' }), /not a valid proxy address/)
  await assert.rejects(() => manager.apply({ tools: ['nope'] }), /unknown tool id/)
})

test('user-added adapters are stored, used and removable', async () => {
  const { env } = await temporaryEnv()
  const manager = new ProxyManager(env)
  await manager.addTool({
    id: 'bun',
    name: 'Bun',
    kind: 'toml',
    path: '~/.bunfig.toml',
    fields: [{ key: 'proxy', part: 'url' }],
  })
  const snapshot = await manager.snapshot()
  const bun = snapshot.tools.find(tool => tool.id === 'bun')
  assert.ok(bun, 'the added adapter is listed')
  assert.equal(bun.custom, true)

  await manager.saveSettings({ url: 'http://127.0.0.1:7890' })
  const applied = await manager.apply({ tools: ['bun'] })
  assert.equal(applied.snapshot.tools.find(tool => tool.id === 'bun').enabled, true)

  const removed = await manager.removeTool('bun')
  assert.equal(removed.tools.some(tool => tool.id === 'bun'), false)

  await assert.rejects(() => manager.addTool({ id: 'git', name: 'Git again', kind: 'props', path: '~/x', fields: [{ key: 'proxy', part: 'url' }] }), /built-in adapter id/)
  await assert.rejects(() => manager.addTool({ id: 'Bad Id', name: 'x', kind: 'props', path: '~/x', fields: [{ key: 'p', part: 'url' }] }), /lowercase/)
})

test('another plugin can register an adapter at runtime', async () => {
  const { env } = await temporaryEnv()
  const manager = new ProxyManager(env)
  const dispose = manager.registerTool({
    id: 'example-plugin-tool',
    name: 'Example',
    kind: 'props',
    path: '~/.example/rc',
    fields: [{ key: 'proxy', part: 'url' }],
  })
  assert.ok((await manager.snapshot()).tools.some(tool => tool.id === 'example-plugin-tool'))
  dispose()
  assert.equal((await manager.snapshot()).tools.some(tool => tool.id === 'example-plugin-tool'), false)
})

test('an unreadable configuration degrades to a per-tool error', async () => {
  const { env, root } = await temporaryEnv()
  const broken = path.join(root, 'broken.json')
  await fs.writeFile(broken, '{ not json', 'utf8')
  const spec = { id: 'broken', name: 'Broken', kind: 'json', path: broken, fields: [{ key: 'proxy', part: 'url' }] }
  const status = await inspectTool(spec, env)
  assert.equal(status.enabled, false)
  assert.match(status.error, /invalid JSON/)
  const applied = await applyTool(spec, { url: 'http://127.0.0.1:7890', noProxy: '' }, env)
  assert.match(applied.error, /invalid JSON/)
})

test('the package entry forwards the Host inject list unchanged', async () => {
  const entry = await import('../lib/loader.js')
  const host = await import('../lib/index.js')
  assert.deepEqual(entry.inject, host.inject)
  assert.equal(typeof entry.apply, 'function')
  assert.deepEqual(host.inject, ['connection', 'webServer'])
})
