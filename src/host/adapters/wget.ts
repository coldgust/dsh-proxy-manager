/** wget: `http_proxy` and `https_proxy` in the user's `.wgetrc`. */
import type { ToolSpec } from '../core/types.ts'

export const wget: ToolSpec = {
  id: 'wget',
  name: 'wget',
  category: 'network',
  kind: 'props',
  path: ['~/.wgetrc', '~/_wgetrc'],
  binary: 'wget',
  fields: [
    { key: 'http_proxy', part: 'url' },
    { key: 'https_proxy', part: 'url' },
    { key: 'no_proxy', part: 'noProxy' },
  ],
}
