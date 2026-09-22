import { ipcMain } from 'electron'
import type { AgentEngineKind, ModelsFileInfo, ModelsReadFailure, ModelsReadResult } from '../../shared/ipc-contracts'
import { IPC_CHANNELS } from '../../shared/ipc-contracts'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import {
  describeModelsReadFailure,
  isModelsConfig,
  parseModelsFile,
  resolveModelsFile,
  serializeModelsFile,
  type ModelsFileLocation,
} from '../models-file'
import { activeEngineKind } from './active-engine'
import { appLog } from '../app-log'
import type { PiStartOptions } from '../../shared/ipc-contracts'
import { engineForStartOptions } from './pi-start-options'
import type { IpcContext } from './context'

function modelsFileLocation(engine: AgentEngineKind): ModelsFileLocation {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ''
  return resolveModelsFile(engine, homeDir)
}

function fileInfo(engine: AgentEngineKind, location: ModelsFileLocation): ModelsFileInfo {
  return { engine, file: location.file, name: location.name }
}

function failed(
  location: ModelsFileLocation,
  info: ModelsFileInfo,
  failure: ModelsReadFailure,
  raw: string,
): ModelsReadResult {
  return { error: describeModelsReadFailure(location.name, failure), failure, raw, location: info }
}

export async function readModelsConfigFile(engine: AgentEngineKind): Promise<ModelsReadResult> {
  const location = modelsFileLocation(engine)
  const info = fileInfo(engine, location)
  if (!existsSync(location.file)) return { config: { providers: {} }, location: info }
  let raw: string
  try {
    raw = await readFile(location.file, 'utf-8')
  } catch (err) {
    return failed(location, info, { kind: 'unreadable', detail: err instanceof Error ? err.message : String(err) }, '')
  }
  try {
    const parsed = parseModelsFile(raw, location.format)
    if (!isModelsConfig(parsed)) {
      return failed(location, info, { kind: 'missing-providers' }, raw)
    }
    return { config: parsed, location: info }
  } catch (err) {
    return failed(location, info, {
      kind: 'invalid-syntax',
      format: location.format,
      detail: err instanceof Error ? err.message : String(err),
    }, raw)
  }
}

/**
 * The models file and the saved default model are two sources of truth. A
 * provider removed from the file (editor save or an external rewrite) leaves
 * every spawn holding a dead reference — omp exits with "Unknown provider"
 * before becoming ready. When the requested provider no longer exists, fall
 * back to the first provider that still has a model, so the agent starts on
 * something real instead of dying.
 */
export async function applyKnownProviderFallback(options: PiStartOptions): Promise<PiStartOptions> {
  if (!options.provider) return options
  const engine = engineForStartOptions(options)
  const read = await readModelsConfigFile(engine)
  if (!('config' in read)) return options
  const providers = read.config.providers ?? {}
  const entry = providers[options.provider]
  if (entry && (entry.models ?? []).length > 0) return options
  const firstKey = Object.keys(providers).find((key) => (providers[key].models ?? []).length > 0)
  if (!firstKey) return options
  const firstModel = providers[firstKey].models?.[0]?.id
  appLog.warn(
    'pi',
    `Provider "${options.provider}" is not in the models file; falling back to ${firstKey}/${firstModel ?? '(default)'}`
  )
  return { ...options, provider: firstKey, ...(firstModel ? { model: firstModel } : {}) }
}

export function registerModelsConfigHandlers(ctx: IpcContext): void {
  const { workspaceManager } = ctx

  ipcMain.handle(IPC_CHANNELS.MODELS_READ, async (): Promise<ModelsReadResult> => {
    return readModelsConfigFile(activeEngineKind(workspaceManager))
  })

  ipcMain.handle(IPC_CHANNELS.MODELS_WRITE, async (_event, config: unknown): Promise<{ success: boolean; error?: string }> => {
    if (!isModelsConfig(config)) {
      return { success: false, error: 'Invalid models config' }
    }
    const location = modelsFileLocation(activeEngineKind(workspaceManager))
    try {
      if (!existsSync(location.dir)) await mkdir(location.dir, { recursive: true })
      await writeFile(location.file, serializeModelsFile(config, location.format), 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
