/**
 * The built-in adapter table.
 *
 * Adding support for another tool is two steps: describe it in a new module
 * next to these (see `types.ts` for every supported field), then list it here.
 * Nothing else in the plugin needs to change — the settings page, the RPC
 * channel and the `proxy_manager` tool all read this one table. Users can also
 * add adapters at runtime from the settings page, and other Host plugins can
 * call `ctx.proxyManager.registerTool(spec)`.
 */
import type { ToolSpec } from '../core/types.ts'
import { cargo } from './cargo.ts'
import { curl } from './curl.ts'
import { docker } from './docker.ts'
import { dsh } from './dsh.ts'
import { git } from './git.ts'
import { gradle } from './gradle.ts'
import { maven } from './maven.ts'
import { npm } from './npm.ts'
import { pip } from './pip.ts'
import { pnpm } from './pnpm.ts'
import { shell } from './shell.ts'
import { wget } from './wget.ts'
import { yarn } from './yarn.ts'

/** Adapters shipped with the bundle, in display order. */
export const builtinAdapters: readonly ToolSpec[] = [
  git,
  npm,
  pnpm,
  yarn,
  cargo,
  pip,
  maven,
  gradle,
  dsh,
  docker,
  shell,
  curl,
  wget,
]
