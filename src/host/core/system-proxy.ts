/**
 * Read the proxy the operating system itself is configured with, so the page
 * can offer it with one click instead of asking the user to retype it.
 *
 * Detection is read-only and never throws: an unsupported platform, a missing
 * tool, or output this module cannot parse yields `undefined`, and the page
 * falls back to the environment-variable suggestion.
 */
import { execFile } from 'node:child_process'
import type { Env } from './env.ts'

/** A proxy found in the system settings. */
export interface SystemProxy {
  /** Proxy URL, for example `http://127.0.0.1:7890`. */
  url: string
  /** Comma-separated bypass list stored by the same system setting. */
  noProxy: string
  /** Where the value came from, shown to the user. */
  source: string
}

/**
 * What one detection pass found. A machine may also be configured with an
 * automatic configuration script (PAC) instead of a manual proxy; that case is
 * reported separately because no single proxy address can be derived from it.
 */
export interface SystemProxyReport {
  /** Manual proxy the operating system configures, when it has one. */
  proxy?: SystemProxy
  /** PAC script URL when the system uses automatic configuration instead. */
  pacUrl?: string
}

/** Runs one command and resolves its stdout, or `undefined` on any failure. */
export type Runner = (command: string, args: readonly string[]) => Promise<string | undefined>

/** Run a command with a short deadline; failures are ordinary outcomes here. */
const runCommand: Runner = (command, args) => new Promise(resolve => {
  execFile(command, [...args], { timeout: 3000, windowsHide: true }, (error, stdout) => {
    resolve(error === null ? stdout : undefined)
  })
})

function readField(text: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'm').exec(text)
  return match?.[1]?.trim()
}

/** Collect the `ExceptionsList` array of `scutil --proxy`. */
function scutilExceptions(text: string): string[] {
  const start = text.indexOf('ExceptionsList')
  if (start === -1) return []
  const entries: string[] = []
  for (const line of text.slice(start).split('\n').slice(1)) {
    const entry = /^\s*\d+\s*:\s*(.+)$/.exec(line)
    if (entry !== null) {
      const value = entry[1]?.trim()
      if (value !== undefined && value !== '') entries.push(value)
      continue
    }
    if (line.includes('}') || /^\s*[A-Za-z]+\s*:/.test(line)) break
  }
  return entries
}

/** Join an enabled proxy endpoint into a URL. */
function endpoint(scheme: string, host: string | undefined, port: string | undefined): string | undefined {
  if (host === undefined || host === '') return undefined
  const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return port === undefined || port === '' ? `${scheme}://${normalizedHost}` : `${scheme}://${normalizedHost}:${port}`
}

/** Split `host:port` without assuming the host has no colon. */
function splitHostPort(value: string): [string | undefined, string | undefined] {
  const trimmed = value.trim()
  const ipv6 = /^\[(.+)\]:(\d+)$/.exec(trimmed)
  if (ipv6 !== null) return [ipv6[1], ipv6[2]]
  const lastColon = trimmed.lastIndexOf(':')
  if (lastColon === -1) return [trimmed, undefined]
  const host = trimmed.slice(0, lastColon)
  const port = trimmed.slice(lastColon + 1)
  return [host === '' ? undefined : host, /^\d+$/.test(port) ? port : undefined]
}

/**
 * Parse `scutil --proxy`, the macOS system proxy configuration.
 * @param text - command output.
 * @returns the enabled proxy, or undefined when none is on.
 */
export function parseScutilProxy(text: string): SystemProxy | undefined {
  const on = (key: string): boolean => readField(text, key) === '1'
  const candidates: Array<[boolean, string, string | undefined, string | undefined]> = [
    [on('HTTPSEnable'), 'http', readField(text, 'HTTPSProxy'), readField(text, 'HTTPSPort')],
    [on('HTTPEnable'), 'http', readField(text, 'HTTPProxy'), readField(text, 'HTTPPort')],
    [on('SOCKSEnable'), 'socks5', readField(text, 'SOCKSProxy'), readField(text, 'SOCKSPort')],
  ]
  for (const [enabled, scheme, host, port] of candidates) {
    if (!enabled) continue
    const url = endpoint(scheme, host, port)
    if (url === undefined) continue
    return { url, noProxy: scutilExceptions(text).join(','), source: 'macOS · scutil --proxy' }
  }
  return undefined
}

