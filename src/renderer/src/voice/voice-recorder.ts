import { resampleLinear, rms, TARGET_SAMPLE_RATE } from '../../../shared/voice-audio'

const CAPTURE_BUFFER_SIZE = 4096

/**
 * Captures microphone audio continuously as raw PCM. Unlike a one-shot
 * recorder, the buffer can be read at any time during recording (getPcm16k)
 * so a running transcript can be produced while the user is still speaking,
 * and getLevel() drives silence-based auto-stop.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private sampleRate = TARGET_SAMPLE_RATE
  private level = 0

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.context = new AudioContext()
    this.sampleRate = this.context.sampleRate
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1)
    this.chunks = []

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(input))
      this.level = rms(input)
    }

    this.source.connect(this.processor)
    // ScriptProcessor only fires while connected to a destination.
    this.processor.connect(this.context.destination)
  }

  /** Current input loudness (0 = silence), for silence detection. */
  getLevel(): number {
    return this.level
  }

  /** All audio captured so far, as mono 16 kHz PCM. Safe to call repeatedly. */
  getPcm16k(): Float32Array {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return resampleLinear(merged, this.sampleRate, TARGET_SAMPLE_RATE)
  }

  /** Stop recording and return the full captured audio as mono 16 kHz PCM. */
  async stop(): Promise<Float32Array> {
    const pcm = this.getPcm16k()
    this.release()
    return pcm
  }

  /** Abort recording and drop the audio. */
  cancel(): void {
    this.release()
  }

  private release(): void {
    this.processor?.disconnect()
    this.source?.disconnect()
    if (this.processor) this.processor.onaudioprocess = null
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close()
    this.processor = null
    this.source = null
    this.stream = null
    this.context = null
    this.level = 0
  }
}
