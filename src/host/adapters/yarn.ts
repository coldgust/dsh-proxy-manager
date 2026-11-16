/** Yarn (berry): flat `httpProxy` / `httpsProxy` keys in `.yarnrc.yml`. */
import type { ToolSpec } from '../core/types.ts'

export const yarn: ToolSpec = {
  id: 'yarn',
  name: 'Yarn',
  category: 'javascript',
  kind: 'yaml',
  path: '~/.yarnrc.yml',
  binary: 'yarn',
  fields: [
    { key: 'httpProxy', part: 'url' },
    { key: 'httpsProxy', part: 'url' },
  ],
}
