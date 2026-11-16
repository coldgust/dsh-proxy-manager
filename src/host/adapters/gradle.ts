/** Gradle: JVM proxy system properties, which store host and port separately. */
import type { ToolSpec } from '../core/types.ts'

export const gradle: ToolSpec = {
  id: 'gradle',
  name: 'Gradle',
  category: 'jvm',
  kind: 'props',
  path: '~/.gradle/gradle.properties',
  binary: 'gradle',
  fields: [
    { key: 'systemProp.http.proxyHost', part: 'host' },
    { key: 'systemProp.http.proxyPort', part: 'port' },
    { key: 'systemProp.https.proxyHost', part: 'host' },
    { key: 'systemProp.https.proxyPort', part: 'port' },
    { key: 'systemProp.http.nonProxyHosts', part: 'noProxy', transform: 'jvmNoProxy' },
  ],
}
