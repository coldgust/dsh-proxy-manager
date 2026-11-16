/** Cargo: `proxy` in the `[http]` table of `~/.cargo/config.toml`. */
import type { ToolSpec } from '../core/types.ts'

export const cargo: ToolSpec = {
  id: 'cargo',
  name: 'Cargo',
  category: 'rust',
  kind: 'toml',
  section: 'http',
  path: '~/.cargo/config.toml',
  binary: 'cargo',
  fields: [{ key: 'proxy', part: 'url' }],
}
