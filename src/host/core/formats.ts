/**
 * Minimal, format-aware editors for the configuration files developer tools
 * read. Every edit is surgical: comments, ordering and unrelated keys survive,
 * because these are user-owned files that other tools and humans still read.
 */
import type { ToolKind } from './types.ts'

/** One key of one file, addressed the way its dialect addresses keys. */
export interface KeyTarget {
  kind: ToolKind
  /** Section or table for `ini` and `toml`. */
  section?: string
  /** Key, or a dotted path for `json`. */
  key: string
}

/** One line of a parsed file, reduced to what the editors need. */
interface ScannedLine {
  /** Section or table this line belongs to. */
  section?: string
  /** Key when this line assigns one. */
  key?: string
  /** Raw value text, still quoted when the dialect quotes. */
  value?: string
}

const SECTION_LINE = /^\s*\[([^\]]+)\]\s*$/
const INI_KEY = /^\s*([^=:#;[\]\s][^=:]*?)\s*[=:]\s*(.*)$/
const PROPS_KEY = /^\s*([^=:#;\s][^=:]*?)\s*[=:]\s*(.*)$/
const TOML_KEY = /^\s*([A-Za-z0-9_."'[\]-]+)\s*=\s*(.*)$/
const YAML_KEY = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/
const ENV_KEY = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/

function isComment(line: string, kind: ToolKind): boolean {
  const trimmed = line.trimStart()
  if (trimmed === '') return true
  if (kind === 'yaml' || kind === 'env') return trimmed.startsWith('#')
  return trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')
}

/**
 * Split a file into lines and remember its line ending.
 * @param text - file contents.
 * @returns lines plus the separator to rejoin with.
 */
function splitText(text: string): { lines: string[], eol: string, trailing: boolean } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  if (text === '') return { lines: [], eol, trailing: false }
  const lines = text.split(/\r?\n/)
  const trailing = lines.length > 0 && lines[lines.length - 1] === ''
  if (trailing) lines.pop()
  return { lines, eol, trailing }
}

function joinText(lines: string[], eol: string, trailing: boolean): string {
  if (lines.length === 0) return ''
  return lines.join(eol) + (trailing ? eol : '')
}

/** Strip one layer of matching quotes and an inline comment when unquoted. */
function normalizeValue(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2) {
    const first = value[0]
    if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1)
  }
  const comment = value.search(/\s[#;]/)
  return (comment === -1 ? value : value.slice(0, comment)).trim()
}

/**
 * Scan a file into section/key facts without rewriting anything.
 * @param text - file contents.
 * @param kind - dialect deciding which lines count as assignments.
 * @returns one record per line.
 */
function scan(text: string, kind: ToolKind): ScannedLine[] {
  const { lines } = splitText(text)
  let section: string | undefined
  return lines.map(line => {
    if (isComment(line, kind)) return section === undefined ? {} : { section }
    if (kind === 'ini' || kind === 'toml') {
      const header = SECTION_LINE.exec(line)
      if (header !== null) {
        section = header[1]?.trim().replace(/^"|"$/g, '')
        return { section }
      }
    }
    const pattern = kind === 'ini' ? INI_KEY
      : kind === 'toml' ? TOML_KEY
      : kind === 'yaml' ? YAML_KEY
      : kind === 'env' ? ENV_KEY
      : PROPS_KEY
    const match = pattern.exec(line)
    if (match === null) return section === undefined ? {} : { section }
    return {
      ...(section === undefined ? {} : { section }),
      key: match[1]?.trim(),
      value: match[2] ?? '',
    }
  })
}

function sameKey(a: string | undefined, b: string, kind: ToolKind): boolean {
  if (a === undefined) return false
  return kind === 'ini' || kind === 'env' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Format one assignment line for its dialect. */
function formatAssignment(target: KeyTarget, value: string): string {
  switch (target.kind) {
    case 'toml':
      return `${target.key} = ${JSON.stringify(value)}`
    case 'yaml':
      return `${target.key}: ${/[:#]/.test(value) ? JSON.stringify(value) : value}`
    case 'ini':
      return `${target.key} = ${value}`
    default:
      return `${target.key}=${value}`
  }
}

/** Whether one scanned line is the addressed key inside the addressed section. */
function matchesTarget(line: ScannedLine, target: KeyTarget): boolean {
  if (!sameKey(line.key, target.key, target.kind)) return false
  if (target.section === undefined) return true
  return (line.section ?? '').toLowerCase() === target.section.toLowerCase()
}

/** Index just past the last assignment of a section, for append ordering. */
function sectionInsertIndex(scanned: ScannedLine[], section: string): number | undefined {
  let last: number | undefined
  for (const [index, line] of scanned.entries()) {
    if ((line.section ?? '').toLowerCase() !== section.toLowerCase()) continue
    last = index
  }
  return last === undefined ? undefined : last + 1
}

/** Read one key's value as the dialect stores it, without quotes or comments. */
export function readValue(text: string, target: KeyTarget): string | undefined {
  if (target.kind === 'json') return readJsonValue(text, target.key)
  const scanned = scan(text, target.kind)
  for (const line of scanned) {
    if (matchesTarget(line, target)) {
      const normalized = normalizeValue(line.value ?? '')
      return normalized === '' ? undefined : normalized
    }
  }
  return undefined
}

/** Set one key, replacing in place or appending to the addressed section. */
export function writeValue(text: string, target: KeyTarget, value: string): string {
  if (target.kind === 'json') return writeJsonValue(text, target.key, value)
  const { lines, eol, trailing } = splitText(text)
  const scanned = scan(text, target.kind)
  for (const [index, line] of scanned.entries()) {
    if (matchesTarget(line, target)) {
      lines[index] = formatAssignment(target, value)
      return joinText(lines, eol, trailing)
    }
  }
  const assignment = formatAssignment(target, value)
  if (target.section !== undefined) {
    const insertAt = sectionInsertIndex(scanned, target.section)
    if (insertAt !== undefined) {
      lines.splice(insertAt, 0, assignment)
      return joinText(lines, eol, true)
    }
    if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') lines.push('')
    lines.push(`[${target.section}]`, assignment)
    return joinText(lines, eol, true)
  }
  lines.push(assignment)
  return joinText(lines, eol, true)
}

/** Remove one key; the section header stays because other keys may follow. */
export function removeValue(text: string, target: KeyTarget): string {
  if (target.kind === 'json') return removeJsonValue(text, target.key)
  const { lines, eol, trailing } = splitText(text)
  const scanned = scan(text, target.kind)
  const kept = lines.filter((_, index) => {
    const line = scanned[index]
    return line === undefined || !matchesTarget(line, target)
  })
  return joinText(kept, eol, trailing)
}

/* ------------------------------- JSON dialect ------------------------------ */

function parseJson(text: string): { ok: true, value: Record<string, unknown> } | { ok: false, error: string } {
  if (text.trim() === '') return { ok: true, value: {} }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'configuration root is not a JSON object' }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function nest(root: Record<string, unknown>, path: string[], create: boolean): Record<string, unknown> | undefined {
  let cursor: Record<string, unknown> = root
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment]
    if (next === undefined) {
      if (!create) return undefined
      const created: Record<string, unknown> = {}
      cursor[segment] = created
      cursor = created
      continue
    }
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return undefined
    cursor = next as Record<string, unknown>
  }
  return cursor
}

/**
 * Reject a configuration file this dialect cannot parse.
 * @param text - file contents.
 * @param kind - dialect to check.
 * @throws when a JSON file is malformed.
 */
export function assertParseable(text: string, kind: ToolKind): void {
  if (kind !== 'json') return
  const parsed = parseJson(text)
  if (!parsed.ok) throw new Error(parsed.error)
}

/** Read a dotted path from a JSON configuration file. */
export function readJsonValue(text: string, path: string): string | undefined {
  const parsed = parseJson(text)
  if (!parsed.ok) return undefined
  const segments = path.split('.')
  const parent = nest(parsed.value, segments, false)
  const leaf = segments[segments.length - 1]
  if (parent === undefined || leaf === undefined) return undefined
  const value = parent[leaf]
  if (typeof value === 'string') return value.trim() === '' ? undefined : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/** Write a dotted path into a JSON configuration file, keeping everything else. */
export function writeJsonValue(text: string, path: string, value: string): string {
  const parsed = parseJson(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const segments = path.split('.')
  const leaf = segments[segments.length - 1]
  const parent = nest(parsed.value, segments, true)
  if (parent === undefined || leaf === undefined) throw new Error(`cannot write ${path} into this configuration`)
  parent[leaf] = value
  return `${JSON.stringify(parsed.value, null, 2)}\n`
}

/** Remove a dotted path from a JSON configuration file. */
export function removeJsonValue(text: string, path: string): string {
  const parsed = parseJson(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const segments = path.split('.')
  const leaf = segments[segments.length - 1]
  const parent = nest(parsed.value, segments, false)
  if (parent === undefined || leaf === undefined) return text
  delete parent[leaf]
  return `${JSON.stringify(parsed.value, null, 2)}\n`
}
