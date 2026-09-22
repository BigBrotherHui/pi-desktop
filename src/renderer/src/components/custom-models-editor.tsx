import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Trans, useTranslation } from 'react-i18next'
import { Download, Plus, Trash2, Save, RefreshCw, AlertTriangle, Play, Loader2, Check, Eraser } from 'lucide-react'
import { useAppStore } from '../store'
import { withImageInput } from '../../../shared/models-config'
import type { ModelsConfig, ProviderConfig, CustomModel, RemoteModelInfo } from '../../../shared/models-config'
import { agentEngineLabel, DEFAULT_AGENT_ENGINE_LABEL } from '../../../shared/agent-engine-label'

const API_OPTIONS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
]

interface ProviderRow {
  key: string
  baseUrl: string
  api: string
  apiKey: string
  compat: ProviderConfig['compat']
  models: CustomModel[]
}

/** Per-provider state of the "Fetch models" flow. */
interface FetchState {
  loading: boolean
  error?: string
  items: RemoteModelInfo[]
  selected: Set<string>
  imported?: { added: number; skipped: number }
}

/** Per-model connectivity-test state, keyed by "providerIndex:modelIndex". */
interface TestState {
  loading: boolean
  ok?: boolean
  label: string
}

function configToRows(config: ModelsConfig | null): ProviderRow[] {
  if (!config) return []
  return Object.entries(config.providers ?? {}).map(([key, p]) => ({
    key,
    baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '',
    api: typeof p.api === 'string' ? p.api : '',
    apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    compat: p.compat,
    models: Array.isArray(p.models) ? p.models : [],
  }))
}

function rowsToConfig(rows: ProviderRow[]): ModelsConfig {
  const providers: ModelsConfig['providers'] = {}
  for (const r of rows) {
    providers[r.key.trim()] = {
      ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
      ...(r.api ? { api: r.api } : {}),
      ...(r.apiKey ? { apiKey: r.apiKey } : {}),
      ...(r.compat ? { compat: r.compat } : {}),
      models: r.models,
    }
  }
  return { providers }
}

