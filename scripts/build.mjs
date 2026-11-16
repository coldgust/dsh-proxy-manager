/**
 * Build both halves of the bundle.
 *
 * Layout:
 *  - `lib/host.js`   the Host bundle (plain ESM, node builtins external)
 *  - `lib/loader.js` the package entry: a tiny loader that imports `host.js`
 *                     with a cache-busting query, so a rebuild takes effect on
 *                     the next activation instead of needing a DSH restart
 *  - `lib/index.js`  a stable re-export of `host.js` for tests and tooling
 *  - `lib/client.js` the browser factory wrapped in the module-loader envelope
 *
 * The Host bundle imports nothing from the dsh installation; the Client bundle
 * resolves only `react` through the page's shared module table.
 */
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const out = path.join(root, 'lib')

await fs.rm(out, { recursive: true, force: true })
await fs.mkdir(out, { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/host.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
})

const loader = `// ${pkg.name}: package entry.
//
// The Host bundle is imported with a cache-busting query on every activation.
// Node caches evaluated ES modules by URL, so importing the plain file name
// again would keep running the code from before a rebuild; a changing query
// makes each activation evaluate the current \`host.js\`.
export const inject = ['connection', 'webServer']

export async function apply(ctx, config) {
  const module = await import(new URL(\`./host.js?v=\${Date.now()}\`, import.meta.url).href)
  await module.apply(ctx, config)
}
`
await fs.writeFile(path.join(out, 'loader.js'), loader)
await fs.writeFile(path.join(out, 'index.js'), "// Stable re-export of the Host bundle, for tests and tooling.\nexport * from './host.js'\n")

const intermediate = path.join(out, '.client.cjs')
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  outfile: intermediate,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  jsx: 'transform',
  external: ['react'],
  loader: { '.css': 'text' },
  legalComments: 'none',
  logLevel: 'warning',
})

const bundled = await fs.readFile(intermediate, 'utf8')
await fs.rm(intermediate, { force: true })

const indented = bundled
  .split('\n')
  .map(line => (line === '' ? line : `      ${line}`))
  .join('\n')

const wrapped = `// ${pkg.name} browser half: one lazy factory in the shared module loader.
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    const module = { exports: {} };
    (function (module, exports, require) {
${indented}
    })(module, module.exports, require);
    return module.exports;
  },
});
`

await fs.writeFile(path.join(out, 'client.js'), wrapped)
process.stdout.write(`built ${pkg.name} ${pkg.version} -> lib/host.js, lib/loader.js, lib/client.js\n`)
