/** curl: `proxy` and `noproxy` in the user's `.curlrc`. */
import type { ToolSpec } from '../core/types.ts'

export const curl: ToolSpec = {
  id: 'curl',
  name: 'curl',
  category: 'network',
  kind: 'props',
  path: ['~/.curlrc', '~/_curlrc'],
  binary: 'curl',
  fields: [
    { key: 'proxy', part: 'url' },
    { key: 'noproxy', part: 'noProxy' },
  ],
}
