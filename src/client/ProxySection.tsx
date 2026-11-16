/**
 * The Proxy page inside Settings.
 *
 * All reads and writes go through the plugin's Connection RPC channel; the page
 * holds no state that the Host does not own, so a reload always shows the files
 * as they are on disk.
 */
import * as React from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { matchesQuery, orderTools, pageSlice } from '../host/core/order.ts'
import type { MutationResult, Snapshot, ToolKind, ToolStatus } from '../host/core/types.ts'
import type { SystemProxyReport } from '../host/core/system-proxy.ts'
import type { Request } from './api.ts'
import cssText from './ProxySection.css'
import { cls } from './classes.ts'
import type { ProxyKey } from './locales.ts'

/** Props the slot renderer binds: the dictionary and the injected request. */
export interface ProxySectionProps {
  t: (key: ProxyKey) => string
  request: Request
}

/** Draft of one user-added adapter. */
interface AdapterDraft {
  name: string
  kind: ToolKind
  path: string
  section: string
  key: string
  part: 'url' | 'noProxy' | 'host' | 'port' | 'scheme'
}

const EMPTY_DRAFT: AdapterDraft = { name: '', kind: 'props', path: '', section: '', key: '', part: 'url' }

/** Rows per page. */
const PAGE_SIZE = 10

const KIND_OPTIONS: readonly ToolKind[] = ['ini', 'props', 'yaml', 'toml', 'json', 'env', 'shell', 'xml']

const PART_KEYS: readonly AdapterDraft['part'][] = ['url', 'noProxy', 'host', 'port', 'scheme']

