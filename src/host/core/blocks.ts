/**
 * Two configuration shapes that are not "a key in a file": a managed block in a
 * shell profile, and one element inside an XML document.
 *
 * Both own exactly the region they manage and leave every other byte alone,
 * because these files belong to the user and to other tools.
 */

/** First line of the managed shell block. */
export const SHELL_START = '# >>> dsh-proxy-manager >>>'
/** Last line of the managed shell block. */
export const SHELL_END = '# <<< dsh-proxy-manager <<<'

/** Assignment syntax of the shell profile being edited. */
export type ShellSyntax = 'posix' | 'powershell'

/** Read the environment assignments of the managed shell block. */
export function readShellBlock(text: string): Record<string, string> | undefined {
  const start = text.indexOf(SHELL_START)
  if (start === -1) return undefined
  const end = text.indexOf(SHELL_END, start)
  if (end === -1) return undefined
  const values: Record<string, string> = {}
  for (const line of text.slice(start, end).split('\n')) {
    const match = /^\s*(?:export\s+|\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match === null) continue
    const key = match[1]
    const raw = (match[2] ?? '').replace(/^["']|["';]\s*$/g, '')
    if (key !== undefined && raw !== '') values[key] = raw
  }
  return Object.keys(values).length === 0 ? undefined : values
}

/**
 * Replace or append the managed shell block.
 * @param text - current file contents.
 * @param values - assignments to write; an empty map removes the block.
 * @param syntax - assignment syntax of the target profile.
 * @returns new file contents.
 */
export function writeShellBlock(text: string, values: Record<string, string>, syntax: ShellSyntax = 'posix'): string {
  const body = Object.entries(values)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => syntax === 'powershell'
      ? `$env:${key} = "${value}"`
      : `export ${key}="${value}"`)
  if (body.length === 0) return clearShellBlock(text)
  const block = [SHELL_START, ...body, SHELL_END].join('\n')
  const start = text.indexOf(SHELL_START)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  if (start !== -1) {
    const end = text.indexOf(SHELL_END, start)
    if (end !== -1) {
      const after = text.slice(end + SHELL_END.length).replace(/^\r?\n/, '')
      return `${text.slice(0, start)}${block.split('\n').join(eol)}${eol}${after}`
    }
  }
  const trimmed = text.replace(/\s*$/, '')
  return `${trimmed === '' ? '' : `${trimmed}${eol}${eol}`}${block.split('\n').join(eol)}${eol}`
}

/** Remove the managed shell block and its trailing newline. */
export function clearShellBlock(text: string): string {
  const start = text.indexOf(SHELL_START)
  if (start === -1) return text
  const end = text.indexOf(SHELL_END, start)
  if (end === -1) return text
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const before = text.slice(0, start).replace(/(\r?\n){2}$/, eol)
  const after = text.slice(end + SHELL_END.length).replace(/^\r?\n/, '')
  return `${before}${after}`
}

/** Id that marks the `<proxy>` element this plugin owns. */
export const XML_PROXY_ID = 'dsh-proxy-manager'

const PROXY_ELEMENT = /<proxy>[\s\S]*?<\/proxy>/g

/** Find the `<proxy>` element this plugin owns, if the file has one. */
function ownProxyElement(text: string): string | undefined {
  for (const match of text.matchAll(PROXY_ELEMENT)) {
    if (match[0].includes(`<id>${XML_PROXY_ID}</id>`)) return match[0]
  }
  return undefined
}

/** Read one child element of an XML fragment. */
function elementValue(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)
  const value = match?.[1]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/**
 * Read this plugin's `<proxy>` element.
 * @param text - settings.xml contents.
 * @returns the values it stores, or undefined when there is none.
 */
export function readXmlProxy(text: string): Record<string, string> | undefined {
  const block = ownProxyElement(text)
  if (block === undefined) return undefined
  const values: Record<string, string> = {}
  for (const name of ['host', 'port', 'protocol', 'nonProxyHosts']) {
    const value = elementValue(block, name)
    if (value !== undefined) values[name] = value
  }
  return Object.keys(values).length === 0 ? undefined : values
}

/** Render this plugin's `<proxy>` element. */
function renderProxyElement(values: Record<string, string>, indent: string): string {
  const inner = indent + '  '
  const lines = [
    `${indent}<proxy>`,
    `${inner}<id>${XML_PROXY_ID}</id>`,
    `${inner}<active>true</active>`,
    `${inner}<protocol>${values.protocol ?? 'http'}</protocol>`,
    `${inner}<host>${values.host ?? ''}</host>`,
    `${inner}<port>${values.port ?? ''}</port>`,
  ]
  if (values.nonProxyHosts !== undefined && values.nonProxyHosts !== '') {
    lines.push(`${inner}<nonProxyHosts>${values.nonProxyHosts}</nonProxyHosts>`)
  }
  lines.push(`${indent}</proxy>`)
  return lines.join('\n')
}

/**
 * Replace or insert this plugin's `<proxy>` element, creating `<proxies>` or a
 * whole settings document when the file has none yet.
 * @param text - current settings.xml contents.
 * @param values - host, port, protocol and optional nonProxyHosts.
 * @returns new file contents.
 */
export function writeXmlProxy(text: string, values: Record<string, string>): string {
  const existing = ownProxyElement(text)
  if (existing !== undefined) {
    const indentMatch = /\n([ \t]*)<proxy>/.exec(text)
    const indent = indentMatch?.[1] ?? '    '
    const rendered = renderProxyElement(values, indent)
    return text.replace(existing, rendered)
  }
  const element = renderProxyElement(values, '    ')
  if (text.includes('</proxies>')) {
    const head = text.replace(/([ \t]*)<\/proxies>/, match => `${element}\n${match}`)
    return head
  }
  if (text.includes('</settings>')) {
    return text.replace(/([ \t]*)<\/settings>/, match => `  <proxies>\n${element}\n  </proxies>\n${match}`)
  }
  if (text.trim() === '') {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">',
      '  <proxies>',
      element,
      '  </proxies>',
      '</settings>',
      '',
    ].join('\n')
  }
  // A settings file without a close tag is not something to guess about.
  throw new Error('settings.xml has no </settings> close tag; refusing to rewrite it')
}

/** Remove this plugin's `<proxy>` element. */
export function clearXmlProxy(text: string): string {
  const existing = ownProxyElement(text)
  if (existing === undefined) return text
  return text.replace(existing, '').replace(/\n{3,}/g, '\n\n')
}
