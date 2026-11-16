/** pip: `proxy` in the `[global]` section of the user configuration. */
import type { ToolSpec } from '../core/types.ts'

export const pip: ToolSpec = {
  id: 'pip',
  name: 'pip',
  category: 'python',
  kind: 'ini',
  section: 'global',
  path: {
    // pip's documented user config on macOS lives under Application Support;
    // the XDG and legacy locations stay as fallbacks for existing setups.
    darwin: [
      '~/Library/Application Support/pip/pip.conf',
      '~/.config/pip/pip.conf',
      '~/.pip/pip.conf',
    ],
    linux: ['~/.config/pip/pip.conf', '~/.pip/pip.conf'],
    win32: ['%APPDATA%/pip/pip.ini', '%APPDATA%/pip/pip.conf'],
  },
  binary: 'pip3',
  fields: [{ key: 'proxy', part: 'url' }],
}
