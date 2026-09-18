import type { VoiceModel, VoicePrecision } from '../../../shared/voice-models'
import {
  parakeetFileUrls,
  transformersDtype,
  VOICE_MODEL_BASE_URL,
} from '../../../shared/voice-engine-config'

// Where onnxruntime-web loads its WebAssembly runtime from. The build copies the
// files here and the dev server serves them (see voiceWasmPlugin). Loading them
// locally keeps speech-to-text offline and within the locked CSP.
const WASM_BASE_URL = new URL('voice-wasm/', document.baseURI).href

type TranscribeFn = (audio: Float32Array) => Promise<string>

interface LoadedEngine {
  key: string
  transcribe: TranscribeFn
}

let loaded: LoadedEngine | null = null
let loading: Promise<LoadedEngine> | null = null

// Use WebGPU only when a real adapter is available. `navigator.gpu` can exist
// while requestAdapter() returns null (no usable GPU), and onnxruntime then
// throws with no CPU fallback — so probe the adapter and fall back to WASM.
async function resolveDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu?.requestAdapter) {
      const adapter = await gpu.requestAdapter()
      if (adapter) return 'webgpu'
    }
  } catch {
    // fall through to wasm
  }
  return 'wasm'
}

async function loadTransformers(model: VoiceModel, precision: VoicePrecision): Promise<TranscribeFn> {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = VOICE_MODEL_BASE_URL
  const wasmBackend = env.backends?.onnx?.wasm
  if (wasmBackend) wasmBackend.wasmPaths = WASM_BASE_URL

  const asr = await pipeline('automatic-speech-recognition', model.id, {
    dtype: transformersDtype(precision) as 'q8' | 'fp16',
    device: await resolveDevice(),
  })

  return async (audio: Float32Array) => {
    const output = await asr(audio)
    const result = Array.isArray(output) ? output[0] : output
    return typeof result?.text === 'string' ? result.text.trim() : ''
  }
}

async function loadParakeet(model: VoiceModel, precision: VoicePrecision): Promise<TranscribeFn> {
  const [{ fromUrls }, ort] = await Promise.all([
    import('parakeet.js'),
    import('onnxruntime-web'),
  ])
  ort.env.wasm.wasmPaths = WASM_BASE_URL

  const parakeet = await fromUrls({
    ...parakeetFileUrls(model.id, precision),
    backend: await resolveDevice(),
    preprocessorBackend: 'js',
  })

  return async (audio: Float32Array) => {
    const result = await parakeet.transcribe(audio, 16000, {})
    return typeof result?.utterance_text === 'string' ? result.utterance_text.trim() : ''
  }
}

async function loadEngine(model: VoiceModel, precision: VoicePrecision): Promise<LoadedEngine> {
  const transcribe =
    model.engine === 'parakeet'
      ? await loadParakeet(model, precision)
      : await loadTransformers(model, precision)
  return { key: `${model.id}:${precision}`, transcribe }
}

/**
 * Transcribe mono 16 kHz PCM with the chosen model, loading and caching the
 * engine on first use. Switching model or precision reloads the engine.
 */
export async function transcribeAudio(
  audio: Float32Array,
  model: VoiceModel,
  precision: VoicePrecision,
): Promise<string> {
  const key = `${model.id}:${precision}`
  if (loaded?.key !== key) {
    if (!loading || (await loading).key !== key) {
      loading = loadEngine(model, precision)
    }
    loaded = await loading
  }
  return loaded.transcribe(audio)
}

/** Drop the cached engine, e.g. after the model is removed. */
export function resetVoiceEngine(): void {
  loaded = null
  loading = null
}
