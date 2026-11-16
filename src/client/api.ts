/**
 * The page's only Host entry point: the HTTP prefix the Host half registers.
 * It is a same-origin POST carrying the browser's own session cookie, so the
 * page needs no extra transport and the Host applies its usual request fence.
 */

/** Prefix the Host half registers. */
export const CHANNEL = '/dsh-proxy-manager'

/** Failure carried by one call. */
export interface RpcFailure {
  code: string
  message: string
}

/** Success or failure of one endpoint call. */
export type RpcOutcome<T> = { ok: true, value: T } | { ok: false, error: RpcFailure }

/** The request face the page receives. */
export type Request = <T>(endpoint: string, payload?: Record<string, unknown>) => Promise<RpcOutcome<T>>

/** Same-origin fetch, as the browser provides it. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

function failure(message: string, code = 'proxy-manager/transport'): RpcOutcome<never> {
  return { ok: false, error: { code, message } }
}

/**
 * Build a caller bound to one fetch implementation.
 * @param doFetch - same-origin fetch; defaults to the page's global fetch.
 * @returns a typed caller that never throws on transport failure.
 */
export function createRequest(doFetch: FetchLike = (input, init) => globalThis.fetch(input, init)): Request {
  return async <T,>(endpoint: string, payload: Record<string, unknown> = {}): Promise<RpcOutcome<T>> => {
    let response: Response
    try {
      response = await doFetch(`${CHANNEL}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error))
    }
    if (!response.ok) return failure(`transport failure for ${CHANNEL}/${endpoint}: HTTP ${String(response.status)}`)
    try {
      const value: unknown = await response.json()
      if (value === null || typeof value !== 'object') return failure('malformed response')
      return value as RpcOutcome<T>
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'malformed response')
    }
  }
}
