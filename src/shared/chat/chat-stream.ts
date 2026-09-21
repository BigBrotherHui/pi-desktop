import type {
  PiMessageUpdateEvent,
  PiToolExecutionEndEvent,
  PiToolExecutionStartEvent,
  PiToolExecutionUpdateEvent,
} from '../ipc-contracts'
import { t } from '../i18n'
import type { DisplayMessage } from './message-parsing'
import {
  aggregateSubagentDetails,
  isSubagentTool,
  subagentAgentName,
  subagentTaskText,
  type SubagentProgress,
} from './subagent-progress'

/** Longest caption kept for a subagent progress row. */
const SUBAGENT_TASK_PREVIEW_CHARS = 120

// Pi reports a generic abort with exactly this text; anything else on an
// aborted turn is a specific reason worth showing (mirrors Pi's own TUI). Not
// translated: it is compared against Pi's own (English) output, never shown.
const GENERIC_ABORT_MESSAGE = 'Request was aborted'

export interface StreamingToolCall {
  name: string
  args: string
  result?: string
  isExecuting: boolean
  isError?: boolean
  startedAt?: number
  durationMs?: number
}

/** The part of a chat client's state that Pi's event stream builds up. */
export interface ChatStreamState {
  messages: DisplayMessage[]
  streamingContent: string
  streamingThinking: string
  streamingToolCalls: Map<string, StreamingToolCall>
  subagentProgress: SubagentProgress[]
}

/** Time and ids are injected so the assembly is pure and runs under node:test. */
export interface ChatStreamClock {
  now(): number
  generateId(): string
}

/** The model a client has selected, used when Pi's message names none. */
export interface ActiveModel {
  id?: string
  provider?: string
}

export function emptyChatStreamState(): ChatStreamState {
  return {
    messages: [],
    streamingContent: '',
    streamingThinking: '',
    streamingToolCalls: new Map(),
    subagentProgress: [],
  }
}

/**
 * Every function below takes the current state and one Pi event and returns
 * only the fields that change, so a Zustand `set` callback or a plain object
 * merge can apply it. None of them changes the state it is given.
 */
export function applyMessageUpdate(
  state: ChatStreamState,
  event: PiMessageUpdateEvent,
  clock: ChatStreamClock,
): Partial<ChatStreamState> {
  const { assistantMessageEvent } = event

  switch (assistantMessageEvent.type) {
    case 'text_delta':
      return { streamingContent: state.streamingContent + (assistantMessageEvent.delta ?? '') }

    case 'thinking_delta':
      return { streamingThinking: state.streamingThinking + (assistantMessageEvent.delta ?? '') }

    case 'toolcall_start': {
      const toolCall = assistantMessageEvent.toolCall
      if (!toolCall) return {}
      const newMap = new Map(state.streamingToolCalls)
      newMap.set(String(toolCall.id ?? ''), {
        name: String(toolCall.name ?? 'unknown'),
        args: '',
        isExecuting: true,
        startedAt: clock.now(),
      })
      return { streamingToolCalls: newMap }
    }

    case 'toolcall_delta': {
      const toolCall = assistantMessageEvent.toolCall
      if (!toolCall?.id) return {}
      const newMap = new Map(state.streamingToolCalls)
      const existing = newMap.get(String(toolCall.id))
      if (existing) {
        newMap.set(String(toolCall.id), {
          ...existing,
          args: existing.args + (assistantMessageEvent.delta ?? ''),
        })
      }
      return { streamingToolCalls: newMap }
    }

    case 'toolcall_end': {
      const toolCall = assistantMessageEvent.toolCall
      if (!toolCall?.id) return {}
      const newMap = new Map(state.streamingToolCalls)
      const existing = newMap.get(String(toolCall.id))
      if (existing) {
        newMap.set(String(toolCall.id), {
          ...existing,
          isExecuting: false,
          args: JSON.stringify(toolCall.arguments ?? existing.args),
          durationMs: existing.startedAt ? clock.now() - existing.startedAt : undefined,
        })
      }
      return { streamingToolCalls: newMap }
    }

    // text_end and thinking_end: the content is finalized in message_end.
    default:
      return {}
  }
}

/**
 * Error text to surface in chat for a finished assistant message, or null.
 * A provider that rejects before streaming (e.g. HTTP 402) yields an
 * assistant message with stopReason 'error', empty content, and the provider
 * error in errorMessage — without this, the chat shows nothing at all.
 */
export function turnErrorText(message?: Record<string, unknown>): string | null {
  if (!message || message.role !== 'assistant') return null
  const errorMessage = typeof message.errorMessage === 'string' ? message.errorMessage : ''
  if (message.stopReason === 'error') return errorMessage || t('store.messages.unknownError')
  if (message.stopReason === 'aborted' && errorMessage && errorMessage !== GENERIC_ABORT_MESSAGE) {
    return errorMessage
  }
  return null
}

