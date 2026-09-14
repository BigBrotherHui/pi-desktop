import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pseudoLocalize } from './pseudo'

test('adds accents, about 35% padding, and brackets', () => {
  assert.equal(pseudoLocalize('Settings'), '[Šéţţîñĝš ~~~]')
})

test('keeps placeholders and tags unchanged', () => {
  assert.equal(pseudoLocalize('Hi {{name}}'), '[Ĥî {{name}} ~~~~]')
  assert.equal(pseudoLocalize('See <link>docs</link>'), '[Šéé <link>ðöçš</link> ~~~~~~~~]')
})

test('leaves digits, punctuation, and non-Latin text as they are', () => {
  assert.equal(pseudoLocalize('3.5%'), '[3.5% ~~]')
})

test('returns an empty string unchanged', () => {
  assert.equal(pseudoLocalize(''), '')
})
