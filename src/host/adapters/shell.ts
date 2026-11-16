/**
 * The shell profile: one managed block of `HTTP_PROXY`-style variables.
 *
 * This is the broadest adapter in the bundle. Everything that reads proxy
 * environment variables instead of its own configuration file — Go, kubectl,
 * Helm, Terraform, aws, uv, Poetry, Bundler, Homebrew, git-lfs — picks the
 * change up from here, and only from a newly started shell.
 */
import type { ToolSpec } from '../core/types.ts'

export const shell: ToolSpec = {
  id: 'shell',
  name: 'Shell environment',
  category: 'environment',
  kind: 'shell',
  path: {
    darwin: ['~/.zshrc', '~/.bashrc'],
    linux: ['~/.bashrc', '~/.zshrc'],
    win32: '~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1',
  },
  note: 'applies to newly opened terminals',
  fields: [
    { key: 'HTTP_PROXY', part: 'url' },
    { key: 'HTTPS_PROXY', part: 'url' },
    { key: 'NO_PROXY', part: 'noProxy' },
  ],
}
