import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyMessageUpdate,
  applyToolEnd,
  applyToolStart,
  applyToolUpdate,
  applyTurnComplete,
  emptyChatStreamState,
  turnErrorText,
  type ChatStreamClock,
  type ChatStreamState,
} from './chat-stream'
import type {
  PiMessageUpdateEvent,
  PiToolExecutionEndEvent,
  PiToolExecutionStartEvent,
  PiToolExecutionUpdateEvent,
} from '../ipc-contracts'

const START_TIME = 1_000

/** A clock the test moves by hand, with ids that count up. */
function createClock(): ChatStreamClock & { advance(ms: number): void } {
  let time = START_TIME
  let nextId = 1
  return {
    now: () => time,
    generateId: () => `id-${nextId++}`,
    advance: (ms) => {
      time += ms
    },
  }
}

function merge(state: ChatStreamState, patch: Partial<ChatStreamState>): ChatStreamState {
  return { ...state, ...patch }
}

function update(
  type: string,
  fields: Partial<PiMessageUpdateEvent['assistantMessageEvent']> = {},
): PiMessageUpdateEvent {
  return { type: 'message_update', message: {}, assistantMessageEvent: { type, ...fields } }
}

function toolStart(toolCallId: string, toolName: string, args: Record<string, unknown> = {}): PiToolExecutionStartEvent {
  return { type: 'tool_execution_start', toolCallId, toolName, args }
}

function toolUpdate(toolCallId: string, toolName: string, text: string, details: Record<string, unknown> = {}): PiToolExecutionUpdateEvent {
  return {
    type: 'tool_execution_update',
    toolCallId,
    toolName,
    args: {},
    partialResult: { content: [{ type: 'text', text }], details },
  }
}

function toolEnd(toolCallId: string, toolName: string, text: string, isError = false): PiToolExecutionEndEvent {
  return {
    type: 'tool_execution_end',
    toolCallId,
    toolName,
    result: { content: [{ type: 'text', text }], details: {} },
    isError,
  }
}

test('text and thinking deltas append to their buffers', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyMessageUpdate(state, update('text_delta', { delta: 'Hel' }), clock))
  state = merge(state, applyMessageUpdate(state, update('text_delta', { delta: 'lo' }), clock))
  state = merge(state, applyMessageUpdate(state, update('thinking_delta', { delta: 'hmm' }), clock))

  assert.equal(state.streamingContent, 'Hello')
  assert.equal(state.streamingThinking, 'hmm')
})

test('text_end, thinking_end and unknown update types change nothing', () => {
  const clock = createClock()
  const state = emptyChatStreamState()

  assert.deepEqual(applyMessageUpdate(state, update('text_end'), clock), {})
  assert.deepEqual(applyMessageUpdate(state, update('thinking_end'), clock), {})
  assert.deepEqual(applyMessageUpdate(state, update('something_new'), clock), {})
})

test('a streamed tool call builds its arguments and its duration', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyMessageUpdate(state, update('toolcall_start', { toolCall: { id: 'c1', name: 'read' } }), clock))
  assert.deepEqual(state.streamingToolCalls.get('c1'), {
    name: 'read',
    args: '',
    isExecuting: true,
    startedAt: START_TIME,
  })

  state = merge(state, applyMessageUpdate(state, update('toolcall_delta', { toolCall: { id: 'c1' }, delta: '{"pa' }), clock))
  assert.equal(state.streamingToolCalls.get('c1')?.args, '{"pa')

  clock.advance(250)
  state = merge(
    state,
    applyMessageUpdate(state, update('toolcall_end', { toolCall: { id: 'c1', arguments: { path: 'a.ts' } } }), clock),
  )
  assert.deepEqual(state.streamingToolCalls.get('c1'), {
    name: 'read',
    args: '{"path":"a.ts"}',
    isExecuting: false,
    startedAt: START_TIME,
    durationMs: 250,
  })
})

test('a tool call delta or end for an unknown id adds nothing', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyMessageUpdate(state, update('toolcall_delta', { toolCall: { id: 'nope' }, delta: 'x' }), clock))
  state = merge(state, applyMessageUpdate(state, update('toolcall_end', { toolCall: { id: 'nope' } }), clock))

  assert.equal(state.streamingToolCalls.size, 0)
})

