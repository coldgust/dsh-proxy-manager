/** pnpm reads the same user `.npmrc` as npm, so both rows describe one file. */
import type { ToolSpec } from '../core/types.ts'

export const pnpm: ToolSpec = {
  id: 'pnpm',
  name: 'pnpm',
  category: 'javascript',
  kind: 'props',
  path: '~/.npmrc',
  binary: 'pnpm',
  note: 'shares ~/.npmrc with npm',
  fields: [
    { key: 'proxy', part: 'url' },
    { key: 'https-proxy', part: 'url' },
  ],
}
