/**
 * Maven: one `<proxy>` element inside `~/.m2/settings.xml`.
 *
 * Maven stores the proxy as an element rather than a key, so this adapter uses
 * the `xml` dialect, which writes only that element and keeps the rest of the
 * document untouched.
 */
import type { ToolSpec } from '../core/types.ts'

export const maven: ToolSpec = {
  id: 'maven',
  name: 'Maven',
  category: 'jvm',
  kind: 'xml',
  path: '~/.m2/settings.xml',
  binary: 'mvn',
  note: 'active only while no other proxy element overrides it',
  fields: [
    { key: 'host', part: 'host' },
    { key: 'port', part: 'port' },
    { key: 'protocol', part: 'scheme' },
    { key: 'nonProxyHosts', part: 'noProxy', transform: 'jvmNoProxy' },
  ],
}