export function CustomModelsEditor(): React.JSX.Element {
  const { t } = useTranslation()
  const customModels = useAppStore((s) => s.customModels)
  const customModelsError = useAppStore((s) => s.customModelsError)
  const loadCustomModels = useAppStore((s) => s.loadCustomModels)
  const saveCustomModels = useAppStore((s) => s.saveCustomModels)
  const restartPi = useAppStore((s) => s.restartPi)
  const requestConfirm = useAppStore((s) => s.requestConfirm)
  const settings = useAppStore((s) => s.settings)
  // Main resolves which engine and file the editor targets; the labels show
  // exactly that so they can never name a file the save does not touch.
  const modelsFile = useAppStore((s) => s.customModelsFile)
  const engineLabel = agentEngineLabel(modelsFile?.engine ?? null) ?? DEFAULT_AGENT_ENGINE_LABEL
  const modelsFileName = modelsFile?.name ?? t('customModels.defaultFileName')
  const modelsFilePath = modelsFile?.file ?? modelsFileName

  const [rows, setRows] = useState<ProviderRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [fetchStates, setFetchStates] = useState<Record<number, FetchState>>({})
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})

  useEffect(() => {
    loadCustomModels()
  }, [loadCustomModels])

  useEffect(() => {
    setRows(configToRows(customModels))
  }, [customModels])

  const update = (next: ProviderRow[]): void => {
    setRows(next)
    setSaved(false)
  }

  const addProvider = (): void =>
    update([...rows, { key: '', baseUrl: '', api: API_OPTIONS[0], apiKey: '', compat: undefined, models: [] }])

  const removeProvider = (i: number): void => update(rows.filter((_, idx) => idx !== i))

  const patchProvider = (i: number, patch: Partial<ProviderRow>): void =>
    update(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const patchProviderCompat = (i: number, patch: NonNullable<ProviderConfig['compat']>): void =>
    patchProvider(i, { compat: { ...(rows[i].compat ?? {}), ...patch } })

  const addModel = (i: number): void =>
    patchProvider(i, { models: [...rows[i].models, { id: '' }] })

  const patchModel = (pi: number, mi: number, patch: Partial<CustomModel>): void =>
    patchProvider(pi, { models: rows[pi].models.map((m, idx) => (idx === mi ? { ...m, ...patch } : m)) })

  const removeModel = (pi: number, mi: number): void =>
    patchProvider(pi, { models: rows[pi].models.filter((_, idx) => idx !== mi) })

  // ─── Remote model discovery ────────────────────────────────────────────────

  const patchFetch = (pi: number, patch: Partial<FetchState>): void =>
    setFetchStates((prev) => {
      const base: FetchState = { loading: false, items: [], selected: new Set() }
      return { ...prev, [pi]: { ...base, ...prev[pi], ...patch } }
    })

  const handleFetch = async (pi: number): Promise<void> => {
    const row = rows[pi]
    if (!row.baseUrl.trim()) return
    // The most costly misfill: the API key pasted into the provider NAME
    // field (both start with "sk-"). Catch it before the request goes out.
    if (!row.apiKey.trim() && /^sk-[A-Za-z0-9_-]{16,}$/.test(row.key.trim())) {
      patchFetch(pi, { loading: false, error: t('customModels.keyInNameHint') })
      return
    }
    patchFetch(pi, { loading: true, error: undefined, imported: undefined })
    const result = await window.piDesktop.models.fetchRemote({ baseUrl: row.baseUrl, apiKey: row.apiKey })
    if (result.ok) {
      // Align the base URL with the endpoint that actually answered. The agent
      // calls {baseUrl}/chat/completions (or /responses) verbatim, so a base
      // that only worked because fetch probed /v1/models would 404 in chat.
      if (result.url.endsWith('/models')) {
        const working = result.url.slice(0, -'/models'.length)
        const current = row.baseUrl.trim().replace(/\/+$/, '')
        if (working.toLowerCase() !== current.toLowerCase()) {
          patchProvider(pi, { baseUrl: working })
        }
      }
      // Nothing selected by default: the user picks exactly the models they
      // want (existing ids are marked in the list). The header shortcuts cover
      // select-all / invert / none.
      patchFetch(pi, { loading: false, items: result.models, selected: new Set() })
    } else {
      patchFetch(pi, { loading: false, error: result.error })
    }
  }

  const toggleFetched = (pi: number, id: string): void => {
    const state = fetchStates[pi]
    if (!state) return
    const selected = new Set(state.selected)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    patchFetch(pi, { selected, imported: undefined })
  }

  const applySelection = (pi: number, mode: 'all' | 'none' | 'invert'): void => {
    const state = fetchStates[pi]
    if (!state) return
    if (mode === 'none') {
      patchFetch(pi, { selected: new Set() })
      return
    }
    const selected = new Set(
      mode === 'all' ? state.items.map((item) => item.id) : []
    )
    if (mode === 'invert') {
      for (const item of state.items) {
        if (!state.selected.has(item.id)) selected.add(item.id)
      }
    }
    patchFetch(pi, { selected })
  }

  const clearProviderModels = async (pi: number): Promise<void> => {
    const row = rows[pi]
    if (row.models.length === 0) return
    const confirmed = await requestConfirm({
      title: t('customModels.clearConfirmTitle'),
      message: t('customModels.clearConfirmMessage', { count: row.models.length, key: row.key }),
      confirmLabel: t('customModels.clearConfirmLabel'),
      cancelLabel: t('common.cancel'),
      danger: true,
    })
    if (!confirmed) return
    patchProvider(pi, { models: [] })
    setTestStates((prev) => {
      const next: typeof prev = {}
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(`${pi}:`)) next[key] = value
      }
      return next
    })
  }

  const handleImport = (pi: number): void => {
    const state = fetchStates[pi]
    const row = rows[pi]
    if (!state) return
    const existing = new Set(row.models.map((m) => m.id))
    const incoming = state.items.filter((item) => state.selected.has(item.id) && !existing.has(item.id))
    if (incoming.length === 0) return
    const importedModels: CustomModel[] = incoming.map((item) => ({
      id: item.id,
      ...(item.reasoning !== undefined ? { reasoning: item.reasoning } : {}),
      ...(item.input !== undefined ? { input: item.input } : {}),
      ...(item.contextWindow !== undefined ? { contextWindow: item.contextWindow } : {}),
      ...(item.maxTokens !== undefined ? { maxTokens: item.maxTokens } : {}),
    }))
    patchProvider(pi, { models: [...row.models, ...importedModels] })
    patchFetch(pi, {
      imported: { added: importedModels.length, skipped: state.selected.size - importedModels.length },
      items: [],
      selected: new Set(),
    })
  }

  // ─── Connectivity test ─────────────────────────────────────────────────────

  const patchTest = (key: string, patch: Partial<TestState>): void =>
    setTestStates((prev) => {
      const base: TestState = { loading: false, label: '' }
      return { ...prev, [key]: { ...base, ...prev[key], ...patch } }
    })

  const handleTest = async (pi: number, mi: number): Promise<void> => {
    const row = rows[pi]
    const model = row.models[mi]
    if (!row.baseUrl.trim() || !model.id?.trim()) return
    const key = `${pi}:${mi}`
    patchTest(key, { loading: true, label: t('customModels.testing') })
    const result = await window.piDesktop.models.testModel({
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
      api: row.api,
      model: model.id,
    })
    if (result.ok) patchTest(key, { loading: false, ok: true, label: t('customModels.testLatency', { ms: result.latencyMs }) })
    else patchTest(key, { loading: false, ok: false, label: result.error.slice(0, 120) })
  }

  const handleSave = async (): Promise<void> => {
    // Duplicate/empty provider keys collapse in object form, so check here.
    const keys = rows.map((r) => r.key.trim())
    const localErrors: string[] = []
    if (keys.some((k) => k.length === 0)) localErrors.push(t('customModels.errors.emptyKey'))
    if (new Set(keys).size !== keys.length) localErrors.push(t('customModels.errors.duplicateKeys'))
    // Removing the default provider is a legitimate fresh-start move, so it
    // must not block the save — but the agents spawn with that provider until
    // Settings points elsewhere, so warn loudly instead.
    const defaultProvider = settings?.defaultProvider
    if (typeof defaultProvider === 'string' && defaultProvider && !keys.includes(defaultProvider)) {
      localErrors.push(t('customModels.errors.defaultProviderMissing', { key: defaultProvider }))
    }
    const result = await saveCustomModels(rowsToConfig(rows))
    if (result.ok) {
      setErrors(localErrors)
      setWarnings(result.warnings ?? [])
      setSaved(true)
    } else {
      setErrors([...localErrors, ...(result.errors ?? [t('customModels.errors.saveFailed')])])
      setWarnings([])
    }
  }

  if (customModelsError) {
    return (
      <div className="flex items-start gap-2 text-sm text-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p>{t('customModels.loadError.message', { fileName: modelsFileName })}</p>
          <p className="mt-1 text-xs text-dim">{customModelsError}</p>
          <button
            onClick={() => loadCustomModels()}
            className="mt-2 rounded border border-border-strong px-2 py-1 text-xs text-secondary hover:bg-surface-hover"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">
        <Trans
          i18nKey="customModels.description"
          values={{ path: modelsFilePath, engine: engineLabel }}
          components={{ code: <code /> }}
        />
      </p>
      <p className="text-xs text-faint">
        <Trans
          i18nKey="customModels.capabilityHint"
          values={{ engine: engineLabel }}
          components={{ reasoning: <span className="text-muted" />, vision: <span className="text-muted" /> }}
        />
      </p>

      {rows.map((row, pi) => {
        const fetchState = fetchStates[pi]
        const existingIds = new Set(row.models.map((m) => m.id))
        return (
          <div key={pi} className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                value={row.key}
                onChange={(e) => patchProvider(pi, { key: e.target.value })}
                placeholder={t('customModels.providerKeyPlaceholder')}
                className="flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-sm text-primary focus:border-focus focus:outline-none"
                aria-label={t('customModels.nameLabel')}
              />
              <span className="shrink-0 text-[11px] text-faint">{t('customModels.nameLabel')}</span>
              <button
                onClick={() => clearProviderModels(pi)}
                disabled={row.models.length === 0}
                className={clsx(
                  'rounded p-1 text-dim hover:bg-surface-hover hover:text-error',
                  row.models.length === 0 && 'cursor-not-allowed opacity-40'
                )}
                title={t('customModels.clearModelsTitle')}
              >
                <Eraser size={14} />
              </button>
              <button
                onClick={() => removeProvider(pi)}
                className="rounded p-1 text-dim hover:bg-surface-hover hover:text-error"
                title={t('customModels.removeProviderTitle')}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={row.baseUrl}
                onChange={(e) => patchProvider(pi, { baseUrl: e.target.value })}
                placeholder={t('customModels.baseUrlPlaceholder')}
                aria-label={t('customModels.baseUrlLabel')}
                className="rounded border border-border-strong bg-surface px-2 py-1 text-sm text-primary focus:border-focus focus:outline-none"
              />
              <select
                value={row.api}
                onChange={(e) => patchProvider(pi, { api: e.target.value })}
                className="rounded border border-border-strong bg-surface px-2 py-1 text-sm text-primary focus:border-focus focus:outline-none"
              >
                {API_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-dim">
              <input
                type="checkbox"
                checked={row.compat?.supportsReasoningEffort ?? false}
                onChange={(e) => patchProviderCompat(pi, { supportsReasoningEffort: e.target.checked })}
                className="accent-accent"
              />
              {t('customModels.supportsReasoningEffortLabel')}
            </label>
            <input
              value={row.apiKey}
              onChange={(e) => patchProvider(pi, { apiKey: e.target.value })}
              placeholder={t('customModels.apiKeyPlaceholder')}
              aria-label={t('customModels.apiKeyLabel')}
              className="mt-2 w-full rounded border border-border-strong bg-surface px-2 py-1 text-sm text-primary focus:border-focus focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-3 text-[11px] text-faint">
              <span>{t('customModels.baseUrlLabel')}</span>
              <span>{t('customModels.apiKeyLabel')}</span>
            </div>

            {/* Fetch models from the provider and import with derived capabilities. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleFetch(pi)}
                disabled={!row.baseUrl.trim() || (fetchState?.loading ?? false)}
                className={clsx(
                  'flex items-center gap-1.5 rounded border border-border-strong px-2.5 py-1 text-xs',
                  'text-secondary hover:bg-surface-hover transition-colors',
                  (!row.baseUrl.trim() || (fetchState?.loading ?? false)) && 'cursor-not-allowed opacity-50'
                )}
              >
                {fetchState?.loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {fetchState?.loading ? t('customModels.fetching') : t('customModels.fetchModelsButton')}
              </button>
              {fetchState?.error && (
                <span className="min-w-0 flex-1 truncate text-xs text-error" title={fetchState.error}>
                  {t('customModels.fetchFailed', { detail: fetchState.error })}
                </span>
              )}
              {fetchState?.imported && (
                <span className="text-xs text-success">
                  {t('customModels.imported', { added: fetchState.imported.added, skipped: fetchState.imported.skipped })}
                </span>
              )}
            </div>

            {fetchState && fetchState.items.length > 0 && (
              <div className="mt-2 rounded border border-border bg-surface/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-dim">
                      {t('customModels.fetchedCount', { count: fetchState.items.length })}
                    </span>
                    {(['all', 'invert', 'none'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => applySelection(pi, mode)}
                        className="text-[11px] text-muted hover:text-primary"
                      >
                        {mode === 'all'
                          ? t('customModels.selectAll')
                          : mode === 'invert'
                            ? t('customModels.selectInvert')
                            : t('customModels.selectNone')}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleImport(pi)}
                    disabled={fetchState.selected.size === 0}
                    className={clsx(
                      'flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs text-white hover:bg-accent-hover transition-colors',
                      fetchState.selected.size === 0 && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <Check size={11} />
                    {t('customModels.importSelected', { count: fetchState.selected.size })}
                  </button>
                </div>
                <div className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto">
                  {fetchState.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-surface-hover"
                    >
                      <input
                        type="checkbox"
                        checked={fetchState.selected.has(item.id)}
                        onChange={() => toggleFetched(pi, item.id)}
                        className="accent-accent"
                      />
                      <span className="min-w-0 flex-1 truncate text-primary" title={item.id}>{item.id}</span>
                      {existingIds.has(item.id) && (
                        <span className="shrink-0 text-[10px] text-faint">{t('customModels.alreadyInList')}</span>
                      )}
                      {item.reasoning === true && (
                        <span className="shrink-0 text-[10px] text-muted">{t('customModels.reasoningLabel')}</span>
                      )}
                      {item.input?.includes('image') && (
                        <span className="shrink-0 text-[10px] text-muted">{t('customModels.visionLabel')}</span>
                      )}
                      {item.contextWindow !== undefined && (
                        <span className="shrink-0 text-[10px] text-faint">
                          {Math.round(item.contextWindow / 1000)}k
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {row.models.map((model, mi) => {
                const testState = testStates[`${pi}:${mi}`]
                return (
                  <div key={mi} className="rounded border border-border bg-surface/50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={model.id ?? ''}
                        onChange={(e) => patchModel(pi, mi, { id: e.target.value })}
                        placeholder={t('customModels.modelIdPlaceholder')}
                        className="flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-xs text-primary focus:border-focus focus:outline-none"
                      />
                      <input
                        value={model.name ?? ''}
                        onChange={(e) => patchModel(pi, mi, { name: e.target.value })}
                        placeholder={t('customModels.modelNamePlaceholder')}
                        className="flex-1 rounded border border-border-strong bg-surface px-2 py-1 text-xs text-primary focus:border-focus focus:outline-none"
                      />
                      <button
                        onClick={() => handleTest(pi, mi)}
                        disabled={!row.baseUrl.trim() || !model.id?.trim() || (testState?.loading ?? false)}
                        className={clsx(
                          'rounded p-1 text-dim hover:bg-surface-hover hover:text-primary',
                          (!row.baseUrl.trim() || !model.id?.trim() || (testState?.loading ?? false)) && 'cursor-not-allowed opacity-50'
                        )}
                        title={t('customModels.testTitle')}
                      >
                        {testState?.loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      </button>
                      <button
                        onClick={() => removeModel(pi, mi)}
                        className="rounded p-1 text-dim hover:bg-surface-hover hover:text-error"
                        title={t('customModels.removeModelTitle')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {testState && !testState.loading && (
                      <p
                        className={clsx(
                          'mt-1 truncate text-[11px]',
                          testState.ok === true && 'text-success',
                          testState.ok === false && 'text-error'
                        )}
                        title={testState.label}
                      >
                        {testState.label}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-dim">
                        {t('customModels.contextWindowLabel')}
                        <input
                          type="number"
                          value={model.contextWindow ?? ''}
                          onChange={(e) =>
                            patchModel(pi, mi, {
                              contextWindow: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-full rounded border border-border-strong bg-surface px-1 py-0.5 text-xs text-primary focus:border-focus focus:outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-dim">
                        {t('customModels.maxTokensLabel')}
                        <input
                          type="number"
                          value={model.maxTokens ?? ''}
                          onChange={(e) =>
                            patchModel(pi, mi, {
                              maxTokens: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-full rounded border border-border-strong bg-surface px-1 py-0.5 text-xs text-primary focus:border-focus focus:outline-none"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-dim">
                        <input
                          type="checkbox"
                          checked={model.reasoning ?? false}
                          onChange={(e) => patchModel(pi, mi, { reasoning: e.target.checked })}
                          className="accent-accent"
                        />
                        {t('customModels.reasoningLabel')}
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-dim">
                        <input
                          type="checkbox"
                          checked={model.input?.includes('image') ?? false}
                          onChange={(e) =>
                            patchModel(pi, mi, { input: withImageInput(model.input, e.target.checked) })
                          }
                          className="accent-accent"
                        />
                        {t('customModels.visionLabel')}
                      </label>
                    </div>
                  </div>
                )
              })}
              <button
                onClick={() => addModel(pi)}
                className="flex items-center gap-1 text-xs text-muted hover:text-primary"
              >
                <Plus size={12} /> {t('customModels.addModelButton')}
              </button>
            </div>
          </div>
        )
      })}

      <button
        onClick={addProvider}
        className="flex items-center gap-1 text-sm text-muted hover:text-primary"
      >
        <Plus size={14} /> {t('customModels.addProviderButton')}
      </button>

      {errors.length > 0 && (
        <ul className="space-y-1 text-xs text-error">
          {errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-warning">
          {warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
        >
          <Save size={14} />
          {t('customModels.saveButton', { fileName: modelsFileName })}
        </button>
        {saved && (
          <button
            onClick={() => restartPi()}
            className={clsx(
              'flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm',
              'text-secondary hover:bg-surface-hover transition-colors'
            )}
          >
            <RefreshCw size={14} />
            {t('customModels.savedRestartButton', { engine: engineLabel })}
          </button>
        )}
      </div>
    </div>
  )
}
