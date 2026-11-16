/**
 * The proxy manager service: one registry of adapters, one serialized set of
 * operations. The settings page, the RPC channel, the agent tool and other Host
 * plugins all call these methods, so the behaviour cannot drift between them.
 */
import { stat } from 'node:fs/promises'
import { builtinAdapters } from './adapters/index.ts'
import { applyTool, clearTool, inspectTool } from './core/engine.ts'
import { displayPath, resolvePathSpec, type Env } from './core/env.ts'
import { requireProxy, suggestedProxy } from './core/proxy.ts'
import { sanitizeToolSpec, StateStore, type PluginState } from './core/state.ts'
import { detectSystemProxy, openInEditor, type SystemProxy, type SystemProxyReport } from './core/system-proxy.ts'
import type {
  MutationResult, ProxySettings, Snapshot, ToolResult, ToolSpec, ToolStatus,
} from './core/types.ts'

/** Request shape for the mutating operations. */
export interface ApplyRequest {
  /** Adapter ids to touch; omit for every adapter. */
  tools?: readonly string[] | undefined
  /** Proxy URL overriding the saved setting for this call only. */
  url?: string | undefined
  /** Bypass list overriding the saved setting for this call only. */
  noProxy?: string | undefined
}

/** Public face of the service, also provided as `ctx.proxyManager`. */
export interface ProxyManagerApi {
  /** Current settings and per-tool status. */
  snapshot(): Promise<Snapshot>
  /** Store the proxy in the selected adapters. */
  apply(request?: ApplyRequest): Promise<MutationResult>
  /** Remove the proxy from the selected adapters. */
  clear(request?: { tools?: readonly string[] | undefined }): Promise<MutationResult>
  /** Persist the default proxy URL and bypass list. */
  saveSettings(patch: Partial<ProxySettings>): Promise<Snapshot>
  /** Add a user-defined adapter. */
  addTool(input: unknown): Promise<Snapshot>
  /** Remove a user-defined adapter. */
  removeTool(id: string): Promise<Snapshot>
  /** Let other Host plugins contribute adapters; returns a disposer. */
  registerTool(spec: ToolSpec): () => void
  /** Read the operating system's own proxy configuration, if any. */
  systemProxy(): Promise<SystemProxyReport>
  /** Open one adapter's configuration file with the system handler. */
  openConfig(id: string): Promise<{ path: string, displayPath: string }>
  /** Pin or unpin one adapter. */
  pinTool(id: string, pinned: boolean): Promise<Snapshot>
}

