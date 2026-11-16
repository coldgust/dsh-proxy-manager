/**
 * Contract test for the browser half. The bundle is loaded the way the page
 * loads it — through the module-loader envelope with `react` supplied by the
 * shared table — so the factory shape, the slot registrations and the endpoint
 * names the page calls are verified against the same build the Host serves.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const bundlePath = path.join(root, 'lib', 'client.js')

/** Minimal React stand-in: the page component only needs element factories. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useCallback: fn => fn,
  useId: () => 'id',
  useRef: value => ({ current: value }),
}

/** Load the bundle through the loader envelope and return the plugin it registers. */
async function loadClientPlugin() {
  const source = await fs.readFile(bundlePath, 'utf8')
  let registered
  const window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        registered = { id, factory }
      },
    },
  }
  // The envelope is a classic script: evaluate it with the browser globals it expects.
  const evaluate = new Function('window', source)
  evaluate(window)
  assert.ok(registered, 'the bundle registers one lazy factory')
  const moduleExports = registered.factory(name => {
    assert.equal(name, 'react', 'the bundle requests only the shared react module')
    return reactStub
  })
  return { id: registered.id, plugin: moduleExports }
}

test('the browser bundle registers one factory for the package name', async () => {
  const { id, plugin } = await loadClientPlugin()
  assert.equal(id, 'dsh-proxy-manager')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')
})

test('the page registers a settings section and its icon with localized labels', async () => {
  const { plugin } = await loadClientPlugin()
  const registrations = []
  const dictionaries = []
  const injected = []
  const ctx = {
    slots: {
      inject(key, callback) {
        injected.push(key)
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    locale: {
      register(namespace, dicts) {
        dictionaries.push({ namespace, dicts })
        return () => {}
      },
      bind: () => key => `t:${key}`,
    },
    effect: (setup, label) => {
      const disposer = setup()
      return { label, disposer }
    },
  }
  plugin.apply(ctx)

  assert.deepEqual(injected.sort(), ['settings.section', 'settings.section.icon'])
  const section = registrations.find(entry => entry.options.name === 'settings.section')
  assert.ok(section, 'a settings.section registration exists')
  assert.equal(section.options.id, 'proxy-manager')
  assert.equal(section.options.locale, 'dsh-proxy-manager')
  assert.equal(typeof section.options.label, 'function')
  assert.equal(section.options.label(), 't:nav')
  const face = section.options.inject()
  assert.equal(typeof face.request, 'function', 'the page receives its request face')
  assert.equal(typeof section.component, 'function', 'the section renders a component')

  const icon = registrations.find(entry => entry.options.name === 'settings.section.icon')
  assert.equal(icon.options.id, 'proxy-manager', 'the nav icon is addressed by the section id')

  const dictionary = dictionaries.find(entry => entry.namespace === 'dsh-proxy-manager')
  assert.ok(dictionary, 'the page registers its dictionary')
  assert.ok(dictionary.dicts.en.nav && dictionary.dicts.zh.nav, 'English and Chinese copy ship together')
})

test('the page posts JSON to the Host prefix the Host half registers', async () => {
  const host = await import('../lib/index.js')
  const { plugin } = await loadClientPlugin()
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    return new Response(JSON.stringify({ ok: true, value: { tools: [], enabled: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const state = {}
  const ctx = {
    slots: {
      inject: (key, callback) => callback(),
      register: (options) => {
        if (options.name === 'settings.section') state.face = options.inject()
        return () => {}
      },
    },
    locale: { register: () => () => {}, bind: () => key => key },
    effect: setup => setup(),
  }
  plugin.apply(ctx)

  const outcome = await state.face.request('snapshot', { a: 1 })
  assert.deepEqual(outcome, { ok: true, value: { tools: [], enabled: [] } })
  assert.deepEqual(calls, [{ url: `${host.CHANNEL}/snapshot`, method: 'POST', body: '{"a":1}' }])
})

test('a transport failure or an error status becomes a failure value', async () => {
  const { plugin } = await loadClientPlugin()
  const state = {}
  globalThis.fetch = async () => { throw new Error('transport down') }
  const ctx = {
    slots: { inject: (key, callback) => callback(), register: (options) => {
      if (options.name === 'settings.section') state.face = options.inject()
      return () => {}
    } },
    locale: { register: () => () => {}, bind: () => key => key },
    effect: setup => setup(),
  }
  plugin.apply(ctx)
  const failure = await state.face.request('snapshot', {})
  assert.equal(failure.ok, false)
  assert.equal(failure.error.message, 'transport down')

  globalThis.fetch = async () => new Response('nope', { status: 405 })
  const second = await state.face.request('snapshot', {})
  assert.equal(second.ok, false)
  assert.match(second.error.message, /HTTP 405/)
})

test('the Host prefix constant matches the URL the page posts to', async () => {
  const host = await import('../lib/index.js')
  const { plugin } = await loadClientPlugin()
  const state = {}
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(url)
    return new Response(JSON.stringify({ ok: true, value: null }), { status: 200 })
  }
  const ctx = {
    slots: { inject: (key, callback) => callback(), register: (options) => {
      if (options.name === 'settings.section') state.face = options.inject()
      return () => {}
    } },
    locale: { register: () => () => {}, bind: () => key => key },
    effect: setup => setup(),
  }
  plugin.apply(ctx)
  assert.equal(host.CHANNEL, '/dsh-proxy-manager')
  assert.equal(host.TOOL_NAME, 'proxy_manager')
  const endpoints = ['snapshot', 'apply', 'clear', 'saveSettings', 'addTool', 'removeTool', 'systemProxy', 'openConfig']
  for (const endpoint of endpoints) await state.face.request(endpoint, {})
  assert.deepEqual(urls, endpoints.map(endpoint => `${host.CHANNEL}/${endpoint}`))
})
