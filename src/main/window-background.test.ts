import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toWindowBackgroundColor } from './window-background'

test('accepts a computed rgb() color', () => {
  assert.equal(toWindowBackgroundColor('rgb(40, 40, 40)'), 'rgb(40, 40, 40)')
})

test('accepts a computed rgba() color', () => {
  assert.equal(toWindowBackgroundColor('rgba(0, 0, 0, 0)'), 'rgba(0, 0, 0, 0)')
  assert.equal(toWindowBackgroundColor('rgba(250, 244, 237, 0.5)'), 'rgba(250, 244, 237, 0.5)')
})

test('rejects hex, because Electron reads 8-digit hex as ARGB, not CSS RGBA', () => {
  assert.equal(toWindowBackgroundColor('#28282880'), null)
  assert.equal(toWindowBackgroundColor('#282828'), null)
})

test('rejects channels outside 0-255 and alpha outside 0-1', () => {
  assert.equal(toWindowBackgroundColor('rgb(300, 0, 0)'), null)
  assert.equal(toWindowBackgroundColor('rgba(0, 0, 0, 1.5)'), null)
})

test('rejects anything that is not a color string', () => {
  assert.equal(toWindowBackgroundColor(undefined), null)
  assert.equal(toWindowBackgroundColor(42), null)
  assert.equal(toWindowBackgroundColor('url(https://example.com/x.png)'), null)
  assert.equal(toWindowBackgroundColor('rgb(1, 2, 3); color: red'), null)
})