/** The proxy manager implementation. */
export class ProxyManager implements ProxyManagerApi {
  private readonly store: StateStore
  private readonly runtimeAdapters: ToolSpec[] = []
  private state: PluginState | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly env: Env) {
    this.store = new StateStore(env)
  }

  /** Run one operation after the previous one settled, so writes never interleave. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async loaded(): Promise<PluginState> {
    this.state ??= await this.store.load()
    return this.state
  }

  /** Built-in adapters first, then user-added and plugin-registered ones. */
  private specs(state: PluginState): ToolSpec[] {
    const byId = new Map<string, ToolSpec>()
    for (const spec of builtinAdapters) byId.set(spec.id, spec)
    for (const spec of state.tools) byId.set(spec.id, spec)
    for (const spec of this.runtimeAdapters) byId.set(spec.id, spec)
    return [...byId.values()]
  }

  registerTool(input: ToolSpec): () => void {
    const spec = sanitizeToolSpec({ ...input, custom: true })
    const index = this.runtimeAdapters.findIndex(entry => entry.id === spec.id)
    if (index === -1) this.runtimeAdapters.push(spec)
    else this.runtimeAdapters[index] = spec
    return () => {
      const at = this.runtimeAdapters.findIndex(entry => entry.id === spec.id)
      if (at !== -1) this.runtimeAdapters.splice(at, 1)
    }
  }

  private async settings(): Promise<ProxySettings> {
    return (await this.loaded()).settings
  }

  async systemProxy(): Promise<SystemProxyReport> {
    return await detectSystemProxy(this.env)
  }

  async openConfig(id: string): Promise<{ path: string, displayPath: string }> {
    const state = await this.loaded()
    const spec = this.specs(state).find(entry => entry.id === id)
    if (spec === undefined) throw new Error(`unknown tool id: ${id}`)
    const absolute = resolvePathSpec(spec.path, this.env)
    try {
      await stat(absolute)
    } catch {
      throw new Error(`${displayPath(absolute, this.env)} does not exist yet; enable this tool first`)
    }
    await openInEditor(absolute, this.env.platform)
    return { path: absolute, displayPath: displayPath(absolute, this.env) }
  }

  async pinTool(id: string, pinned: boolean): Promise<Snapshot> {
    return await this.serialize(async () => {
      const state = await this.loaded()
      if (!this.specs(state).some(spec => spec.id === id)) throw new Error(`unknown tool id: ${id}`)
      const without = state.pinned.filter(entry => entry !== id)
      state.pinned = pinned ? [...without, id] : without
      await this.store.save(state)
      return await this.snapshot()
    })
  }

  async snapshot(): Promise<Snapshot> {
    const state = await this.loaded()
    const specs = this.specs(state)
    const tools = await Promise.all(specs.map(spec => inspectTool(spec, this.env)))
    const known = new Set(tools.map(tool => tool.id))
    return {
      settings: { ...state.settings },
      suggested: suggestedProxy(this.env.env),
      tools,
      enabled: tools.filter(tool => tool.enabled).map(tool => tool.id),
      pinned: state.pinned.filter(id => known.has(id)),
      platform: this.env.platform,
    }
  }

  /** Resolve the proxy one call writes, without persisting an override. */
  private resolveSettings(request: ApplyRequest, base: ProxySettings): ProxySettings {
    const candidate = request.url?.trim() || base.url.trim() || suggestedProxy(this.env.env)
    if (candidate === '') {
      throw new Error('no proxy URL configured: save a proxy address such as http://127.0.0.1:7890 first')
    }
    return { url: requireProxy(candidate).url, noProxy: request.noProxy === undefined ? base.noProxy : request.noProxy.trim() }
  }

  private async select(request: ApplyRequest | { tools?: readonly string[] | undefined }): Promise<ToolSpec[]> {
    const state = await this.loaded()
    const specs = this.specs(state)
    const requested = request.tools
    if (requested === undefined) return specs
    const known = new Map(specs.map(spec => [spec.id, spec]))
    const unknown = requested.filter(id => !known.has(id))
    if (unknown.length > 0) throw new Error(`unknown tool id: ${unknown.join(', ')}`)
    return requested.map(id => known.get(id) as ToolSpec)
  }

  private toResult(status: ToolStatus): ToolResult {
    return {
      id: status.id,
      name: status.name,
      ok: status.error === undefined,
      ...(status.error === undefined ? {} : { error: status.error }),
      status,
    }
  }

  async apply(request: ApplyRequest = {}): Promise<MutationResult> {
    return await this.serialize(async () => {
      const specs = await this.select(request)
      const base = await this.settings()
      const settings = this.resolveSettings(request, base)
      const results = await Promise.all(specs.map(async spec => this.toResult(await applyTool(spec, settings, this.env))))
      return { snapshot: await this.snapshot(), results }
    })
  }

  async clear(request: { tools?: readonly string[] | undefined } = {}): Promise<MutationResult> {
    return await this.serialize(async () => {
      const specs = await this.select(request)
      const results = await Promise.all(specs.map(async spec => this.toResult(await clearTool(spec, this.env))))
      return { snapshot: await this.snapshot(), results }
    })
  }

  async saveSettings(patch: Partial<ProxySettings>): Promise<Snapshot> {
    return await this.serialize(async () => {
      const state = await this.loaded()
      const url = patch.url === undefined ? state.settings.url : patch.url.trim()
      if (url !== '') requireProxy(url)
      const noProxy = patch.noProxy === undefined ? state.settings.noProxy : patch.noProxy.trim()
      state.settings = { url: url === '' ? '' : requireProxy(url).url, noProxy }
      await this.store.save(state)
      return await this.snapshot()
    })
  }

  async addTool(input: unknown): Promise<Snapshot> {
    return await this.serialize(async () => {
      const state = await this.loaded()
      const spec = sanitizeToolSpec(input)
      if (builtinAdapters.some(entry => entry.id === spec.id)) {
        throw new Error(`"${spec.id}" is a built-in adapter id; choose another id`)
      }
      state.tools = [...state.tools.filter(entry => entry.id !== spec.id), spec]
      await this.store.save(state)
      return await this.snapshot()
    })
  }

  async removeTool(id: string): Promise<Snapshot> {
    return await this.serialize(async () => {
      const state = await this.loaded()
      const remaining = state.tools.filter(entry => entry.id !== id)
      if (remaining.length === state.tools.length) throw new Error(`"${id}" is not a user-added adapter`)
      state.tools = remaining
      state.pinned = state.pinned.filter(entry => entry !== id)
      await this.store.save(state)
      return await this.snapshot()
    })
  }
}
