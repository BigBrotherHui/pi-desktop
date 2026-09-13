import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDialogToggleKey, splitPromptText, type ToggleKeyEvent } from './extension-ui-dialog-helpers'

test('single-line prompt is all heading', () => {
  assert.deepEqual(splitPromptText('Pick one'), { heading: 'Pick one', body: '' })
})

test('pi-ask-user prompt splits into question heading and context body (issue #61)', () => {
  const text = 'Which shape?\n\nContext:\n- 2 params\n- 3 params'
  assert.deepEqual(splitPromptText(text), {
    heading: 'Which shape?',
    body: 'Context:\n- 2 params\n- 3 params',
  })
})

test('surrounding whitespace is trimmed from heading and body', () => {
  assert.deepEqual(splitPromptText('  Title  \n\n  body line  \n'), {
    heading: 'Title',
    body: 'body line',
  })
})

const chord = (overrides: Partial<ToggleKeyEvent>): ToggleKeyEvent => ({
  key: 'o',
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
})

test('Alt+O toggles in either letter case', () => {
  assert.equal(isDialogToggleKey(chord({})), true)
  assert.equal(isDialogToggleKey(chord({ key: 'O' })), true)
})

test('other modifiers or keys do not toggle', () => {
  assert.equal(isDialogToggleKey(chord({ altKey: false })), false)
  assert.equal(isDialogToggleKey(chord({ ctrlKey: true })), false)
  assert.equal(isDialogToggleKey(chord({ metaKey: true })), false)
  assert.equal(isDialogToggleKey(chord({ shiftKey: true })), false)
  assert.equal(isDialogToggleKey(chord({ key: 'p' })), false)
})
