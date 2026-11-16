/**
 * Adapter contract shared by the Host half, the RPC channel, the agent tool and
 * the browser half. Adding support for another tool means describing it with
 * these types — no new control flow: `kind` picks the config-file dialect and
 * `fields` says which keys carry the proxy.
 */

/** Configuration-file dialects the registry can read and rewrite. */
export type ToolKind = 'json' | 'ini' | 'props' | 'yaml' | 'toml' | 'env' | 'shell' | 'xml'

/** Which part of a proxy one configured key carries. */
export type FieldPart = 'url' | 'scheme' | 'host' | 'port' | 'noProxy'

/** One key of a tool's configuration file and the proxy part it stores. */
export interface ToolField {
  /** Key inside the file; for `json` a dotted path such as `proxies.default.httpProxy`. */
  key: string
  /** Proxy part stored under that key. */
  part: FieldPart
  /** Section overriding the spec's section, for tools that repeat a key per scheme. */
  section?: string
  /** Value dialect for tools that store the bypass list differently from the UI. */
  transform?: 'jvmNoProxy'
}

/**
 * A configuration path. Adapters state one path per platform, and each platform
 * entry may list candidates: the first one that exists wins, so a tool that
 * moved its file (or reads a legacy location) is still found.
 */
export type PathSpec =
  | string
  | readonly string[]
  | Partial<Record<'darwin' | 'linux' | 'win32', string | readonly string[]>>

/** One tool the registry can configure. */
export interface ToolSpec {
  /** Stable identifier, unique across built-in and user-added adapters. */
  id: string
  /** Display name shown in the list and in tool results. */
  name: string
  /** Grouping label, such as a language ecosystem or the container runtime. */
  category?: string
  /** Configuration-file dialect. */
  kind: ToolKind
  /** File this adapter reads and rewrites. */
  path: PathSpec
  /** Section or table name for the `ini` and `toml` dialects. */
  section?: string
  /** Assignment syntax of the `shell` dialect; defaults to the platform's shell. */
  syntax?: 'posix' | 'powershell'
  /** Executable used for the informational "installed" check; PATH lookup only. */
  binary?: string
  /** Short limitation shown beside the row, such as a file shared with another tool. */
  note?: string
  /** Keys carrying the proxy, in an order the UI can present. */
  fields: ToolField[]
  /** True when a user added this adapter from the settings page. */
  custom?: boolean
}

/** Proxy values written into every enabled tool. */
export interface ProxySettings {
  /** Proxy URL, for example `http://127.0.0.1:7890`. */
  url: string
  /** Hosts that bypass the proxy; `''` removes the bypass list. */
  noProxy: string
}

/** What one tool's configuration currently says. */
export interface ToolReading {
  /** Proxy URL reconstructed from the configured parts. */
  url?: string
  /** Bypass list when the tool stores one. */
  noProxy?: string
  /** True when at least one managed key exists. */
  present: boolean
}

/** Live status of one tool, as reported to the page and to the agent. */
export interface ToolStatus {
  id: string
  name: string
  category?: string
  kind: ToolKind
  /** Absolute configuration path. */
  path: string
  /** Configuration path with the home directory abbreviated. */
  displayPath: string
  /** Whether the configuration file exists. */
  exists: boolean
  /** PATH lookup result when the adapter names a binary. */
  installed?: boolean
  enabled: boolean
  url?: string
  noProxy?: string
  note?: string
  custom?: boolean
  /** Adapter-specific failure, such as an unreadable or malformed file. */
  error?: string
}

/** Everything the settings page renders. */
export interface Snapshot {
  settings: ProxySettings
  /** Proxy values discovered in the Host environment, offered as a starting point. */
  suggested: string
  tools: ToolStatus[]
  /** Ordered ids of every tool currently enabled. */
  enabled: string[]
  /** Pinned adapter ids, in the order the user pinned them. */
  pinned: string[]
  platform: string
}

/** One tool's outcome inside a batch operation. */
export interface ToolResult {
  id: string
  name: string
  ok: boolean
  error?: string
  status: ToolStatus
}

/** Response of a mutating operation: the fresh snapshot plus per-tool outcomes. */
export interface MutationResult {
  snapshot: Snapshot
  results: ToolResult[]
}
