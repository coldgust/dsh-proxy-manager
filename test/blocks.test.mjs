/** The managed shell block and the Maven `<proxy>` element. */
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
  currentEnv,
  inspectTool,
} from '../lib/index.js'

const temporaries = []

after(async () => {
  await Promise.all(temporaries.map(root => fs.rm(root, { recursive: true, force: true })))
})

async function tempEnv() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-blocks-'))
  temporaries.push(root)
  return { root, env: currentEnv({ HOME: root, DSH_HOME: path.join(root, '.dsh'), PATH: process.env.PATH ?? '' }) }
}

const adapter = id => {
  const found = builtinAdapters.find(entry => entry.id === id)
  assert.ok(found, `adapter ${id}`)
  return found
}
const PROXY = { url: 'http://127.0.0.1:7890', noProxy: 'localhost,127.0.0.1' }

test('the four new adapters ship and are configurable', () => {
  for (const id of ['maven', 'shell', 'curl', 'wget']) assert.ok(adapter(id), `${id} is built in`)
})

test('the shell block is added, replaced and removed without touching the profile', async () => {
  const { root, env } = await tempEnv()
  await fs.writeFile(path.join(root, '.zshrc'), 'export PATH="$HOME/bin:$PATH"\nalias ll="ls -l"\n', 'utf8')
  const spec = adapter('shell')

  const enabled = await applyTool(spec, PROXY, env)
  assert.equal(enabled.error, undefined)
  assert.equal(enabled.url, PROXY.url)
  const text = await fs.readFile(enabled.path, 'utf8')
  assert.match(text, /alias ll="ls -l"/, 'unrelated profile content survives')
  assert.match(text, /# >>> dsh-proxy-manager >>>/)
  assert.match(text, /export HTTP_PROXY="http:\/\/127\.0\.0\.1:7890"/)
  assert.match(text, /export NO_PROXY="localhost,127\.0\.0\.1"/)

  // A second apply replaces the block instead of stacking another one.
  await applyTool(spec, { url: 'http://10.0.0.1:8080', noProxy: '' }, env)
  const replaced = await fs.readFile(enabled.path, 'utf8')
  assert.equal(replaced.match(/# >>> dsh-proxy-manager >>>/g).length, 1)
  assert.match(replaced, /export HTTPS_PROXY="http:\/\/10\.0\.0\.1:8080"/)
  assert.doesNotMatch(replaced, /NO_PROXY/)

  const cleared = await clearTool(spec, env)
  assert.equal(cleared.enabled, false)
  const restored = await fs.readFile(cleared.path, 'utf8')
  assert.equal(restored, 'export PATH="$HOME/bin:$PATH"\nalias ll="ls -l"\n')
})

test('a Windows profile uses PowerShell assignments', async () => {
  const { root, env } = await tempEnv()
  const spec = adapter('shell')
  const winEnv = { ...env, platform: 'win32' }
  const status = await applyTool(spec, PROXY, winEnv)
  const text = await fs.readFile(status.path, 'utf8')
  assert.match(text, /\$env:HTTP_PROXY = "http:\/\/127\.0\.0\.1:7890"/)
  assert.equal((await inspectTool(spec, winEnv)).enabled, true)
})

test('Maven gets one owned proxy element, creating the document when absent', async () => {
  const { root, env } = await tempEnv()
  const spec = adapter('maven')
  const enabled = await applyTool(spec, PROXY, env)
  assert.equal(enabled.error, undefined)
  assert.equal(enabled.url, PROXY.url)
  assert.equal(enabled.noProxy, 'localhost,127.0.0.1')
  const text = await fs.readFile(enabled.path, 'utf8')
  assert.match(text, /<id>dsh-proxy-manager<\/id>/)
  assert.match(text, /<host>127\.0\.0\.1<\/host>/)
  assert.match(text, /<port>7890<\/port>/)
  assert.match(text, /<nonProxyHosts>localhost\|127\.0\.0\.1<\/nonProxyHosts>/, 'JVM bypass uses pipes')

  // Existing content, including another tool's proxy element, is preserved.
  const existing = `<?xml version="1.0"?>\n<settings>\n  <proxies>\n    <proxy>\n      <id>corp</id>\n      <active>false</active>\n    </proxy>\n  </proxies>\n  <mirrors>\n    <mirror><id>aliyun</id></mirror>\n  </mirrors>\n</settings>\n`
  await fs.writeFile(path.join(root, '.m2', 'settings.xml'), existing, 'utf8')
  await applyTool(spec, { url: 'http://10.0.0.1:8080', noProxy: '' }, env)
  const merged = await fs.readFile(path.join(root, '.m2', 'settings.xml'), 'utf8')
  assert.match(merged, /<id>corp<\/id>/, 'another proxy element survives')
  assert.match(merged, /<id>aliyun<\/id>/, 'unrelated sections survive')
  assert.equal(merged.match(/<id>dsh-proxy-manager<\/id>/g).length, 1)

  const cleared = await clearTool(spec, env)
  assert.equal(cleared.enabled, false)
  const afterClear = await fs.readFile(path.join(root, '.m2', 'settings.xml'), 'utf8')
  assert.doesNotMatch(afterClear, /dsh-proxy-manager/)
  assert.match(afterClear, /<id>corp<\/id>/)
})

test('a settings.xml without a close tag is refused rather than guessed at', async () => {
  const { root, env } = await tempEnv()
  await fs.mkdir(path.join(root, '.m2'), { recursive: true })
  await fs.writeFile(path.join(root, '.m2', 'settings.xml'), '<settings><broken>', 'utf8')
  const status = await applyTool(adapter('maven'), PROXY, env)
  assert.match(status.error, /no <\/settings> close tag/)
})

test('curl and wget write their own key/value forms', async () => {
  const { root, env } = await tempEnv()
  const curl = await applyTool(adapter('curl'), PROXY, env)
  const curlText = await fs.readFile(curl.path, 'utf8')
  assert.match(curlText, /^proxy=http:\/\/127\.0\.0\.1:7890$/m)
  assert.match(curlText, /^noproxy=localhost,127\.0\.0\.1$/m)

  const wget = await applyTool(adapter('wget'), PROXY, env)
  const wgetText = await fs.readFile(wget.path, 'utf8')
  assert.match(wgetText, /^http_proxy=http:\/\/127\.0\.0\.1:7890$/m)
  assert.match(wgetText, /^https_proxy=http:\/\/127\.0\.0\.1:7890$/m)
  assert.match(wgetText, /^no_proxy=localhost,127\.0\.0\.1$/m)
  assert.equal((await inspectTool(adapter('wget'), env)).enabled, true)
})

test('every built-in adapter still enables and clears on a clean home', async () => {
  for (const spec of builtinAdapters) {
    const { env } = await tempEnv()
    const enabled = await applyTool(spec, PROXY, env)
    assert.equal(enabled.error, undefined, `${spec.id} wrote without error`)
    assert.equal(enabled.enabled, true, `${spec.id} reports the proxy`)
    const cleared = await clearTool(spec, env)
    assert.equal(cleared.enabled, false, `${spec.id} clears the proxy`)
  }
})

test('the page lists the new adapters in the snapshot', async () => {
  const { env } = await tempEnv()
  const snapshot = await new ProxyManager(env).snapshot()
  assert.equal(snapshot.tools.length, builtinAdapters.length)
  const ids = snapshot.tools.map(tool => tool.id)
  for (const id of ['maven', 'shell', 'curl', 'wget']) assert.ok(ids.includes(id))
})
