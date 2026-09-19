import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceModel } from '../../../shared/voice-models'
import type { VoiceStatus } from '../../../shared/ipc-contracts'
import { useAppStore } from '../store'
import { VoiceRecorder } from './voice-recorder'
import { transcribeAudio } from './voice-transcriber'

export type VoicePhase = 'idle' | 'recording' | 'transcribing'

// Live-dictation tuning.
const TICK_MS = 250 // how often we check level and consider an interim pass
const INTERIM_EVERY_MS = 1400 // minimum gap between running-transcript updates
const SILENCE_LEVEL = 0.008 // RMS below this counts as silence
const SILENCE_HOLD_MS = 8000 // stop after this much silence following speech
const MAX_RECORDING_MS = 60000 // hard cap so a stuck mic can't run forever

export interface VoiceDictationHandlers {
  /** Recording started: mark the composer insertion point. */
  onStart: () => void
  /** Running transcript so far, replacing the previous interim text. */
  onInterim: (text: string) => void
  /** Final transcript once recording stops. */
  onFinal: (text: string) => void
}

export interface VoiceDictation {
  phase: VoicePhase
  ready: boolean
  model: VoiceModel | undefined
  error: string | null
  toggle: () => void
}

/**
 * Drives the microphone button. While recording it re-transcribes the audio so
 * far every ~1.4s and reports a running transcript; it auto-stops after a short
 * silence, and finalizes with one full-clip transcription. It never sends.
 */
export function useVoiceDictation(handlers: VoiceDictationHandlers): VoiceDictation {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const currentView = useAppStore((s) => s.currentView)

  const recorderRef = useRef<VoiceRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const busyRef = useRef(false)
  const stoppedRef = useRef(false)
  const lastTextRef = useRef('')
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const model = status?.catalog.find((entry) => entry.id === status.selectedModel)
  const installed = Boolean(
    status?.selectedModel && status.installed.some((m) => m.id === status.selectedModel),
  )
  const ready = Boolean(model && installed)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimer()
      recorderRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    let active = true
    void window.piDesktop.voice.status().then((next) => {
      if (active) setStatus(next)
    })
    return () => {
      active = false
    }
  }, [currentView])

  const finalize = useCallback(async () => {
    if (stoppedRef.current) return
    stoppedRef.current = true
    clearTimer()
    const recorder = recorderRef.current
    recorderRef.current = null
    if (!recorder || !model || !status) {
      setPhase('idle')
      return
    }
    setPhase('transcribing')
    try {
      // Let an in-flight interim pass finish so two inferences never overlap.
      for (let i = 0; i < 40 && busyRef.current; i++) {
        await new Promise((r) => setTimeout(r, 100))
      }
      const pcm = await recorder.stop()
      const full = pcm.length > 0 ? await transcribeAudio(pcm, model, status.selectedPrecision) : ''
      // Prefer the full-clip result; fall back to the best interim so a blank
      // final pass never wipes text that was already recognized.
      const text = full.trim() || lastTextRef.current
      handlersRef.current.onFinal(text)
    } catch (err) {
      console.error('[voice] transcription failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('idle')
    }
  }, [model, status])

  const startRecording = useCallback(async () => {
    if (!model || !status || !ready) return
    setError(null)
    stoppedRef.current = false
    busyRef.current = false
    lastTextRef.current = ''
    try {
      const recorder = new VoiceRecorder()
      await recorder.start()
      recorderRef.current = recorder
      handlersRef.current.onStart()
      setPhase('recording')

      const startedAt = Date.now()
      let lastVoiceAt = startedAt
      let lastInterimAt = 0
      let sawSpeech = false

      timerRef.current = setInterval(() => {
        if (stoppedRef.current) return
        const now = Date.now()
        if (recorder.getLevel() >= SILENCE_LEVEL) {
          lastVoiceAt = now
          sawSpeech = true
        }

        if (!busyRef.current && now - lastInterimAt >= INTERIM_EVERY_MS) {
          lastInterimAt = now
          busyRef.current = true
          const pcm = recorder.getPcm16k()
          void transcribeAudio(pcm, model, status.selectedPrecision)
            .then((text) => {
              // Ignore empty passes (e.g. a silent chunk) so they never wipe
              // text already shown.
              if (!stoppedRef.current && text.trim()) {
                lastTextRef.current = text.trim()
                handlersRef.current.onInterim(text.trim())
              }
            })
            .catch(() => {
              /* interim errors are non-fatal; the final pass reports failures */
            })
            .finally(() => {
              busyRef.current = false
            })
        }

        const silentTooLong = sawSpeech && now - lastVoiceAt >= SILENCE_HOLD_MS
        if (silentTooLong || now - startedAt >= MAX_RECORDING_MS) {
          void finalize()
        }
      }, TICK_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }, [model, status, ready, finalize])

  const toggle = useCallback(() => {
    if (phase === 'recording') {
      void finalize()
    } else if (phase === 'idle') {
      void startRecording()
    }
  }, [phase, finalize, startRecording])

  return { phase, ready, model, error, toggle }
}
