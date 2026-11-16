/**
 * Host half of dsh-proxy-manager.
 *
 * One row owns three faces of the same operations:
 *  - a Connection RPC channel the settings page calls,
 *  - a `proxy_manager` tool the agent calls,
 *  - `ctx.proxyManager`, offered to other Host plugins so they can add adapters.
 *
 * The plugin imports nothing from the dsh installation: it talks to the Host
 * through the context it is handed, which keeps it independent of the release
 * it is installed into.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { currentEnv } from './core/env.ts'
import type { MutationResult, ProxySettings, Snapshot, ToolSpec } from './core/types.ts'
import { ProxyManager, type ApplyRequest } from './service.ts'

/** Absolute HTTP prefix the browser half posts to. */
export const CHANNEL = '/dsh-proxy-manager'

/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 1024 * 1024

/** Name of the agent tool. */
export const TOOL_NAME = 'proxy_manager'

interface RpcFailure {
  code: string
  message: string
  details: Record<string, unknown>
}

type RpcOutcome =
  | { ok: true, value: unknown }
  | { ok: false, error: RpcFailure }

/** One raw route the web carrier serves. */
interface WebRouteSpec {
  kind: 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

/** The slice of the Cordis context this plugin uses. */
interface HostContext {
  connection: {
    /** Host/Origin fence plus browser-cookie admission for one raw request. */
    requestRejection(request: { headers: IncomingMessage['headers'] }): 401 | 403 | undefined
  }
  webServer: { register(route: WebRouteSpec): () => void }
  tools: { register(definition: unknown): () => void }
  inject(deps: string[], callback: (scope: HostContext) => void): void
  effect(setup: () => (() => void) | Promise<void>, label?: string): unknown
  provide(name: string, value: unknown): () => void
  logger?: { warn(message: string): void }
}

/**
 * Services this plugin needs before it can serve the page. `webServer` is
 * required because a Connection RPC channel is mounted as a Web route.
 */
export const inject = ['connection', 'webServer']

/** Read one object payload into a record without trusting its shape. */
function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
}

/** Read an optional id list from a request payload. */
function payloadIds(payload: Record<string, unknown>): string[] | undefined {
  const value = payload.tools ?? payload.ids
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw new Error('tools must be an array of adapter ids')
  return value.map(entry => {
    if (typeof entry !== 'string') throw new Error('tools must be an array of adapter ids')
    return entry
  })
}

/** Read an optional string from a request payload. */
function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  return value
}

/** One line per tool, for the agent-facing summary. */
function summarize(action: string, snapshot: Snapshot, results?: readonly { id: string, error?: string }[]): string {
  const failures = results?.filter(result => result.error !== undefined) ?? []
  const enabled = snapshot.tools.filter(tool => tool.enabled)
  const lines = [
    `${action}: ${enabled.length}/${snapshot.tools.length} tools use a proxy${snapshot.settings.url === '' ? '' : ` (${snapshot.settings.url})`}.`,
  ]
  for (const tool of snapshot.tools) {
    const state = tool.error !== undefined
      ? `error: ${tool.error}`
      : tool.enabled ? `on ${tool.url ?? ''}`.trim() : 'off'
    lines.push(`- ${tool.name} [${tool.id}]: ${state} — ${tool.displayPath}`)
  }
  if (failures.length > 0) lines.push(`${failures.length} tool(s) reported a failure; see the list above.`)
  return lines.join('\n')
}

/** Tool definition handed to the Host registry. */
function toolDefinition(manager: ProxyManager): Record<string, unknown> {
  return {
    name: TOOL_NAME,
    description: [
      'Read or change the proxy configuration of the developer tools installed on this machine',
      '(git, npm, pnpm, yarn, DeepSeek Harness, Docker, Gradle, Cargo, pip) plus any adapter the user added.',
      'Use action "status" before telling the user what is configured; it returns every tool, its proxy URL and its configuration file.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'enable', 'disable', 'system'],
          description: 'status reads every adapter; enable writes the proxy; disable removes it; system reads the operating system proxy.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Adapter ids to change; omit for every adapter.',
        },
        proxy: {
          type: 'string',
          description: 'Proxy URL for this call only, for example http://127.0.0.1:7890. Defaults to the saved setting.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          summary: { type: 'string' },
          action: { type: 'string' },
        },
        required: ['summary', 'action'],
      },
      render: (_args: unknown, value: unknown): unknown[] => {
        const summary = (value as { summary?: unknown }).summary
        return [{ type: 'text', text: typeof summary === 'string' ? summary : 'proxy_manager finished.' }]
      },
    },
    async execute(args: unknown, exec: { signal?: AbortSignal }): Promise<unknown> {
      const request = payloadRecord(args)
      const action = payloadString(request, 'action') ?? 'status'
      const tools = payloadIds(request)
      if (exec.signal?.aborted === true) throw new Error('cancelled')
      if (action === 'status') {
        const snapshot = await manager.snapshot()
        return { action, summary: summarize('status', snapshot), snapshot }
      }
      if (action === 'enable') {
        const url = payloadString(request, 'proxy')
        const result: MutationResult = await manager.apply({ tools, ...(url === undefined ? {} : { url }) })
        return { action, summary: summarize('enable', result.snapshot, result.results), snapshot: result.snapshot }
      }
      if (action === 'system') {
        const detected = await manager.systemProxy()
        const summary = detected.proxy !== undefined
          ? `system: ${detected.proxy.url}${detected.proxy.noProxy === '' ? '' : ` (bypass ${detected.proxy.noProxy})`} from ${detected.proxy.source}.`
          : detected.pacUrl !== undefined
            ? `system: this machine uses an automatic configuration script (${detected.pacUrl}); no fixed proxy address can be read from it.`
            : 'system: the operating system configures no manual proxy.'
        return { action, summary, system: detected }
      }
      if (action === 'disable') {
        const result: MutationResult = await manager.clear({ tools })
        return { action, summary: summarize('disable', result.snapshot, result.results), snapshot: result.snapshot }
      }
      throw new Error(`unknown action ${JSON.stringify(action)}; use status, enable, disable or system`)
    },
  }
}

