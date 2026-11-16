/** Proxy URL parsing shared by every adapter. */

/** One proxy URL split into the parts tools store separately. */
export interface ProxyParts {
  /** Absolute URL as the user typed it, normalized. */
  url: string
  scheme: string
  host: string
  port: string
}

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443', 'socks4:': '1080', 'socks5:': '1080' }

/**
 * Accept the shapes people actually paste: a full URL, or `host:port`.
 * @param input - candidate proxy address.
 * @returns parsed parts, or undefined when the value is not a usable proxy.
 */
export function parseProxy(input: string): ProxyParts | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return undefined
  }
  if (parsed.hostname === '') return undefined
  const scheme = parsed.protocol.replace(/:$/, '')
  const port = parsed.port === '' ? DEFAULT_PORTS[parsed.protocol] ?? '' : parsed.port
  const credentials = parsed.username === ''
    ? ''
    : `${parsed.username}${parsed.password === '' ? '' : `:${parsed.password}`}@`
  return {
    url: `${scheme}://${credentials}${parsed.host}`,
    scheme,
    host: parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname,
    port,
  }
}

/**
 * Validate a proxy URL for the operations that persist it.
 * @param input - candidate proxy address.
 * @returns the normalized URL.
 * @throws when the address cannot be parsed.
 */
export function requireProxy(input: string): ProxyParts {
  const parsed = parseProxy(input)
  if (parsed === undefined) {
    throw new Error(`"${input}" is not a valid proxy address (expected something like http://127.0.0.1:7890)`)
  }
  return parsed
}

/**
 * Pick the proxy URL the Host environment already advertises.
 * @param env - environment variables of the Host process.
 * @returns the first configured proxy variable, or an empty string.
 */
export function suggestedProxy(env: NodeJS.ProcessEnv): string {
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const value = env[name]?.trim()
    if (value !== undefined && value !== '') return value
  }
  return ''
}

/**
 * Split a bypass list into trimmed entries.
 * @param noProxy - comma-separated hosts.
 * @returns entries without blanks.
 */
export function splitNoProxy(noProxy: string): string[] {
  return noProxy.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
}
