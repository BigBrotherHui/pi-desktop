import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNewerVersion } from './version-compare'

test('isNewerVersion compares the numeric core part by part', () => {
  assert.equal(isNewerVersion('0.15.0', '0.14.0'), true)
  assert.equal(isNewerVersion('1.10.0', '1.9.9'), true)
  assert.equal(isNewerVersion('2.0.0', '10.0.0'), false)
})

test('isNewerVersion is false for an equal version', () => {
  assert.equal(isNewerVersion('1.2.3', '1.2.3'), false)
  assert.equal(isNewerVersion('v1.2.3', '1.2.3'), false)
})

test('isNewerVersion ranks a release above its prereleases', () => {
  assert.equal(isNewerVersion('1.0.0', '1.0.0-beta'), true)
  assert.equal(isNewerVersion('1.0.0-beta', '1.0.0'), false)
  assert.equal(isNewerVersion('1.0.0-rc', '1.0.0-alpha'), true)
})

test('isNewerVersion pads a short core with zeros', () => {
  assert.equal(isNewerVersion('1.1', '1.0.9'), true)
  assert.equal(isNewerVersion('1', '1.0.0'), false)
})

test('isNewerVersion compares numeric prerelease identifiers as numbers', () => {
  assert.equal(isNewerVersion('2.0.0-next.12', '2.0.0-next.9'), true)
  assert.equal(isNewerVersion('1.0.0-beta.10', '1.0.0-beta.9'), true)
  assert.equal(isNewerVersion('1.0.0-beta.9', '1.0.0-beta.10'), false)
  assert.equal(isNewerVersion('1.0.0-beta.2', '1.0.0-beta'), true)
  assert.equal(isNewerVersion('1.0.0-alpha.1', '1.0.0-1'), true)
})
