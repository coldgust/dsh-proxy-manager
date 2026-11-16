/**
 * The engine: one tool spec in, one status out. All file access for the proxy
 * files lives here so the registry, the RPC channel and the agent tool share
 * exactly one implementation.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { displayPath, isOnPath, resolvePathSpec, type Env } from './env.ts'
import {
  clearShellBlock, clearXmlProxy, readShellBlock, readXmlProxy, writeShellBlock, writeXmlProxy,
} from './blocks.ts'
import { assertParseable, readValue, removeValue, writeValue, type KeyTarget } from './formats.ts'
import { parseProxy, requireProxy } from './proxy.ts'
import type { ProxySettings, ToolField, ToolKind, ToolReading, ToolSpec, ToolStatus } from './types.ts'

/** Read one configuration file, tolerating an absent file. */
async function readConfig(absolute: string): Promise<{ text: string, exists: boolean }> {
  try {
    const text = await fs.readFile(absolute, 'utf8')
    return { text, exists: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', exists: false }
    throw error
  }
}

/** Write one configuration file, creating its directory when needed. */
async function writeConfig(absolute: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, text, 'utf8')
}

/** The target address for one field of one spec. */
function targetOf(spec: ToolSpec, field: ToolField): KeyTarget {
  const section = field.section ?? spec.section
  return { kind: spec.kind, ...(section === undefined ? {} : { section }), key: field.key }
}

/**
 * Reconstruct the proxy a tool currently stores.
 * @param text - configuration file contents.
 * @param spec - adapter describing where the parts live.
 * @returns configured URL, bypass list, and whether any managed key exists.
 */
/** Compose a reading out of already-extracted `key → value` pairs. */
function readingFromValues(spec: ToolSpec, values: Record<string, string>): ToolReading {
  const parts: Partial<Record<'url' | 'scheme' | 'host' | 'port', string>> = {}
  let noProxy: string | undefined
  for (const field of spec.fields) {
    const value = values[field.key]
    if (value === undefined) continue
    if (field.part === 'noProxy') noProxy = readField(field, value)
    else parts[field.part] = value
  }
  return composeReading(parts, noProxy)
}

/** Turn proxy parts into the URL the page and the agent display. */
function composeReading(
  parts: Partial<Record<'url' | 'scheme' | 'host' | 'port', string>>,
  noProxy: string | undefined,
): ToolReading {
  let url: string | undefined
  if (parts.url !== undefined) {
    const parsed = parseProxy(parts.url)
    url = parsed === undefined ? parts.url : parsed.url
  } else if (parts.host !== undefined) {
    url = `${parts.scheme ?? 'http'}://${parts.host}${parts.port === undefined ? '' : `:${parts.port}`}`
  }
  const present = Object.keys(parts).length > 0 || noProxy !== undefined
  return {
    ...(url === undefined ? {} : { url }),
    ...(noProxy === undefined ? {} : { noProxy }),
    present,
  }
}

/** Values one adapter's managed region should receive for a proxy. */
function blockValues(spec: ToolSpec, settings: ProxySettings): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of spec.fields) {
    const value = fieldValue(field, settings)
    if (value !== '') values[field.key] = value
  }
  return values
}

export function readToolConfig(text: string, spec: ToolSpec): ToolReading {
  assertParseable(text, spec.kind)
  if (spec.kind === 'shell') return readingFromValues(spec, readShellBlock(text) ?? {})
  if (spec.kind === 'xml') return readingFromValues(spec, readXmlProxy(text) ?? {})
  const parts: Partial<Record<'url' | 'scheme' | 'host' | 'port', string>> = {}
  let noProxy: string | undefined
  for (const field of spec.fields) {
    const value = readValue(text, targetOf(spec, field))
    if (value === undefined) continue
    if (field.part === 'noProxy') noProxy = readField(field, value)
    else parts[field.part] = value
  }
  return composeReading(parts, noProxy)
}

/** Map a stored value back into the dialect the UI uses. */
function readField(field: ToolField, value: string): string {
  if (field.transform === 'jvmNoProxy') return value.split('|').map(entry => entry.trim()).filter(Boolean).join(',')
  return value
}

/** Map a value from the UI dialect into the tool's storage dialect. */
function writeField(field: ToolField, value: string): string {
  if (field.transform === 'jvmNoProxy') return value.split(',').map(entry => entry.trim()).filter(Boolean).join('|')
  return value
}

/** Value one field receives for a given proxy, or `''` to remove it. */
function fieldValue(field: ToolField, settings: ProxySettings): string {
  const part = field.part
  if (part === 'noProxy') return writeField(field, settings.noProxy.trim())
  const proxy = requireProxy(settings.url)
  switch (part) {
    case 'url': return proxy.url
    case 'scheme': return proxy.scheme
    case 'host': return proxy.host
    case 'port': return proxy.port
  }
}

