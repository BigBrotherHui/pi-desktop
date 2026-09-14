import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { PiRpcEvent } from '../../shared/ipc-contracts'
import { i18n } from '../../shared/i18n'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE } from '../../shared/i18n/languages'

// The store only touches window.piDesktop inside actions; agent_end refreshes
// session stats, so that call is stubbed too.
const piDesktopStub = {
  pi: {
    getStatus: async () => ({ status: 'stopped' as const, pid: null, error: null }),
  },
  session: {
    getStats: async () => null,
  },
}

type AppStore = typeof import('./store')['useAppStore']
let useAppStore: AppStore

before(async () => {
  ;(globalThis as unknown as { window: unknown }).window = { piDesktop: piDesktopStub }
  ;({ useAppStore } = await import('./store'))
})

beforeEach(() => {
  useAppStore.setState({ timelineEvents: [] })
})

function agentRunStatus(): string | undefined {
  return useAppStore.getState().timelineEvents.find((event) => event.kind === 'agent-run')?.status
}

function runOneTurn(): void {
  useAppStore.getState().handlePiEvent({ type: 'agent_start' } as PiRpcEvent)
  assert.equal(agentRunStatus(), 'running')
  useAppStore.getState().handlePiEvent({ type: 'agent_end' } as PiRpcEvent)
  assert.equal(agentRunStatus(), 'success')
}

test('agent_end closes the agent-run entry', () => {
  runOneTurn()
})

test('agent_end closes the agent-run entry in another interface language', async () => {
  await i18n.changeLanguage(PSEUDO_LANGUAGE)
  try {
    runOneTurn()
  } finally {
    await i18n.changeLanguage(SOURCE_LANGUAGE)
  }
})
