import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pseudoLocalize, pseudoLocalizeTree } from './pseudo'

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

test('pseudoLocalizeTree pseudo-localizes every string leaf', () => {
  const tree = {
    settings: { title: 'Settings' },
    count_one: '{{count}} item',
    count_other: '{{count}} items',
  }
  const result = pseudoLocalizeTree(tree)
  assert.equal(result.settings.title, pseudoLocalize('Settings'))
  assert.equal(result.count_one, pseudoLocalize('{{count}} item'))
  assert.equal(result.count_other, pseudoLocalize('{{count}} items'))
})

test('pseudoLocalizeTree keeps keys, including plural suffixes, unchanged', () => {
  const tree = { count_one: 'a', count_other: 'b', nested: { label: 'c' } }
  const result = pseudoLocalizeTree(tree)
  assert.deepEqual(Object.keys(result), Object.keys(tree))
  assert.deepEqual(Object.keys(result.nested), Object.keys(tree.nested))
})
