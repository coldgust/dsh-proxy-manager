/**
 * Display ordering, filtering and paging for the adapter list.
 *
 * These are pure functions over the snapshot the Host already produced: the
 * Host owns the registry and the pin state, the page owns how the list is
 * presented, and keeping the rules here lets both be tested once.
 */

/** The fields ordering and search look at. */
export interface OrderableTool {
  id: string
  name: string
  enabled: boolean
  /** False when the configuration file has not been created yet. */
  exists: boolean
  category?: string
  displayPath: string
  path: string
  url?: string
  note?: string
}

/** Rank of one row: pinned first, then configured, then unconfigured, then missing files. */
function rankOf(tool: OrderableTool, pinned: readonly string[]): number {
  if (pinned.includes(tool.id)) return 0
  if (!tool.exists) return 3
  return tool.enabled ? 1 : 2
}

/**
 * Order the list for display.
 *
 * Pinned rows keep the order the user pinned them in, so each toggle is
 * predictable; everything else keeps registry order inside its rank.
 * @param tools - snapshot rows in registry order.
 * @param pinned - pinned adapter ids, in pin order.
 * @returns a new array in display order.
 */
export function orderTools<T extends OrderableTool>(tools: readonly T[], pinned: readonly string[]): T[] {
  return tools
    .map((tool, index) => ({ tool, index, rank: rankOf(tool, pinned) }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      if (left.rank === 0) {
        const leftPin = pinned.indexOf(left.tool.id)
        const rightPin = pinned.indexOf(right.tool.id)
        if (leftPin !== rightPin) return leftPin - rightPin
      }
      return left.index - right.index
    })
    .map(entry => entry.tool)
}

/**
 * Test one row against a free-text query.
 * @param tool - snapshot row.
 * @param query - user input; empty matches everything.
 * @returns true when the row should stay visible.
 */
export function matchesQuery(tool: OrderableTool, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return [tool.name, tool.id, tool.category, tool.displayPath, tool.path, tool.url, tool.note]
    .some(value => value !== undefined && value.toLowerCase().includes(needle))
}

/** One page of rows plus the counts the pager displays. */
export interface Page<T> {
  /** Rows on this page. */
  items: T[]
  /** 1-based page actually shown, clamped into range. */
  page: number
  /** Total pages, at least 1. */
  pages: number
  /** Total rows across every page. */
  total: number
}

/**
 * Slice one page out of a filtered list.
 * @param items - filtered rows, already ordered.
 * @param page - requested 1-based page; out-of-range values clamp.
 * @param size - rows per page; at least 1.
 * @returns the page and its counters.
 */
export function pageSlice<T>(items: readonly T[], page: number, size: number): Page<T> {
  const perPage = Math.max(1, Math.floor(size))
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(Math.max(1, Math.floor(page)), pages)
  const start = (current - 1) * perPage
  return { items: items.slice(start, start + perPage), page: current, pages, total: items.length }
}
