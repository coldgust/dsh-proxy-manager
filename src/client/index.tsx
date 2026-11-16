/**
 * Browser half of dsh-proxy-manager.
 *
 * Registers one Settings page. The page's operations reach the Host through the
 * plugin's own Connection RPC channel, registered by the Host half of the same
 * package, so no name has to be added to the application's Remote assembly.
 */
import * as React from 'react'
import type { ProxyKey } from './locales.ts'
import { createRequest, type Request } from './api.ts'
import { ProxySection } from './ProxySection.tsx'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-proxy-manager'

/** Id of the Settings page, also the id of its navigation icon. */
const SECTION_ID = 'proxy-manager'

/** The slice of the browser context this plugin uses. */
interface ClientContext {
  slots: {
    inject(key: string, callback: () => () => void): void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): (key: ProxyKey) => string
  }
  effect(setup: () => (() => void) | void, label?: string): unknown
}

/** Services this half needs before it can register the page. */
export const inject = ['slots', 'locale']

/** Card icon for the navigation row, drawn from theme-independent geometry. */
function NavIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.25v5.5l3.4 2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Register the page, its dictionary and its navigation icon.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const request: Request = createRequest()

  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'proxy-manager: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: 24,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ request }),
  }, ProxySection))

  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon',
    id: SECTION_ID,
    order: 24,
  }, NavIcon))
}
