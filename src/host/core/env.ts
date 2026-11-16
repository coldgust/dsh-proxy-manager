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
 * Expand `~`, `$HOME` and `$DSH_HOME` in one configured path.
 * @param raw - path as an adapter declares it.
 * @param env - environment to expand against.
 * @returns absolute normalized path.
 */
export function expandPath(raw: string, env: Env): string {
  let value = raw.trim().replace(/\\/g, path.sep)
  if (value === '~') value = env.home
  else if (value.startsWith(`~${path.sep}`)) value = path.join(env.home, value.slice(2))
  value = value.replace(/\$\{DSH_HOME\}|\$DSH_HOME\b/g, env.dshHome)
  value = value.replace(/\$\{HOME\}|\$HOME\b/g, env.home)
  // Windows adapters may declare %APPDATA%-style paths.
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name: string) => env.env[name] ?? match)
  return path.isAbsolute(value) ? path.normalize(value) : path.join(env.home, value)
}

/**
 * Abbreviate a path for display without losing information.
 * @param absolute - absolute path.
 * @param env - environment whose home is abbreviated.
 * @returns the path with `~` or `$DSH_HOME` substituted when it lies below either.
 */
export function displayPath(absolute: string, env: Env): string {
  // The harness home usually sits inside the user home, so it is checked first.
  if (absolute === env.dshHome) return '$DSH_HOME'
  if (absolute.startsWith(`${env.dshHome}${path.sep}`)) {
    return `$DSH_HOME${absolute.slice(env.dshHome.length)}`
  }
  if (absolute === env.home) return '~'
  if (absolute.startsWith(`${env.home}${path.sep}`)) return `~${absolute.slice(env.home.length)}`
  return absolute
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