/** Commit the stream buffers as an assistant message and clear them. */
export function applyTurnComplete(
  state: ChatStreamState,
  message: Record<string, unknown> | undefined,
  activeModel: ActiveModel | null | undefined,
  clock: ChatStreamClock,
): Partial<ChatStreamState> {
  const newMessages = [...state.messages]

  if (state.streamingContent || state.streamingThinking || state.streamingToolCalls.size > 0) {
    const entries = Array.from(state.streamingToolCalls.entries())
    const toolCalls = entries.map(([id, tc]) => ({
      id,
      name: tc.name,
      arguments: tc.args,
      result: tc.result,
      isError: tc.isError,
      isExecuting: false,
      durationMs: tc.durationMs,
    }))

    // Prefer the model/provider Pi records on this specific message (the
    // authoritative source, robust to mid-turn model switches); fall back to
    // the currently-selected model when the event omits them.
    const model = typeof message?.model === 'string' ? message.model : activeModel?.id
    const provider = typeof message?.provider === 'string' ? message.provider : activeModel?.provider
    newMessages.push({
      id: clock.generateId(),
      role: 'assistant',
      content: state.streamingContent,
      timestamp: clock.now(),
      thinking: state.streamingThinking || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model,
      provider,
    })

    for (const [id, tc] of entries) {
      if (!tc.result) continue
      newMessages.push({
        id: `${id}-result`,
        role: 'toolResult',
        content: tc.result,
        timestamp: clock.now(),
        toolCallId: id,
        toolName: tc.name,
      })
    }
  }

  return {
    messages: newMessages,
    streamingContent: '',
    streamingThinking: '',
    streamingToolCalls: new Map(),
    subagentProgress: [],
  }
}

export function applyToolStart(
  state: ChatStreamState,
  event: PiToolExecutionStartEvent,
  clock: ChatStreamClock,
): Partial<ChatStreamState> {
  const newMap = new Map(state.streamingToolCalls)
  newMap.set(event.toolCallId, {
    name: event.toolName,
    args: JSON.stringify(event.args),
    isExecuting: true,
    startedAt: clock.now(),
  })
  if (!isSubagentTool(event.toolName)) return { streamingToolCalls: newMap }

  const newProgress: SubagentProgress = {
    toolCallId: event.toolCallId,
    agent: subagentAgentName(event.args),
    status: 'running',
    task: subagentTaskText(event.args).slice(0, SUBAGENT_TASK_PREVIEW_CHARS),
    toolCount: 0,
    tokens: 0,
    durationMs: 0,
  }
  return {
    streamingToolCalls: newMap,
    subagentProgress: [...state.subagentProgress, newProgress],
  }
}

function resultText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

export function applyToolUpdate(
  state: ChatStreamState,
  event: PiToolExecutionUpdateEvent,
): Partial<ChatStreamState> {
  const text = resultText(event.partialResult.content)

  const newMap = new Map(state.streamingToolCalls)
  const existing = newMap.get(event.toolCallId)
  if (existing) {
    newMap.set(event.toolCallId, {
      ...existing,
      result: text || existing.result,
    })
  }

  if (isSubagentTool(event.toolName)) {
    const details = event.partialResult.details as Record<string, unknown> | undefined
    const progressList = details?.progress as Array<Record<string, unknown>> | undefined
    const results = details?.results as Array<Record<string, unknown>> | undefined
    if (progressList || results) {
      const newProgress = state.subagentProgress.map((p) => {
        if (p.toolCallId !== event.toolCallId) return p
        return {
          ...p,
          ...aggregateSubagentDetails(p, progressList, results),
        }
      })
      return { streamingToolCalls: newMap, subagentProgress: newProgress }
    }
  }

  return { streamingToolCalls: newMap }
}

export function applyToolEnd(
  state: ChatStreamState,
  event: PiToolExecutionEndEvent,
  clock: ChatStreamClock,
): Partial<ChatStreamState> {
  const text = resultText(event.result.content)

  const newMap = new Map(state.streamingToolCalls)
  const existing = newMap.get(event.toolCallId)
  if (existing) {
    newMap.set(event.toolCallId, {
      ...existing,
      isExecuting: false,
      isError: event.isError,
      result: text || existing.result,
      durationMs: existing.startedAt ? clock.now() - existing.startedAt : existing.durationMs,
    })
  }

  // Finalize subagent progress: mark done and capture final stats
  const newProgress = state.subagentProgress.map((p) => {
    if (p.toolCallId !== event.toolCallId) return p
    const details = isSubagentTool(event.toolName)
      ? (event.result.details as Record<string, unknown> | undefined)
      : undefined
    const progressList = details?.progress as Array<Record<string, unknown>> | undefined
    const results = details?.results as Array<Record<string, unknown>> | undefined
    const agg = aggregateSubagentDetails(p, progressList, results)
    const elapsed =
      agg.durationMs ||
      (p.durationMs > 0 ? p.durationMs : existing?.startedAt ? clock.now() - existing.startedAt : 0)

    return {
      ...p,
      ...agg,
      status: event.isError ? 'error' : 'done',
      durationMs: elapsed,
      currentTool: undefined,
    }
  })

  return { streamingToolCalls: newMap, subagentProgress: newProgress }
}
