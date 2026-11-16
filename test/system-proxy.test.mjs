/**
 * System-proxy detection: the three platform parsers plus the detection
 * branches, driven through an injected runner so no real command is spawned.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  ProxyManager,
  currentEnv,
  detectSystemProxy,
  parseGnomeProxy,
  parseScutilProxy,
  parseWindowsProxy,
} from '../lib/index.js'

const temporaries = []

after(async () => {
  await Promise.all(temporaries.map(root => fs.rm(root, { recursive: true, force: true })))
})

/** One environment with a chosen platform. */
function envOf(platform, home) {
  return currentEnv({ HOME: home, DSH_HOME: path.join(home, '.dsh'), PATH: process.env.PATH ?? '', ...{} }) &&
    { ...currentEnv({ HOME: home, DSH_HOME: path.join(home, '.dsh') }), platform }
}

const SCUTIL = `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
    2 : localhost
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 52345
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 52345
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 0
  SOCKSPort : 0
}
`

test('macOS scutil output becomes a proxy URL plus its bypass list', () => {
  const proxy = parseScutilProxy(SCUTIL)
  assert.deepEqual(proxy, {
    url: 'http://127.0.0.1:52345',
    noProxy: '*.local,169.254/16,localhost',
    source: 'macOS · scutil --proxy',
  })
})

test('a SOCKS-only macOS configuration becomes a socks5 URL', () => {
  const proxy = parseScutilProxy(`<dictionary> {
    SOCKSEnable : 1
    SOCKSPort : 1080
    SOCKSProxy : 127.0.0.1
  }`)
  assert.equal(proxy.url, 'socks5://127.0.0.1:1080')
})

test('a disabled macOS configuration detects nothing', () => {
  assert.equal(parseScutilProxy('<dictionary> {\n  HTTPEnable : 0\n  HTTPPort : 0\n}\n'), undefined)
})

test('Windows Internet Settings honour ProxyEnable, ProxyServer and ProxyOverride', () => {
  const text = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
    '    ProxyEnable    REG_DWORD    0x1',
    '    ProxyServer    REG_SZ    http=127.0.0.1:7890;https=127.0.0.1:7891',
    '    ProxyOverride    REG_SZ    *.local;<local>;192.168.*',
    '',
  ].join('\n')
  assert.deepEqual(parseWindowsProxy(text), {
    url: 'http://127.0.0.1:7891',
    noProxy: '*.local,192.168.*',
    source: 'Windows · Internet Settings',
  })
  assert.equal(parseWindowsProxy(text.replace('0x1', '0x0')), undefined)
  assert.equal(
    parseWindowsProxy('    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    10.0.0.1:8080\n').url,
    'http://10.0.0.1:8080',
  )
})

test('GNOME settings only apply in manual mode', () => {
  assert.deepEqual(parseGnomeProxy("'manual'", "'127.0.0.1'", '7890', "['localhost', '*.local']"), {
    url: 'http://127.0.0.1:7890',
    noProxy: 'localhost,*.local',
    source: 'GNOME · gsettings',
  })
  assert.equal(parseGnomeProxy("'none'", "'127.0.0.1'", '7890', '[]'), undefined)
})

test('detectSystemProxy asks the platform tool and degrades quietly', async () => {
  const darwin = await detectSystemProxy(envOf('darwin', os.tmpdir()), async (command) => {
    assert.equal(command, 'scutil')
    return SCUTIL
  })
  assert.equal(darwin.proxy.url, 'http://127.0.0.1:52345')

  const windows = await detectSystemProxy(envOf('win32', os.tmpdir()), async command => {
    assert.equal(command, 'reg')
    return '    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    127.0.0.1:7890\n'
  })
  assert.equal(windows.proxy.url, 'http://127.0.0.1:7890')

  const linux = await detectSystemProxy(envOf('linux', os.tmpdir()), async (command, args) => {
    assert.equal(command, 'gsettings')
    const key = args.join(' ')
    if (key.endsWith('mode')) return "'manual'"
    if (key.endsWith('host')) return "'10.1.2.3'"
    if (key.endsWith('port')) return '8080'
    return "['localhost']"
  })
  assert.equal(linux.proxy.url, 'http://10.1.2.3:8080')
  assert.equal(linux.proxy.noProxy, 'localhost')

  // A missing tool and a throwing runner both mean "nothing detected".
  assert.deepEqual(await detectSystemProxy(envOf('darwin', os.tmpdir()), async () => undefined), {})
  assert.deepEqual(await detectSystemProxy(envOf('darwin', os.tmpdir()), async () => { throw new Error('nope') }), {})
})

