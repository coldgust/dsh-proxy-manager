/**
 * DeepSeek Harness itself: the harness-home `.env` is the only file whose
 * `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` entries the app accepts.
 */
import type { ToolSpec } from '../core/types.ts'

export const dsh: ToolSpec = {
  id: 'dsh',
  name: 'DeepSeek Harness',
  category: 'dsh',
  kind: 'env',
  path: '$DSH_HOME/.env',
  binary: 'dsh',
  note: 'applied the next time DSH starts',
  fields: [
    { key: 'HTTP_PROXY', part: 'url' },
    { key: 'HTTPS_PROXY', part: 'url' },
    { key: 'NO_PROXY', part: 'noProxy' },
  ],
}
