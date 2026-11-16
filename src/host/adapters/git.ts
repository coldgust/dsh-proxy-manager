/** Git: `http.proxy` in the user's global config, written for both schemes. */
import type { ToolSpec } from '../core/types.ts'

export const git: ToolSpec = {
  id: 'git',
  name: 'Git',
  category: 'version-control',
  kind: 'ini',
  path: '~/.gitconfig',
  binary: 'git',
  fields: [
    { section: 'http', key: 'proxy', part: 'url' },
    { section: 'https', key: 'proxy', part: 'url' },
  ],
}