test('a tool call start without a toolCall payload changes nothing', () => {
  const clock = createClock()
  assert.deepEqual(applyMessageUpdate(emptyChatStreamState(), update('toolcall_start'), clock), {})
})

test('applyMessageUpdate does not change the map it was given', () => {
  const clock = createClock()
  const state = emptyChatStreamState()
  applyMessageUpdate(state, update('toolcall_start', { toolCall: { id: 'c1', name: 'read' } }), clock)

  assert.equal(state.streamingToolCalls.size, 0)
})

test('turn complete commits the assistant message and one result per finished tool call', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyMessageUpdate(state, update('text_delta', { delta: 'Done.' }), clock))
  state = merge(state, applyMessageUpdate(state, update('thinking_delta', { delta: 'plan' }), clock))
  state = merge(state, applyToolStart(state, toolStart('c1', 'bash', { command: 'ls' }), clock))
  clock.advance(40)
  state = merge(state, applyToolEnd(state, toolEnd('c1', 'bash', 'a.ts'), clock))
  state = merge(state, applyToolStart(state, toolStart('c2', 'read', { path: 'b.ts' }), clock))

  state = merge(state, applyTurnComplete(state, { model: 'm-1', provider: 'p-1' }, { id: 'active', provider: 'other' }, clock))

  assert.deepEqual(state.messages, [
    {
      id: 'id-1',
      role: 'assistant',
      content: 'Done.',
      timestamp: START_TIME + 40,
      thinking: 'plan',
      toolCalls: [
        { id: 'c1', name: 'bash', arguments: '{"command":"ls"}', result: 'a.ts', isError: false, isExecuting: false, durationMs: 40 },
        { id: 'c2', name: 'read', arguments: '{"path":"b.ts"}', result: undefined, isError: undefined, isExecuting: false, durationMs: undefined },
      ],
      model: 'm-1',
      provider: 'p-1',
    },
    { id: 'c1-result', role: 'toolResult', content: 'a.ts', timestamp: START_TIME + 40, toolCallId: 'c1', toolName: 'bash' },
  ])
  assert.equal(state.streamingContent, '')
  assert.equal(state.streamingThinking, '')
  assert.equal(state.streamingToolCalls.size, 0)
  assert.deepEqual(state.subagentProgress, [])
})

test('turn complete falls back to the active model when the message names none', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyMessageUpdate(state, update('text_delta', { delta: 'Hi' }), clock))
  state = merge(state, applyTurnComplete(state, undefined, { id: 'active', provider: 'prov' }, clock))

  assert.equal(state.messages[0].model, 'active')
  assert.equal(state.messages[0].provider, 'prov')
  assert.equal(state.messages[0].thinking, undefined)
  assert.equal(state.messages[0].toolCalls, undefined)
})

test('turn complete with empty buffers commits nothing and keeps old messages', () => {
  const clock = createClock()
  const existing = { id: 'old', role: 'user' as const, content: 'q', timestamp: 1 }
  const state = { ...emptyChatStreamState(), messages: [existing] }

  const patch = applyTurnComplete(state, { model: 'm' }, undefined, clock)

  assert.deepEqual(patch.messages, [existing])
})

test('tool start adds an executing call with its arguments as JSON', () => {
  const clock = createClock()
  const patch = applyToolStart(emptyChatStreamState(), toolStart('c1', 'bash', { command: 'ls' }), clock)

  assert.deepEqual(patch.streamingToolCalls?.get('c1'), {
    name: 'bash',
    args: '{"command":"ls"}',
    isExecuting: true,
    startedAt: START_TIME,
  })
  assert.equal(patch.subagentProgress, undefined)
})