/** The page. */
export function ProxySection({ t, request }: ProxySectionProps) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [url, setUrl] = useState('')
  const [noProxy, setNoProxy] = useState('')
  const [copied, setCopied] = useState<string>()
  const [draft, setDraft] = useState<AdapterDraft>(EMPTY_DRAFT)
  const [addError, setAddError] = useState<string>()
  const [systemNotice, setSystemNotice] = useState<string>()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const seeded = useRef(false)
  const urlId = useId()
  const noProxyId = useId()

  const adopt = useCallback((next: Snapshot, reseed = false) => {
    setSnapshot(next)
    if (!seeded.current || reseed) {
      setUrl(next.settings.url !== '' ? next.settings.url : next.suggested)
      setNoProxy(next.settings.noProxy)
      seeded.current = true
    }
  }, [])

  const run = useCallback(async (endpoint: string, payload?: Record<string, unknown>) => {
    const outcome = await request<Snapshot | MutationResult>(endpoint, payload)
    if (!outcome.ok) {
      setError(outcome.error.message)
      return undefined
    }
    const value = outcome.value
    adopt('results' in value ? value.snapshot : value)
    return value
  }, [adopt, request])

  // A new search always starts at the first page.
  useEffect(() => {
    setPage(1)
  }, [query])

  useEffect(() => {
    void (async () => {
      const outcome = await request<Snapshot>('snapshot')
      if (outcome.ok) adopt(outcome.value)
      else setError(outcome.error.message)
    })()
  }, [adopt, request])

  useEffect(() => {
    if (copied === undefined) return undefined
    const timer = setTimeout(() => { setCopied(undefined) }, 1600)
    return () => { clearTimeout(timer) }
  }, [copied])

  /** Run one button's work with a shared busy lock and error surface. */
  const withBusy = async (key: string, work: () => Promise<void>) => {
    if (busy !== undefined) return
    setBusy(key)
    setError(undefined)
    try {
      await work()
    } finally {
      setBusy(undefined)
    }
  }

  const saveDrafts = async (): Promise<boolean> => {
    if (snapshot !== undefined && url.trim() === snapshot.settings.url && noProxy.trim() === snapshot.settings.noProxy) {
      return true
    }
    const outcome = await request<Snapshot>('saveSettings', { url: url.trim(), noProxy: noProxy.trim() })
    if (!outcome.ok) {
      setError(outcome.error.message)
      return false
    }
    adopt(outcome.value)
    return true
  }

  const change = (ids: string[] | undefined, action: 'apply' | 'clear') => withBusy(action, async () => {
    if (action === 'apply' && !await saveDrafts()) return
    const payload: Record<string, unknown> = ids === undefined ? {} : { tools: ids }
    if (action === 'apply') {
      payload.url = url.trim()
      payload.noProxy = noProxy.trim()
    }
    const value = await run(action, payload)
    if (value !== undefined && 'results' in value) {
      const failed = value.results.filter(result => !result.ok)
      if (failed.length > 0) {
        setError(failed.map(result => `${result.name}: ${result.error ?? ''}`).join('\n'))
      }
    }
  })

  /** Offer the operating system's own proxy, then store it. */
  const useSystemProxy = () => withBusy('system', async () => {
    setSystemNotice(undefined)
    const outcome = await request<SystemProxyReport>('systemProxy')
    if (!outcome.ok) {
      setError(outcome.error.message)
      return
    }
    const detected = outcome.value.proxy
    if (detected === undefined) {
      setSystemNotice(undefined)
      setError(outcome.value.pacUrl === undefined
        ? t('systemProxyMissing')
        : `${t('systemProxyPac')} ${outcome.value.pacUrl}`)
      return
    }
    setUrl(detected.url)
    setNoProxy(detected.noProxy)
    setSystemNotice(`${t('systemProxyFrom')} ${detected.source}`)
    const saved = await request<Snapshot>('saveSettings', { url: detected.url, noProxy: detected.noProxy })
    if (!saved.ok) {
      setError(saved.error.message)
      return
    }
    adopt(saved.value)
  })

  /** Pin or unpin one adapter; the Host stores the order. */
  const togglePin = (tool: ToolStatus, pinned: boolean) => withBusy(`pin-${tool.id}`, async () => {
    await run('pin', { id: tool.id, pinned })
  })

  /** Open one configuration file with the system handler. */
  const openConfig = (tool: ToolStatus) => withBusy(`open-${tool.id}`, async () => {
    const outcome = await request<{ path: string, displayPath: string }>('openConfig', { id: tool.id })
    if (!outcome.ok) setError(`${tool.name}: ${outcome.error.message}`)
  })

  const copyPath = async (tool: ToolStatus) => {
    try {
      await navigator.clipboard.writeText(tool.path)
      setCopied(tool.id)
    } catch {
      setCopied(undefined)
    }
  }

  const addAdapter = () => withBusy('add', async () => {
    setAddError(undefined)
    const spec = {
      id: draft.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''),
      name: draft.name.trim(),
      kind: draft.kind,
      path: draft.path.trim(),
      ...(draft.section.trim() === '' ? {} : { section: draft.section.trim() }),
      fields: [{ key: draft.key.trim(), part: draft.part }],
    }
    if (spec.id === '' || spec.name === '' || spec.path === '' || draft.key.trim() === '') {
      setAddError(t('invalid'))
      return
    }
    const outcome = await request<Snapshot>('addTool', { spec })
    if (!outcome.ok) {
      setAddError(outcome.error.message)
      return
    }
    adopt(outcome.value)
    setDraft(EMPTY_DRAFT)
  })

  const removeAdapter = (tool: ToolStatus) => withBusy(`remove-${tool.id}`, async () => {
    await run('removeTool', { id: tool.id })
  })

  const toggle = (tool: ToolStatus) => {
    void change([tool.id], tool.enabled ? 'clear' : 'apply')
  }

  const pinnedIds = snapshot?.pinned ?? []
  const ordered = snapshot === undefined ? [] : orderTools(snapshot.tools, pinnedIds)
  const filtered = ordered.filter(tool => matchesQuery(tool, query))
  const view = pageSlice(filtered, page, PAGE_SIZE)
  const enabledCount = snapshot?.enabled.length ?? 0
  const total = snapshot?.tools.length ?? 0
  const summary = t('summary').replace('{on}', String(enabledCount)).replace('{total}', String(total))
  const dirty = snapshot !== undefined
    && (url.trim() !== snapshot.settings.url || noProxy.trim() !== snapshot.settings.noProxy)

  return (
    <div className={cls.root}>
      <style>{cssText}</style>
      <h2 className={cls.heading}>{t('title')}</h2>
      <p className={cls.intro}>{t('intro')}</p>

      <section className={cls.card}>
        <div className={cls.field}>
          <label className={cls.label} htmlFor={urlId}>{t('proxyUrl')}</label>
          <input
            id={urlId}
            className={cls.input}
            value={url}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('proxyUrlPlaceholder')}
            onChange={event => { setUrl(event.target.value) }}
          />
          {snapshot !== undefined && snapshot.suggested !== '' && url.trim() === '' ? (
            <span className={cls.suggested}>
              {t('suggested')} <code>{snapshot.suggested}</code>
              <button type="button" className={cls.ghost} onClick={() => { setUrl(snapshot.suggested) }}>
                {t('useSuggested')}
              </button>
            </span>
          ) : null}
          <p className={cls.hint}>{t('proxyUrlHint')}</p>
          <span className={cls.suggested}>
            <button
              type="button"
              className={cls.button}
              disabled={busy !== undefined}
              onClick={() => { void useSystemProxy() }}
            >
              {t('useSystemProxy')}
            </button>
            {systemNotice !== undefined ? <span className={cls.hint}>{systemNotice}</span> : null}
          </span>
        </div>
        <div className={cls.field}>
          <label className={cls.label} htmlFor={noProxyId}>{t('noProxy')}</label>
          <input
            id={noProxyId}
            className={cls.input}
            value={noProxy}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('noProxyPlaceholder')}
            onChange={event => { setNoProxy(event.target.value) }}
          />
          <p className={cls.hint}>{t('noProxyHint')}</p>
        </div>
        <div className={cls.cardFoot}>
          <span className={cls.hint}>{dirty ? t('proxyUrlHint') : t('saved')}</span>
          <button
            type="button"
            className={`${cls.button} ${cls.primary}`}
            disabled={busy !== undefined || !dirty}
            onClick={() => { void withBusy('save', async () => { await saveDrafts() }) }}
          >
            {t('save')}
          </button>
        </div>
      </section>

      <div className={cls.filters}>
        <input
          className={cls.input}
          value={query}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          onChange={event => { setQuery(event.target.value) }}
        />
        {query !== '' ? (
          <button type="button" className={cls.ghost} onClick={() => { setQuery('') }}>
            {t('cancel')}
          </button>
        ) : null}
      </div>

      <div className={cls.toolbar}>
        <button
          type="button"
          className={cls.button}
          disabled={busy !== undefined || total === 0}
          onClick={() => { void change(undefined, 'apply') }}
        >
          {t('applyAll')}
        </button>
        <button
          type="button"
          className={cls.button}
          disabled={busy !== undefined || total === 0}
          onClick={() => { void change(undefined, 'clear') }}
        >
          {t('clearAll')}
        </button>
        <span className={cls.spacer} />
        <span className={cls.summary}>{summary}</span>
        <button
          type="button"
          className={cls.button}
          disabled={busy !== undefined}
          aria-label={t('refresh')}
          title={t('refresh')}
          onClick={() => { void withBusy('refresh', async () => { await run('snapshot') }) }}
        >
          ↻
        </button>
      </div>

      {error !== undefined ? <p className={cls.alert} role="alert">{error}</p> : null}

      {snapshot === undefined ? (
        <p className={cls.loading}>{t('loading')}</p>
      ) : ordered.length === 0 ? (
        <p className={cls.loading}>{t('empty')}</p>
      ) : view.items.length === 0 ? (
        <p className={cls.loading}>{t('noMatch')}</p>
      ) : (
        <ul className={cls.list}>
          {view.items.map(tool => (
            <li key={tool.id} className={cls.row}>
              <div className={cls.rowMain}>
                <div className={cls.rowHead}>
                  <span className={cls.name}>{tool.name}</span>
                  {pinnedIds.includes(tool.id) ? <span className={cls.tag}>{t('pinned')}</span> : null}
                  {tool.custom === true ? <span className={cls.tag}>{t('custom')}</span> : null}
                  {tool.installed === false ? <span className={`${cls.tag} ${cls.tagWarn}`}>{t('notInstalled')}</span> : null}
                  {tool.exists === false ? <span className={cls.tag}>{t('missingFile')}</span> : null}
                </div>
                <span className={cls.status} data-on={tool.enabled}>
                  <span className={cls.dot} aria-hidden="true" />
                  {tool.enabled ? tool.url ?? t('on') : t('off')}
                </span>
                <span className={cls.pathRow}>
                  <span>{t('configPath')}</span>
                  <code className={cls.path}>{tool.displayPath}</code>
                  <button type="button" className={cls.ghost} onClick={() => { void copyPath(tool) }}>
                    {copied === tool.id ? t('copied') : t('copy')}
                  </button>
                  <button
                    type="button"
                    className={cls.ghost}
                    title={tool.exists === false ? t('missingFile') : t('openHint')}
                    disabled={busy !== undefined || tool.exists === false}
                    onClick={() => { void openConfig(tool) }}
                  >
                    {t('open')}
                  </button>
                </span>
                {tool.note !== undefined ? <p className={cls.note}>{t('note')}: {tool.note}</p> : null}
                {tool.error !== undefined ? <p className={cls.error}>{tool.error}</p> : null}
              </div>
              <div className={cls.rowActions}>
                <button
                  type="button"
                  className={cls.ghost}
                  aria-pressed={pinnedIds.includes(tool.id)}
                  title={pinnedIds.includes(tool.id) ? t('unpin') : t('pin')}
                  disabled={busy !== undefined}
                  onClick={() => { void togglePin(tool, !pinnedIds.includes(tool.id)) }}
                >
                  {pinnedIds.includes(tool.id) ? '★' : '☆'}
                </button>
                {tool.custom === true ? (
                  <button
                    type="button"
                    className={cls.ghost}
                    disabled={busy !== undefined}
                    onClick={() => { void removeAdapter(tool) }}
                  >
                    {t('remove')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cls.switch}
                  role="switch"
                  aria-checked={tool.enabled}
                  aria-label={`${tool.name}: ${tool.enabled ? t('on') : t('off')}`}
                  data-on={tool.enabled}
                  disabled={busy !== undefined || tool.error !== undefined}
                  onClick={() => { toggle(tool) }}
                >
                  <span className={cls.thumb} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > PAGE_SIZE ? (
        <div className={cls.pager}>
          <button
            type="button"
            className={cls.button}
            disabled={view.page <= 1}
            aria-label={t('previous')}
            onClick={() => { setPage(view.page - 1) }}
          >
            ‹
          </button>
          <span className={cls.summary}>
            {t('page').replace('{page}', String(view.page)).replace('{pages}', String(view.pages))}
            {' · '}
            {t('pageTotal').replace('{total}', String(view.total))}
          </span>
          <button
            type="button"
            className={cls.button}
            disabled={view.page >= view.pages}
            aria-label={t('next')}
            onClick={() => { setPage(view.page + 1) }}
          >
            ›
          </button>
        </div>
      ) : null}

      <details className={cls.addBlock}>
        <summary className={cls.addSummary}>{t('addTool')}</summary>
        <p className={cls.hint}>{t('addToolIntro')}</p>
        <div className={cls.addForm}>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-name">{t('fieldName')}</label>
            <input
              id="pm-draft-name"
              className={cls.input}
              value={draft.name}
              onChange={event => { setDraft({ ...draft, name: event.target.value }) }}
              placeholder="Maven"
            />
          </div>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-kind">{t('fieldKind')}</label>
            <select
              id="pm-draft-kind"
              className={cls.select}
              value={draft.kind}
              onChange={event => { setDraft({ ...draft, kind: event.target.value as ToolKind }) }}
            >
              {KIND_OPTIONS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </div>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-path">{t('fieldPath')}</label>
            <input
              id="pm-draft-path"
              className={cls.input}
              value={draft.path}
              spellCheck={false}
              onChange={event => { setDraft({ ...draft, path: event.target.value }) }}
              placeholder="~/.m2/settings.xml"
            />
          </div>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-section">{t('fieldSection')}</label>
            <input
              id="pm-draft-section"
              className={cls.input}
              value={draft.section}
              spellCheck={false}
              onChange={event => { setDraft({ ...draft, section: event.target.value }) }}
              placeholder="http"
            />
          </div>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-key">{t('fieldKey')}</label>
            <input
              id="pm-draft-key"
              className={cls.input}
              value={draft.key}
              spellCheck={false}
              onChange={event => { setDraft({ ...draft, key: event.target.value }) }}
              placeholder="proxy"
            />
          </div>
          <div className={cls.field}>
            <label className={cls.label} htmlFor="pm-draft-part">{t('fieldPart')}</label>
            <select
              id="pm-draft-part"
              className={cls.select}
              value={draft.part}
              onChange={event => { setDraft({ ...draft, part: event.target.value as AdapterDraft['part'] }) }}
            >
              {PART_KEYS.map(part => (
                <option key={part} value={part}>{t(`part${part.charAt(0).toUpperCase()}${part.slice(1)}` as ProxyKey)}</option>
              ))}
            </select>
          </div>
          <div className={cls.addActions}>
            <button
              type="button"
              className={cls.button}
              disabled={busy !== undefined}
              onClick={() => { void addAdapter() }}
            >
              {t('add')}
            </button>
            <button
              type="button"
              className={cls.button}
              onClick={() => { setDraft(EMPTY_DRAFT); setAddError(undefined) }}
            >
              {t('cancel')}
            </button>
            {addError !== undefined ? <p className={cls.error} role="alert">{addError}</p> : null}
          </div>
        </div>
      </details>

      <p className={cls.footer}>{t('restartHint')}</p>
    </div>
  )
}
