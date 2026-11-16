/** npm: `proxy` and `https-proxy` in the user's `.npmrc`. */
import type { ToolSpec } from '../core/types.ts'

export const npm: ToolSpec = {
  id: 'npm',
  name: 'npm',
  category: 'javascript',
  kind: 'props',
  path: '~/.npmrc',
  binary: 'npm',
  fields: [
    { key: 'proxy', part: 'url' },
    { key: 'https-proxy', part: 'url' },
  ],
}