test('tool start for a subagent tool adds a progress row with a cut caption', () => {
  const clock = createClock()
  const longTask = 'x'.repeat(300)
  const patch = applyToolStart(emptyChatStreamState(), toolStart('s1', 'subagent', { agent: 'reviewer', task: longTask }), clock)

  assert.deepEqual(patch.subagentProgress, [
    { toolCallId: 's1', agent: 'reviewer', status: 'running', task: 'x'.repeat(120), toolCount: 0, tokens: 0, durationMs: 0 },
  ])
})

test('tool update sets the partial result and keeps the old one when the new text is empty', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyToolStart(state, toolStart('c1', 'bash'), clock))
  state = merge(state, applyToolUpdate(state, toolUpdate('c1', 'bash', 'line 1')))
  assert.equal(state.streamingToolCalls.get('c1')?.result, 'line 1')

  state = merge(state, applyToolUpdate(state, toolUpdate('c1', 'bash', '')))
  assert.equal(state.streamingToolCalls.get('c1')?.result, 'line 1')
})

test('tool update folds subagent details into the matching progress row', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyToolStart(state, toolStart('s1', 'subagent', { agent: 'reviewer', task: 'check' }), clock))
  state = merge(
    state,
    applyToolUpdate(
      state,
      toolUpdate('s1', 'subagent', '', { progress: [{ status: 'running', toolCount: 3, tokens: 50, durationMs: 900, currentTool: 'read' }] }),
    ),
  )

  assert.equal(state.subagentProgress[0].toolCount, 3)
  assert.equal(state.subagentProgress[0].tokens, 50)
  assert.equal(state.subagentProgress[0].currentTool, 'read')
  assert.equal(state.subagentProgress[0].status, 'running')
})

test('tool end records the result, the error flag and the duration', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyToolStart(state, toolStart('c1', 'bash'), clock))
  clock.advance(75)
  state = merge(state, applyToolEnd(state, toolEnd('c1', 'bash', 'boom', true), clock))

  assert.deepEqual(state.streamingToolCalls.get('c1'), {
    name: 'bash',
    args: '{}',
    isExecuting: false,
    isError: true,
    result: 'boom',
    startedAt: START_TIME,
    durationMs: 75,
  })
})

test('tool end closes the subagent progress row with the elapsed time', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyToolStart(state, toolStart('s1', 'subagent', { agent: 'reviewer', task: 'check' }), clock))
  clock.advance(500)
  state = merge(state, applyToolEnd(state, toolEnd('s1', 'subagent', 'ok'), clock))

  assert.equal(state.subagentProgress[0].status, 'done')
  assert.equal(state.subagentProgress[0].durationMs, 500)
  assert.equal(state.subagentProgress[0].currentTool, undefined)
})

test('tool end marks the subagent progress row as an error on failure', () => {
  const clock = createClock()
  let state = emptyChatStreamState()
  state = merge(state, applyToolStart(state, toolStart('s1', 'task', { agent: 'reviewer' }), clock))
  state = merge(state, applyToolEnd(state, toolEnd('s1', 'task', 'failed', true), clock))

  assert.equal(state.subagentProgress[0].status, 'error')
})

test('turnErrorText reports a provider error, with a fallback text', () => {
  assert.equal(turnErrorText({ role: 'assistant', stopReason: 'error', errorMessage: 'HTTP 402' }), 'HTTP 402')
  const fallback = turnErrorText({ role: 'assistant', stopReason: 'error' })
  assert.equal(typeof fallback, 'string')
  assert.notEqual(fallback, '')
})

test('turnErrorText reports a specific abort reason but not the generic one', () => {
  assert.equal(turnErrorText({ role: 'assistant', stopReason: 'aborted', errorMessage: 'Quota reached' }), 'Quota reached')
  assert.equal(turnErrorText({ role: 'assistant', stopReason: 'aborted', errorMessage: 'Request was aborted' }), null)
  assert.equal(turnErrorText({ role: 'assistant', stopReason: 'aborted' }), null)
})

test('turnErrorText ignores non-assistant and missing messages', () => {
  assert.equal(turnErrorText({ role: 'user', stopReason: 'error', errorMessage: 'x' }), null)
  assert.equal(turnErrorText(undefined), null)
  assert.equal(turnErrorText({ role: 'assistant', stopReason: 'stop' }), null)
})
