/**
 * Plugin-owned state. The profile's `cordis.patch.yml` is the user's file and
 * this plugin never rewrites it: settings and user-added adapters live in a
 * JSON document under the harness home instead.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { type Env } from './env.ts'
import type { ProxySettings, ToolField, ToolKind, ToolSpec } from './types.ts'

/** State document version; bump when the shape changes incompatibly. */
export const STATE_VERSION = 1

/** Default proxy settings for a fresh install. */
const EMPTY_SETTINGS: ProxySettings = { url: '', noProxy: 'localhost,127.0.0.1,::1' }

/** Everything this plugin persists. */
export interface PluginState {
  version: number
  settings: ProxySettings
  /** Adapters the user added from the settings page. */
  tools: ToolSpec[]
  /** Pinned adapter ids, in pin order. */
  pinned: string[]
}

const KINDS: readonly ToolKind[] = ['json', 'ini', 'props', 'yaml', 'toml', 'env', 'shell', 'xml']
const PARTS = ['url', 'scheme', 'host', 'port', 'noProxy'] as const
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/

/** Read one string field from untrusted JSON. */
function readString(value: unknown, field: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

/** Read one optional string field from untrusted JSON. */
function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value.trim() === '' ? undefined : value.trim()
}

/**
 * Validate an adapter that arrived from the settings page or another plugin.
 * @param input - untrusted spec.
 * @returns a complete, normalized adapter.
 * @throws when the spec cannot describe a usable adapter.
 */
export function sanitizeToolSpec(input: unknown): ToolSpec {
  if (input === null || typeof input !== 'object') throw new Error('adapter must be an object')
  const record = input as Record<string, unknown>
  const id = readString(record.id, 'id').trim()
  if (!ID_PATTERN.test(id)) throw new Error('id must be lowercase letters, digits, dot, dash or underscore')
  const name = readString(record.name, 'name').trim()
  if (name === '') throw new Error('name cannot be empty')
  const kind = readString(record.kind, 'kind') as ToolKind
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`)
  const rawPath = record.path
  const isPathList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.length > 0 && value.every(entry => typeof entry === 'string' && entry.trim() !== '')
  const configPath = typeof rawPath === 'string' && rawPath.trim() !== ''
    ? rawPath
    : isPathList(rawPath)
      ? rawPath
      : rawPath !== null && typeof rawPath === 'object' ? rawPath as ToolSpec['path'] : undefined
  if (configPath === undefined) throw new Error('path must be a string or a list of paths')
  const rawFields = record.fields
  if (!Array.isArray(rawFields) || rawFields.length === 0) throw new Error('fields must list at least one key')
  const fields: ToolField[] = rawFields.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') throw new Error(`fields[${index}] must be an object`)
    const field = entry as Record<string, unknown>
    const key = readString(field.key, `fields[${index}].key`).trim()
    if (key === '') throw new Error(`fields[${index}].key cannot be empty`)
    const part = readString(field.part, `fields[${index}].part`) as ToolField['part']
    if (!(PARTS as readonly string[]).includes(part)) throw new Error(`fields[${index}].part must be one of ${PARTS.join(', ')}`)
    const section = optionalString(field.section, `fields[${index}].section`)
    return { key, part, ...(section === undefined ? {} : { section }) }
  })
  const section = optionalString(record.section, 'section')
  const binary = optionalString(record.binary, 'binary')
  const note = optionalString(record.note, 'note')
  const category = optionalString(record.category, 'category')
  const syntax = optionalString(record.syntax, 'syntax')
  return {
    id,
    name,
    kind,
    path: configPath,
    fields,
    ...(section === undefined ? {} : { section }),
    ...(binary === undefined ? {} : { binary }),
    ...(note === undefined ? {} : { note }),
    ...(category === undefined ? {} : { category }),
    ...(syntax === 'posix' || syntax === 'powershell' ? { syntax } : {}),
    custom: true,
  }
}

/** Durable settings and user adapters, read and written as one document. */
export class StateStore {
  constructor(private readonly env: Env) {}

  /** Directory holding the state document. */
  get directory(): string {
    return path.join(this.env.dshHome, 'proxy-manager')
  }

  /** Path of the state document. */
  get file(): string {
    return path.join(this.directory, 'state.json')
  }

  /**
   * Load the document, falling back to defaults for a missing or unreadable one.
   * @returns settings and user adapters.
   */
  async load(): Promise<PluginState> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
    } catch {
      return { version: STATE_VERSION, settings: { ...EMPTY_SETTINGS }, tools: [], pinned: [] }
    }
    const record = parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const settingsRecord = record.settings !== null && typeof record.settings === 'object'
      ? record.settings as Record<string, unknown>
      : {}
    const settings: ProxySettings = {
      url: typeof settingsRecord.url === 'string' ? settingsRecord.url : EMPTY_SETTINGS.url,
      noProxy: typeof settingsRecord.noProxy === 'string' ? settingsRecord.noProxy : EMPTY_SETTINGS.noProxy,
    }
    const tools: ToolSpec[] = []
    if (Array.isArray(record.tools)) {
      for (const entry of record.tools) {
        try {
          tools.push(sanitizeToolSpec(entry))
        } catch {
          // A malformed stored adapter must not take the whole document down.
        }
      }
    }
    const pinned = Array.isArray(record.pinned)
      ? record.pinned.filter((entry): entry is string => typeof entry === 'string')
      : []
    return { version: STATE_VERSION, settings, tools, pinned }
  }

  /**
   * Persist the document atomically.
   * @param state - settings and user adapters.
   */
  async save(state: PluginState): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await fs.rename(temporary, this.file)
  }
}