/**
 * Parse `reg query` output for the Windows Internet Settings proxy.
 * @param text - command output.
 * @returns the enabled proxy, or undefined when none is on.
 */
export function parseWindowsProxy(text: string): SystemProxy | undefined {
  const enabled = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(text)
  if (enabled === null || Number.parseInt(enabled[1] ?? '0', 16) === 0) return undefined
  const server = /ProxyServer\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim()
  if (server === undefined || server === '') return undefined
  let url: string | undefined
  if (server.includes('=')) {
    const byScheme = new Map<string, string>()
    for (const part of server.split(';')) {
      const [scheme, value] = part.split('=', 2)
      if (scheme !== undefined && value !== undefined) byScheme.set(scheme.trim().toLowerCase(), value.trim())
    }
    const chosen = byScheme.get('https') ?? byScheme.get('http') ?? [...byScheme.values()][0]
    if (chosen !== undefined) {
      const [host, port] = splitHostPort(chosen)
      url = endpoint('http', host, port)
    }
  } else {
    const [host, port] = splitHostPort(server)
    url = endpoint('http', host, port)
  }
  if (url === undefined) return undefined
  const bypass = /ProxyOverride\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim() ?? ''
  return {
    url,
    noProxy: bypass.split(';').filter(entry => entry !== '' && entry !== '<local>').join(','),
    source: 'Windows · Internet Settings',
  }
}

/**
 * Read the GNOME proxy from `gsettings` output.
 * @param mode - `org.gnome.system.proxy mode`.
 * @param host - `org.gnome.system.proxy.http host`.
 * @param port - `org.gnome.system.proxy.http port`.
 * @param ignoreHosts - `org.gnome.system.proxy ignore-hosts`.
 * @returns the manual proxy, or undefined when the mode is not manual.
 */
export function parseGnomeProxy(
  mode: string | undefined,
  host: string | undefined,
  port: string | undefined,
  ignoreHosts: string | undefined,
): SystemProxy | undefined {
  const read = (value: string | undefined): string => (value ?? '').trim().replace(/^'|'$/g, '')
  if (read(mode) !== 'manual') return undefined
  const url = endpoint('http', read(host), read(port))
  if (url === undefined) return undefined
  const bypass = read(ignoreHosts).replace(/^\[|\]$/g, '')
  return {
    url,
    noProxy: bypass.split(',').map(entry => entry.trim().replace(/^'|'$/g, '')).filter(entry => entry !== '').join(','),
    source: 'GNOME · gsettings',
  }
}

/**
 * Read the PAC script URL a platform configures, when it uses one.
 */ 
function scutilPacUrl(text: string): string | undefined {
  if (readField(text, 'ProxyAutoConfigEnable') !== '1') return undefined
  const url = readField(text, 'ProxyAutoConfigURLString')
  return url === undefined || url === '' ? undefined : url
}

function windowsPacUrl(text: string): string | undefined {
  const url = /AutoConfigURL\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim()
  return url === undefined || url === '' ? undefined : url
}

/**
 * Detect the system proxy for this machine.
 *
 * This reads only the operating system's own *manual* proxy setting: the same
 * value the network preferences window shows and that browsers use. Automatic
 * configuration scripts are reported as `pacUrl` because no fixed address can
 * be taken from them, and a VPN or TUN adapter that intercepts traffic never
 * writes one at all.
 *
 * @param env - environment deciding the platform.
 * @param run - command runner; injectable for tests.
 * @returns the manual proxy, a PAC URL, or an empty report.
 */