/**
 * Rewrite one configuration file so it stores the given proxy.
 * @param text - current contents.
 * @param spec - adapter describing the keys.
 * @param settings - proxy URL and bypass list to store.
 * @returns new contents.
 */
export function writeToolConfig(
  text: string,
  spec: ToolSpec,
  settings: ProxySettings,
  syntax: 'posix' | 'powershell' = 'posix',
): string {
  if (spec.kind === 'shell') return writeShellBlock(text, blockValues(spec, settings), syntax)
  if (spec.kind === 'xml') return writeXmlProxy(text, blockValues(spec, settings))
  let next = text
  for (const field of spec.fields) {
    const value = fieldValue(field, settings)
    const target = targetOf(spec, field)
    next = value === '' ? removeValue(next, target) : writeValue(next, target, value)
  }
  return next
}

/**
 * Rewrite one configuration file so it no longer stores a proxy.
 * @param text - current contents.
 * @param spec - adapter describing the keys.
 * @returns new contents.
 */
export function clearToolConfig(text: string, spec: ToolSpec): string {
  if (spec.kind === 'shell') return clearShellBlock(text)
  if (spec.kind === 'xml') return clearXmlProxy(text)
  let next = text
  for (const field of spec.fields) next = removeValue(next, targetOf(spec, field))
  return next
}

/** Everything a status needs that does not depend on the file contents. */
function describe(spec: ToolSpec, absolute: string, env: Env): Omit<ToolStatus, 'exists' | 'enabled' | 'error'> {
  return {
    id: spec.id,
    name: spec.name,
    ...(spec.category === undefined ? {} : { category: spec.category }),
    kind: spec.kind,
    path: absolute,
    displayPath: displayPath(absolute, env),
    ...(spec.binary === undefined ? {} : { installed: isOnPath(spec.binary, env) }),
    ...(spec.note === undefined ? {} : { note: spec.note }),
    ...(spec.custom === true ? { custom: true } : {}),
  }
}

/** Turn a failure into a status that still shows where the file is. */
function failedStatus(spec: ToolSpec, absolute: string, env: Env, error: unknown): ToolStatus {
  return {
    ...describe(spec, absolute, env),
    exists: false,
    enabled: false,
    error: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Read one tool's live status.
 * @param spec - adapter to inspect.
 * @param env - environment resolving the path.
 * @returns status including the configured proxy, if any.
 */
export async function inspectTool(spec: ToolSpec, env: Env): Promise<ToolStatus> {
  const absolute = resolvePathSpec(spec.path, env)
  try {
    const { text, exists } = await readConfig(absolute)
    if (!exists) return { ...describe(spec, absolute, env), exists: false, enabled: false }
    const reading = readToolConfig(text, spec)
    return {
      ...describe(spec, absolute, env),
      exists: true,
      enabled: reading.url !== undefined,
      ...(reading.url === undefined ? {} : { url: reading.url }),
      ...(reading.noProxy === undefined ? {} : { noProxy: reading.noProxy }),
    }
  } catch (error) {
    return failedStatus(spec, absolute, env, error)
  }
}

/**
 * Store the proxy in one tool's configuration.
 * @param spec - adapter to write.
 * @param settings - proxy URL and bypass list.
 * @param env - environment resolving the path.
 * @returns the status after writing, including any failure.
 */
export async function applyTool(spec: ToolSpec, settings: ProxySettings, env: Env): Promise<ToolStatus> {
  const absolute = resolvePathSpec(spec.path, env)
  try {
    const { text } = await readConfig(absolute)
    const syntax = spec.syntax ?? (env.platform === 'win32' ? 'powershell' : 'posix')
    await writeConfig(absolute, writeToolConfig(text, spec, settings, syntax))
    return await inspectTool(spec, env)
  } catch (error) {
    return failedStatus(spec, absolute, env, error)
  }
}

/**
 * Remove the proxy from one tool's configuration.
 * @param spec - adapter to clear.
 * @param env - environment resolving the path.
 * @returns the status after clearing, including any failure.
 */
export async function clearTool(spec: ToolSpec, env: Env): Promise<ToolStatus> {
  const absolute = resolvePathSpec(spec.path, env)
  try {
    const { text, exists } = await readConfig(absolute)
    if (!exists) return { ...describe(spec, absolute, env), exists: false, enabled: false }
    await writeConfig(absolute, clearToolConfig(text, spec))
    return await inspectTool(spec, env)
  } catch (error) {
    return failedStatus(spec, absolute, env, error)
  }
}

/** Exported for tests and for adapters that need the dialect's raw key access. */
export { readValue, removeValue, writeValue }
export type { ToolKind }