test('a PAC-configured machine reports its script instead of a proxy address', async () => {
  const pac = '<dictionary> {\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://wpad/wpad.dat\n}\n'
  assert.deepEqual(await detectSystemProxy(envOf('darwin', os.tmpdir()), async () => pac), {
    pacUrl: 'http://wpad/wpad.dat',
  })
  const windows = '    ProxyEnable    REG_DWORD    0x0\n    AutoConfigURL    REG_SZ    http://wpad/proxy.pac\n'
  assert.deepEqual(await detectSystemProxy(envOf('win32', os.tmpdir()), async () => windows), {
    pacUrl: 'http://wpad/proxy.pac',
  })
  const gnomeAuto = await detectSystemProxy(envOf('linux', os.tmpdir()), async (_command, args) =>
    args.join(' ').endsWith('mode') ? "'auto'" : "'http://wpad/proxy.pac'")
  assert.deepEqual(gnomeAuto, { pacUrl: 'http://wpad/proxy.pac' })
})

test('openConfig refuses unknown adapters and files that do not exist yet', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-manager-open-'))
  temporaries.push(root)
  const env = envOf('darwin', root)
  const manager = new ProxyManager(env)
  await assert.rejects(() => manager.openConfig('nope'), /unknown tool id/)
  await assert.rejects(() => manager.openConfig('git'), /does not exist yet/)
})

test('paths resolve per platform, prefer an existing candidate and expand %VARS%', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-manager-paths-'))
  temporaries.push(root)
  const pip = (await import('../lib/index.js')).builtinAdapters.find(entry => entry.id === 'pip')
  const darwinEnv = { ...envOf('darwin', root), dshHome: path.join(root, '.dsh') }

  // Nothing exists yet: the first documented candidate wins.
  const first = (await import('../lib/index.js')).resolvePathSpec(pip.path, darwinEnv)
  assert.equal(first, path.join(root, 'Library/Application Support/pip/pip.conf'))

  // Once a legacy file exists, that one is reported and edited instead.
  const legacy = path.join(root, '.pip', 'pip.conf')
  await fs.mkdir(path.dirname(legacy), { recursive: true })
  await fs.writeFile(legacy, '[global]\n', 'utf8')
  assert.equal((await import('../lib/index.js')).resolvePathSpec(pip.path, darwinEnv), legacy)

  // Windows candidates expand %APPDATA% and use backslashes.
  const winEnv = { ...envOf('win32', 'C:\\Users\\me'), env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' } }
  const winPath = (await import('../lib/index.js')).resolvePathSpec(pip.path, winEnv)
  assert.match(winPath, /AppData[\\/]Roaming[\\/]pip[\\/]pip\.ini$/)
})

test('a Windows environment prefers USERPROFILE over a POSIX-style HOME', async () => {
  const { currentEnv } = await import('../lib/index.js')
  const vars = { HOME: '/c/Users/me', USERPROFILE: 'C:\\Users\\me' }
  assert.equal(currentEnv(vars, 'win32').home, 'C:\\Users\\me')
  assert.equal(currentEnv(vars, 'darwin').home, '/c/Users/me')
})

test('openers try the text editor before the file association', async () => {
  const { openerAttempts } = await import('../lib/index.js')
  const mac = openerAttempts('/tmp/pip.conf', 'darwin')
  assert.deepEqual(mac[0].args, ['-t', '/tmp/pip.conf'], '`open -t` avoids a missing .conf association')
  assert.equal(mac.at(-1).args[0], '-R', 'revealing in Finder is the last resort')

  const win = openerAttempts('C:\\x.conf', 'win32')
  assert.equal(win[0].command, 'explorer')
  assert.equal(win[0].strict, false, 'a hand-off command may exit non-zero after success')

  const linux = openerAttempts('/tmp/x.conf', 'linux', { EDITOR: 'vim' })
  assert.deepEqual(linux.map(attempt => attempt.command), ['xdg-open', 'vim', 'sensible-editor'])
  const withoutEditor = openerAttempts('/tmp/x.conf', 'linux', {})
  assert.deepEqual(withoutEditor.map(attempt => attempt.command), ['xdg-open', 'sensible-editor'])
})
