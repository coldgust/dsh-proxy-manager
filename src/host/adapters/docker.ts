/** Docker CLI: the `proxies.default` block of `~/.docker/config.json`. */
import type { ToolSpec } from '../core/types.ts'

export const docker: ToolSpec = {
  id: 'docker',
  name: 'Docker',
  category: 'containers',
  kind: 'json',
  path: '~/.docker/config.json',
  binary: 'docker',
  fields: [
    { key: 'proxies.default.httpProxy', part: 'url' },
    { key: 'proxies.default.httpsProxy', part: 'url' },
    { key: 'proxies.default.noProxy', part: 'noProxy' },
  ],
}
