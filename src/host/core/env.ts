/** Filesystem locations this plugin works with, resolved for one environment. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PathSpec } from './types.ts'

/** The machine facts every adapter resolves its paths against. */
export interface Env {
  /** User home directory. */
  home: string
  /** Harness home: `$DSH_HOME`, else `~/.dsh`. */
  dshHome: string
  /** Node platform id. */
  platform: NodeJS.Platform
  /** Environment variables consulted for `HOME`, `DSH_HOME` and `PATH`. */
  env: NodeJS.ProcessEnv
}

/**
 * Resolve the environment once per call.
 * @param env - process environment to read; defaults to this process's.
 * @param platform - platform to resolve for; defaults to this process's.
 * @returns home, harness home, platform and the environment itself.
 */
export function currentEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Env {
  // Windows shells may export a POSIX-style HOME; USERPROFILE is the native one.
  const home = platform === 'win32'
    ? env.USERPROFILE?.trim() || env.HOME?.trim() || os.homedir()
    : env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir()
  const dshHome = env.DSH_HOME?.trim() || path.join(home, '.dsh')
  return { home, dshHome, platform, env }
}

/**
 * Put a path into one separator form for comparison.
 * @param value - path written with either separator, or both.
 * @returns the same characters with `/` as the separator throughout.
 */
function unifiedSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

/**
 * Expand `~`, `$HOME` and `$DSH_HOME` in one configured path.
 * @param raw - path as an adapter declares it.
 * @param env - environment to expand against.
 * @returns absolute normalized path.
 */
export function expandPath(raw: string, env: Env): string {
  // Adapters are written `~/.npmrc`, but a Windows host expands against `\`:
  // testing the tilde against `path.sep` left it in place and produced
  // `<home>\~\.npmrc`, so the separators are unified before the tilde test.
  const unified = unifiedSlashes(raw.trim())
  let value = unified === '~'
    ? env.home
    : unified.startsWith('~/') ? path.join(env.home, unified.slice(2)) : unified
  value = value.replace(/\$\{DSH_HOME\}|\$DSH_HOME\b/g, env.dshHome)
  value = value.replace(/\$\{HOME\}|\$HOME\b/g, env.home)
  // Windows adapters may declare %APPDATA%-style paths.
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name: string) => env.env[name] ?? match)
  return path.isAbsolute(value) ? path.normalize(value) : path.join(env.home, value)
}

/**
 * Replace one root prefix with a label.
 * @param absolute - absolute path.
 * @param root - directory the path may lie below.
 * @param label - text to stand in for the root.
 * @returns the shortened path, or undefined when `absolute` is not below `root`.
 */
function shorten(absolute: string, root: string, label: string): string | undefined {
  // Both sides are compared in one separator form: a root that came from a
  // variable may use `/` while the host wrote `\`, or the other way round.
  const prefix = unifiedSlashes(root).replace(/\/+$/, '')
  if (prefix === '') return undefined
  const target = unifiedSlashes(absolute)
  if (target === prefix) return label
  if (!target.startsWith(`${prefix}/`)) return undefined
  return `${label}${absolute.slice(prefix.length)}`
}

/**
 * The placeholder each root gets in a displayed path.
 * @param env - environment deciding the platform.
 * @returns labels for the user home and the harness home.
 */
function rootLabels(env: Env): { home: string, dshHome: string } {
  // Windows users read `%USERPROFILE%` in their own shells; `~` there looks like
  // a POSIX leftover and invites copying a path that `cmd` will not expand.
  return env.platform === 'win32'
    ? { home: '%USERPROFILE%', dshHome: '%DSH_HOME%' }
    : { home: '~', dshHome: '$DSH_HOME' }
}

/**
 * Abbreviate a path for display without losing information.
 * @param absolute - absolute path.
 * @param env - environment whose home is abbreviated.
 * @returns the path with its root replaced by the platform's placeholder.
 */
export function displayPath(absolute: string, env: Env): string {
  const labels = rootLabels(env)
  // The harness home usually sits inside the user home, so it is checked first.
  return shorten(absolute, env.dshHome, labels.dshHome)
    ?? shorten(absolute, env.home, labels.home)
    ?? absolute
}

/**
 * Pick the path an adapter declares for this platform.
 * @param spec - single path or per-platform table.
 * @param env - environment deciding the platform.
 * @returns absolute configuration path.
 */
export function resolvePathSpec(spec: PathSpec, env: Env): string {
  const platformEntry = Array.isArray(spec)
    ? undefined
    : typeof spec === 'string' ? spec : (spec as Partial<Record<string, string | readonly string[]>>)[env.platform]
      ?? (spec as Partial<Record<string, string | readonly string[]>>).darwin
      ?? (spec as Partial<Record<string, string | readonly string[]>>).linux
      ?? (spec as Partial<Record<string, string | readonly string[]>>).win32
  const raw = platformEntry ?? spec
  const candidates = (Array.isArray(raw) ? raw : [raw])
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map(entry => expandPath(entry, env))
  if (candidates.length === 0) throw new Error(`no configuration path for platform ${env.platform}`)
  const existing = candidates.find(candidate => {
    try {
      fs.accessSync(candidate)
      return true
    } catch {
      return false
    }
  })
  return existing ?? candidates[0] as string
}

/**
 * Look for an executable on `PATH` without spawning a process.
 * @param binary - executable name.
 * @param env - environment supplying `PATH` and the platform separator.
 * @returns true when an executable file is reachable.
 */
export function isOnPath(binary: string, env: Env): boolean {
  if (binary.includes('/') || binary.includes('\\')) return false
  const pathValue = env.env.PATH ?? ''
  if (pathValue === '') return false
  const suffixes = env.platform === 'win32'
    ? (env.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
    : ['']
  return pathValue.split(path.delimiter).some(dir => dir !== '' && suffixes.some(ext => {
    try {
      fs.accessSync(path.join(dir, `${binary}${ext}`), fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }))
}
