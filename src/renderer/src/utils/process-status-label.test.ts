import assert from 'node:assert/strict'
import { test } from 'node:test'
import { t } from '../../../shared/i18n'
import type { PiProcessStatus } from '../../../shared/ipc-contracts'
import { processStatusLabel } from './process-status-label'

test('labels every agent process status', () => {
  const statuses: PiProcessStatus[] = ['running', 'starting', 'error', 'stopped']
  assert.deepEqual(
    statuses.map((status) => processStatusLabel(status, t)),
    ['running', 'starting', 'error', 'stopped']
  )
})
