import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-contracts'
import type {
  ModelsFetchResult,
  ModelsRemoteQuery,
  ModelsTestQuery,
  ModelsTestResult,
  RemoteModelInfo,
} from '../../shared/models-config'
import type { IpcContext } from './context'
import { assertTrustedSender, isObject, isString } from './validation'

/**
 * Remote model discovery and connectivity testing for the Custom Models
 * editor. Both handlers talk to an OpenAI-compatible (or Anthropic) HTTP
 * endpoint from the MAIN process — the renderer never fetches cross-origin
 * itself, so provider CORS rules are irrelevant.
 */

const FETCH_TIMEOUT_MS = 15_000
const TEST_TIMEOUT_MS = 45_000
const ERROR_SNIPPET_MAX = 300

/** Auth headers for a request; empty key → anonymous (local gateways). */
function authHeaders(apiKey: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (apiKey && apiKey.trim().length > 0) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}

/**
 * Endpoint candidates for a user-entered base URL. cc-switch style: the user
 * pastes either the API root ("https://host") or an OpenAI base including the
 * version segment ("https://host/v1"). Try the versioned path first, then the
 * bare one; the first response that parses wins.
 */
function endpointCandidates(baseUrl: string, leaf: string): string[] {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (/\/v\d+[a-z-]*$/i.test(base)) return [`${base}/${leaf}`]
  return [`${base}/v1/${leaf}`, `${base}/${leaf}`]
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** Truncated response body for error surfaces — provider errors live here. */
async function errorSnippet(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim()
    return text.length > 0 ? text.slice(0, ERROR_SNIPPET_MAX) : `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

// ─── Capability derivation ───────────────────────────────────────────────────
// The gateway ecosystem varies wildly in what /models advertises. Metadata
// wins when present; otherwise conservative family heuristics fill the gaps.
// Heuristic values are defaults the editor lets the user override.

const REASONING_ID_RE =
  /(^|[-_.])(o[134](-|$)|gpt-5|deepseek-r|deepseek-v4|glm-4\.5|glm-5|qwen3|qwq|kimi-k|thinking|gemini-2\.5|minimax-m|hunt)/i

const VISION_ID_RE =
  /(-vl[-_.)]|(-|_)vl$|vision|multimodal|-omni|gpt-4o|gpt-4\.1|gpt-5|gemini|claude-[3-9]|glm-4v|glm-5v|doubao.*vision|step-1v)/i

/** Family context-window fallbacks, most specific pattern first. */
const CONTEXT_FALLBACKS: Array<[RegExp, number]> = [
  [/gpt-4\.1/, 1_000_000],
  [/gpt-5/, 400_000],
  [/gpt-4o/, 128_000],
  [/o[134](-|$)/, 200_000],
  [/gemini/, 1_000_000],
  [/claude/, 200_000],
  [/deepseek-v4/, 1_000_000],
  [/deepseek/, 128_000],
  [/glm-5/, 1_000_000],
  [/glm/, 200_000],
  [/kimi-k/, 256_000],
  [/qwen3/, 256_000],
  [/minimax/, 1_000_000],
]

function heuristicReasoning(id: string): boolean {
  return REASONING_ID_RE.test(id)
}

function heuristicVision(id: string): boolean {
  return VISION_ID_RE.test(id)
}

function heuristicContextWindow(id: string): number | undefined {
  for (const [re, value] of CONTEXT_FALLBACKS) {
    if (re.test(id)) return value
  }
  return undefined
}

/**
 * Merge advertised metadata with heuristics. Recognised metadata keys cover
 * the shapes seen in the wild: OpenAI-compatible gateways that pass through
 * upstream capability fields (context_length / max_output / images /
 * reasoning) and modality arrays (input_modalities / modalities).
 */
function deriveRemoteModel(raw: unknown): RemoteModelInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const item = raw as Record<string, unknown>
  const id = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : typeof item.model === 'string' && item.model.trim()
      ? item.model.trim()
      : typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : ''
  if (!id) return null

  const info: RemoteModelInfo = { id }

  const contextWindow = pickNumber(item, ['context_length', 'contextWindow', 'max_context_length', 'context_size'])
  info.contextWindow = contextWindow ?? heuristicContextWindow(id)

  const maxOutput = pickNumber(item, ['max_output_tokens', 'max_output', 'output_limit', 'max_tokens'])
  info.maxTokens = maxOutput

  const modalities = pickStringArray(item, ['input_modalities', 'modalities', 'input', 'inputs'])
  if (modalities) {
    info.input = modalities.includes('image') || modalities.includes('multimodal')
      ? ['text', 'image']
      : ['text']
  } else if (pickBool(item, ['images', 'vision', 'supports_vision', 'supports_images']) ?? heuristicVision(id)) {
    info.input = ['text', 'image']
  }

  const reasoning = pickBool(item, ['reasoning', 'supports_reasoning', 'reasoning_model', 'thinking'])
  // Some providers advertise reasoning only as an effort selector string
  // ("reasoning_default_effort": "low") rather than a boolean flag.
  const effort = pickNonEmptyString(item, ['reasoning_default_effort', 'reasoning_effort'])
  info.reasoning = reasoning ?? (effort !== undefined ? true : undefined) ?? heuristicReasoning(id)

  return info
}

function pickNumber(item: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

function pickBool(item: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'boolean') return value
  }
  return undefined
}

function pickNonEmptyString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return undefined
}

function pickStringArray(item: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = item[key]
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      return value as string[]
    }
  }
  return undefined
}

/** Extract the model array from the shapes providers actually return. */
function extractModelList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'object' && payload !== null) {
    const data = (payload as { data?: unknown }).data
    if (Array.isArray(data)) return data
    const models = (payload as { models?: unknown }).models
    if (Array.isArray(models)) return models
  }
  return null
}

async function fetchRemoteModels(query: ModelsRemoteQuery): Promise<ModelsFetchResult> {
  const base = query.baseUrl?.trim() ?? ''
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, error: 'Base URL must start with http:// or https://' }
  }

  let lastError = 'No endpoint responded'
  for (const url of endpointCandidates(base, 'models')) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: 'GET', headers: authHeaders(query.apiKey) },
        FETCH_TIMEOUT_MS,
      )
      if (!res.ok) {
        lastError = `${url.split('//')[1] ?? url}: ${await errorSnippet(res)}`
        continue
      }
      const payload: unknown = await res.json().catch(() => null)
      const list = extractModelList(payload)
      if (!list) {
        lastError = `${url.split('//')[1] ?? url}: unrecognized response shape`
        continue
      }
      const models = list
        .map(deriveRemoteModel)
        .filter((entry): entry is RemoteModelInfo => entry !== null)
      return { ok: true, models, url }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: false, error: lastError }
}

// ─── Connectivity test ───────────────────────────────────────────────────────

/**
 * Send one tiny request to the model. HTTP-level success counts as connected —
 * a reasoning model may spend the whole max_tokens budget thinking and return
 * empty content, which still proves URL, key, and model name all work.
 */
async function testModel(query: ModelsTestQuery): Promise<ModelsTestResult> {
  const base = query.baseUrl?.trim() ?? ''
  const model = query.model?.trim() ?? ''
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, error: 'Base URL must start with http:// or https://' }
  }
  if (!model) return { ok: false, error: 'Model id is required' }
  if (query.api === 'google-generative-ai') {
    return { ok: false, error: 'Connectivity test is not implemented for google-generative-ai' }
  }

  const apiKey = query.apiKey?.trim() ?? ''
  const started = Date.now()
  const attempts: string[] = []

  for (const leaf of query.api === 'openai-responses'
    ? ['responses']
    : query.api === 'anthropic-messages'
      ? ['v1/messages']
      : ['chat/completions']) {
    const urls = endpointCandidates(base, leaf)
    for (const url of urls) {
      const headers = query.api === 'anthropic-messages'
        ? authHeaders(apiKey, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' })
        : authHeaders(apiKey)
      if (query.api === 'anthropic-messages') delete headers.Authorization
      const body = query.api === 'openai-responses'
        ? { model, input: 'ping', max_output_tokens: 8, stream: false }
        : query.api === 'anthropic-messages'
          ? { model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }
          : { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false }
      try {
        const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, TEST_TIMEOUT_MS)
        if (res.ok) return { ok: true, latencyMs: Date.now() - started }
        attempts.push(`${await errorSnippet(res)}`)
      } catch (err) {
        attempts.push(err instanceof Error ? err.message : String(err))
      }
    }
  }
  return { ok: false, error: attempts[0] ?? 'No endpoint responded' }
}

function parseRemoteQuery(value: unknown): ModelsRemoteQuery | null {
  if (!isObject(value) || !isString(value.baseUrl)) return null
  return { baseUrl: value.baseUrl, apiKey: isString(value.apiKey) ? value.apiKey : undefined }
}

function parseTestQuery(value: unknown): ModelsTestQuery | null {
  if (!isObject(value) || !isString(value.baseUrl) || !isString(value.model)) return null
  return {
    baseUrl: value.baseUrl,
    model: value.model,
    apiKey: isString(value.apiKey) ? value.apiKey : undefined,
    api: isString(value.api) ? value.api : undefined,
  }
}

export function registerModelsRemoteHandlers(_ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.MODELS_FETCH_REMOTE, async (event, query: unknown): Promise<ModelsFetchResult> => {
    assertTrustedSender(event)
    const parsed = parseRemoteQuery(query)
    if (!parsed) return { ok: false, error: 'baseUrl is required' }
    return fetchRemoteModels(parsed)
  })

  ipcMain.handle(IPC_CHANNELS.MODELS_TEST, async (event, query: unknown): Promise<ModelsTestResult> => {
    assertTrustedSender(event)
    const parsed = parseTestQuery(query)
    if (!parsed) return { ok: false, error: 'baseUrl and model are required' }
    return testModel(parsed)
  })
}
