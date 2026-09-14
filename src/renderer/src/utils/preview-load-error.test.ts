import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toPreviewLoadError } from './preview-load-error'

test('keeps an Error instance message verbatim', () => {
  assert.deepEqual(toPreviewLoadError(new Error('disk full'), 'readFailed'), {
    kind: 'message',
    text: 'disk full',
  })
})

test('falls back to the generic kind for a non-Error value', () => {
  assert.deepEqual(toPreviewLoadError('string failure', 'readFailed'), { kind: 'readFailed' })
  assert.deepEqual(toPreviewLoadError(undefined, 'saveFailed'), { kind: 'saveFailed' })
})