/** Read a bounded request body as UTF-8. */
async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Write one JSON response. */
function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  response.end(body)
}

/**
 * Serve the settings page, the agent tool and the extension service.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: HostContext): void {
  const manager = new ProxyManager(currentEnv())

  ctx.provide('proxyManager', {
    snapshot: () => manager.snapshot(),
    apply: (request: ApplyRequest = {}) => manager.apply(request),
    clear: (request: { tools?: readonly string[] | undefined } = {}) => manager.clear(request),
    saveSettings: (patch: Partial<ProxySettings>) => manager.saveSettings(patch),
    addTool: (input: unknown) => manager.addTool(input),
    removeTool: (id: string) => manager.removeTool(id),
    registerTool: (spec: ToolSpec) => manager.registerTool(spec),
    systemProxy: () => manager.systemProxy(),
    openConfig: (id: string) => manager.openConfig(id),
    pinTool: (id: string, pinned: boolean) => manager.pinTool(id, pinned),
  })

  /** One endpoint dispatcher shared by the mounted channel. */
  const handler = async (endpoint: string, payload: unknown): Promise<RpcOutcome> => {
    const request = payloadRecord(payload)
    try {
      switch (endpoint) {
        case 'snapshot':
          return { ok: true, value: await manager.snapshot() }
        case 'apply': {
          const url = payloadString(request, 'url')
          const noProxy = payloadString(request, 'noProxy')
          const tools = payloadIds(request)
          return {
            ok: true,
            value: await manager.apply({
              ...(tools === undefined ? {} : { tools }),
              ...(url === undefined ? {} : { url }),
              ...(noProxy === undefined ? {} : { noProxy }),
            }),
          }
        }
        case 'clear': {
          const tools = payloadIds(request)
          return { ok: true, value: await manager.clear({ ...(tools === undefined ? {} : { tools }) }) }
        }
        case 'saveSettings': {
          const url = payloadString(request, 'url')
          const noProxy = payloadString(request, 'noProxy')
          return {
            ok: true,
            value: await manager.saveSettings({
              ...(url === undefined ? {} : { url }),
              ...(noProxy === undefined ? {} : { noProxy }),
            }),
          }
        }
        case 'addTool':
          return { ok: true, value: await manager.addTool(request.spec) }
        case 'systemProxy':
          return { ok: true, value: await manager.systemProxy() }
        case 'pin': {
          const id = payloadString(request, 'id')
          if (id === undefined) throw new Error('id is required')
          return { ok: true, value: await manager.pinTool(id, request.pinned === true) }
        }
        case 'openConfig': {
          const id = payloadString(request, 'id')
          if (id === undefined) throw new Error('id is required')
          return { ok: true, value: await manager.openConfig(id) }
        }
        case 'removeTool': {
          const id = payloadString(request, 'id')
          if (id === undefined) throw new Error('id is required')
          return { ok: true, value: await manager.removeTool(id) }
        }
        default:
          return { ok: false, error: { code: 'proxy-manager/unknown-endpoint', message: `unknown endpoint ${endpoint}`, details: {} } }
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'proxy-manager/failed',
          message: error instanceof Error ? error.message : String(error),
          details: {},
        },
      }
    }
  }

  // The page posts plain JSON to this prefix. `requestRejection` applies the
  // carrier's Host/Origin fence and requires the browser's own session cookie,
  // which is the same admission every Remote call goes through.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: CHANNEL,
    handler: async (request, response) => {
      const rejection = ctx.connection.requestRejection(request)
      if (rejection !== undefined) {
        response.writeHead(rejection)
        response.end(rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'POST' })
        response.end()
        return
      }
      const endpoint = new URL(request.url ?? '/', 'http://127.0.0.1').pathname.slice(CHANNEL.length + 1)
      let payload: unknown
      try {
        payload = JSON.parse(await readBody(request))
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          error: { code: 'proxy-manager/bad-request', message: error instanceof Error ? error.message : 'body is not JSON', details: {} },
        })
        return
      }
      writeJson(response, 200, await handler(endpoint, payload))
    },
  }), 'proxy-manager: http channel')

  ctx.inject(['tools'], (scope) => {
    scope.effect(() => scope.tools.register(toolDefinition(manager)), 'proxy-manager: agent tool')
  })
}

/** Internals re-exported for the test suite; not part of the plugin contract. */
export { ProxyManager } from './service.ts'
export { builtinAdapters } from './adapters/index.ts'
export { applyTool, clearTool, inspectTool, readToolConfig, writeToolConfig, clearToolConfig } from './core/engine.ts'
export { readValue, writeValue, removeValue } from './core/formats.ts'
export { currentEnv, displayPath, expandPath, isOnPath, resolvePathSpec } from './core/env.ts'
export { parseProxy, requireProxy } from './core/proxy.ts'
export { matchesQuery, orderTools, pageSlice } from './core/order.ts'
export { detectSystemProxy, openerAttempts, parseGnomeProxy, parseScutilProxy, parseWindowsProxy } from './core/system-proxy.ts'
export type {
  MutationResult, ProxySettings, Snapshot, ToolField, ToolKind, ToolSpec, ToolStatus,
} from './core/types.ts'