export async function detectSystemProxy(
  env: Env,
  run: Runner = runCommand,
): Promise<SystemProxyReport> {
  try {
    if (env.platform === 'darwin') {
      const text = await run('scutil', ['--proxy'])
      if (text === undefined) return {}
      const proxy = parseScutilProxy(text)
      if (proxy !== undefined) return { proxy }
      const pacUrl = scutilPacUrl(text)
      return pacUrl === undefined ? {} : { pacUrl }
    }
    if (env.platform === 'win32') {
      const text = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'])
      if (text === undefined) return {}
      const proxy = parseWindowsProxy(text)
      if (proxy !== undefined) return { proxy }
      const pacUrl = windowsPacUrl(text)
      return pacUrl === undefined ? {} : { pacUrl }
    }
    const mode = await run('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
    if (mode === undefined) return {}
    const read = (value: string | undefined): string => (value ?? '').trim().replace(/^'|'$/g, '')
    if (read(mode) === 'auto') {
      const pacUrl = read(await run('gsettings', ['get', 'org.gnome.system.proxy', 'autoconfig-url']))
      return pacUrl === '' ? {} : { pacUrl }
    }
    const [host, port, ignore] = await Promise.all([
      run('gsettings', ['get', 'org.gnome.system.proxy.http', 'host']),
      run('gsettings', ['get', 'org.gnome.system.proxy.http', 'port']),
      run('gsettings', ['get', 'org.gnome.system.proxy', 'ignore-hosts']),
    ])
    const proxy = parseGnomeProxy(mode, host, port, ignore)
    return proxy === undefined ? {} : { proxy }
  } catch {
    return {}
  }
}

/** One way to open a path, tried in order until one works. */
export interface OpenAttempt {
  command: string
  args: string[]
  /** Whether a non-zero exit is a real failure (hand-off commands exit non-zero after success). */
  strict: boolean
}

/**
 * Candidate commands for opening one file, most specific first.
 *
 * macOS leads with `open -t` — the default *text editor* — because a
 * configuration file has no reliable LaunchServices association: a `.conf`
 * whose claimed handler is gone reports `kLSApplicationNotFoundErr`, and plain
 * `open` then fails while `open -t` succeeds. Revealing it in Finder is the
 * last resort, so the click always produces something visible.
 * @param file - absolute path.
 * @param platform - platform choosing the commands.
 * @param env - environment supplying `EDITOR`.
 * @returns attempts in priority order.
 */
export function openerAttempts(file: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv = process.env): OpenAttempt[] {
  if (platform === 'darwin') {
    return [
      { command: 'open', args: ['-t', file], strict: true },
      { command: 'open', args: [file], strict: true },
      { command: 'open', args: ['-R', file], strict: true },
    ]
  }
  if (platform === 'win32') {
    return [
      { command: 'explorer', args: [file], strict: false },
      { command: 'cmd', args: ['/c', 'start', '', file], strict: false },
    ]
  }
  const editor = env.EDITOR?.trim() ?? ''
  return [
    { command: 'xdg-open', args: [file], strict: false },
    ...(editor === '' ? [] : [{ command: editor, args: [file], strict: false }]),
    { command: 'sensible-editor', args: [file], strict: false },
  ]
}

/** Run one attempt, rejecting with the opener's own message when it truly failed. */
function runAttempt(attempt: OpenAttempt): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(attempt.command, attempt.args, { timeout: 5000, windowsHide: true }, (error, _stdout, stderr) => {
      if (error === null) {
        resolve()
        return
      }
      const code = (error as NodeJS.ErrnoException).code
      if (!attempt.strict && code !== 'ENOENT') {
        resolve()
        return
      }
      reject(new Error(code === 'ENOENT' ? `${attempt.command} is not on PATH` : (stderr.trim() === '' ? error.message : stderr.trim())))
    })
  })
}

/**
 * Open one configuration file for the user.
 * @param file - absolute path that already belongs to a registered adapter.
 * @param platform - platform choosing the commands.
 * @param env - environment supplying `EDITOR`.
 * @returns nothing; throws with every attempt's reason when none worked.
 */
export async function openInEditor(
  file: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const failures: string[] = []
  for (const attempt of openerAttempts(file, platform, env)) {
    try {
      await runAttempt(attempt)
      return
    } catch (error) {
      failures.push(`${attempt.command} ${attempt.args.slice(0, -1).join(' ')}: ${error instanceof Error ? error.message : String(error)}`.trim())
    }
  }
  throw new Error(`cannot open ${file}: ${failures.join(' | ')}`)
}
