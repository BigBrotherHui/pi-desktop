import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, mkdir, readFile, symlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildNewFileDiff,
  describeGitError,
  FileService,
  isBenignGitError,
  isIgnoredDirName,
  isPathInsideWorkspace,
} from './file-service'
import type { FileChangeEvent } from '../shared/ipc-contracts'

// ─── Path-boundary guard ──────────────────────────────────────────────────

test('isPathInsideWorkspace allows in-workspace relative and absolute paths', () => {
  assert.equal(isPathInsideWorkspace('/work', 'src/a.ts'), true)
  assert.equal(isPathInsideWorkspace('/work', '/work/src/a.ts'), true)
})

test('isPathInsideWorkspace rejects traversal and outside-absolute paths', () => {
  assert.equal(isPathInsideWorkspace('/work', '../secret'), false)
  assert.equal(isPathInsideWorkspace('/work', 'src/../../secret'), false)
  assert.equal(isPathInsideWorkspace('/work', '/etc/passwd'), false)
  assert.equal(isPathInsideWorkspace('/work', '/work'), false) // the root itself
})

test('readFileContent reads inside the workspace but refuses traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-fs-read-'))
  await writeFile(join(dir, 'ok.txt'), 'inside')
  const service = new FileService(dir)
  assert.equal(await service.readFileContent('ok.txt'), 'inside')
  await assert.rejects(() => service.readFileContent('../../../etc/passwd'), /outside the active workspace/)
  await assert.rejects(() => service.readFileContent('/etc/passwd'), /outside the active workspace/)
})

test('writeFileContent writes inside the workspace but refuses traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-fs-write-'))
  const service = new FileService(dir)
  await service.writeFileContent('out.txt', 'data')
  assert.equal(await readFile(join(dir, 'out.txt'), 'utf-8'), 'data')
  await assert.rejects(() => service.writeFileContent('../escape.txt', 'x'), /outside the active workspace/)
})

const diff = buildNewFileDiff('TEST.md', '# Test\n\nHello\n')

assert.equal(
  diff,
  [
    'diff --git a/TEST.md b/TEST.md',
    'new file mode 100644',
    'index 0000000..0000000',
    '--- /dev/null',
    '+++ b/TEST.md',
    '@@ -0,0 +1,3 @@',
    '+# Test',
    '+',
    '+Hello',
    '',
  ].join('\n')
)

// ─── startWatching ────────────────────────────────────────────────────────

function waitForChange(timeoutMs: number): {
  promise: Promise<FileChangeEvent[]>
  onChange: (event: FileChangeEvent) => void
} {
  const events: FileChangeEvent[] = []
  let resolve!: (value: FileChangeEvent[]) => void
  const promise = new Promise<FileChangeEvent[]>((res) => {
    resolve = res
  })
  const onChange = (event: FileChangeEvent): void => {
    events.push(event)
    resolve(events)
  }
  setTimeout(() => resolve(events), timeoutMs)
  return { promise, onChange }
}

async function testWatcherEmitsOnChange(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-fs-watch-'))
  const service = new FileService(dir)
  const { promise, onChange } = waitForChange(3000)

  service.startWatching(onChange)
  // Give chokidar a moment to finish its initial scan before mutating.
  await new Promise((r) => setTimeout(r, 300))
  await writeFile(join(dir, 'hello.txt'), 'hi')

  const events = await promise
  service.stopWatching()

  assert.ok(events.length > 0, 'expected at least one debounced file-change event')
  assert.equal(events[events.length - 1].relativePath, 'hello.txt')
}

async function testWatcherIgnoresHeavyDirs(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-fs-ignore-'))
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  const service = new FileService(dir)
  const { promise, onChange } = waitForChange(1500)

  service.startWatching(onChange)
  await new Promise((r) => setTimeout(r, 300))
  await writeFile(join(dir, 'node_modules', 'ignored.js'), 'x')

  const events = await promise
  service.stopWatching()

  assert.equal(events.length, 0, 'changes under node_modules must not emit events')
}

async function testWatcherDoesNotFollowSymlinks(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pi-fs-symlink-'))
  const target = await mkdtemp(join(tmpdir(), 'pi-fs-symlink-target-'))
  await symlink(target, join(dir, 'alias'), 'dir')
  const service = new FileService(dir)
  const { promise, onChange } = waitForChange(1500)

  service.startWatching(onChange)
  await new Promise((r) => setTimeout(r, 300))
  await writeFile(join(target, 'inside-target.txt'), 'x')

  const events = await promise
  service.stopWatching()

  const reported = events.map((event) => event.relativePath)
  assert.ok(
    reported.every((path) => !path.includes('inside-target.txt')),
    `files behind a symlinked directory must not be reported, got: ${reported.join(', ')}`
  )
}

test('watcher emits a debounced change event', testWatcherEmitsOnChange)
test('watcher ignores heavy dirs like node_modules', testWatcherIgnoresHeavyDirs)
test('watcher does not descend into symlinked directories', testWatcherDoesNotFollowSymlinks)

// ─── Ignored directory names ──────────────────────────────────────────────

test('isIgnoredDirName ignores build artifacts on every platform', () => {
  for (const platform of ['linux', 'darwin', 'win32'] as const) {
    assert.equal(isIgnoredDirName('node_modules', platform), true)
    assert.equal(isIgnoredDirName('src', platform), false)
  }
})

test('isIgnoredDirName ignores home-directory tooling stores on every platform', () => {
  for (const platform of ['linux', 'darwin', 'win32'] as const) {
    assert.equal(isIgnoredDirName('.npm', platform), true)
    assert.equal(isIgnoredDirName('.cargo', platform), true)
    assert.equal(isIgnoredDirName('.codex', platform), true)
    assert.equal(isIgnoredDirName('.local', platform), true)
  }
})

test('isIgnoredDirName ignores the macOS Library folder only on darwin', () => {
  assert.equal(isIgnoredDirName('Library', 'darwin'), true)
  assert.equal(isIgnoredDirName('Library', 'linux'), false)
  assert.equal(isIgnoredDirName('Library', 'win32'), false)
})

test('isIgnoredDirName ignores Windows profile folders only on win32', () => {
  assert.equal(isIgnoredDirName('AppData', 'win32'), true)
  assert.equal(isIgnoredDirName('ntuser.dat', 'win32'), true)
  assert.equal(isIgnoredDirName('AppData', 'linux'), false)
  assert.equal(isIgnoredDirName('AppData', 'darwin'), false)
})

// ─── Git error classification ─────────────────────────────────────────────

test('isBenignGitError accepts not-a-repo stderr and missing git binary', () => {
  assert.equal(
    isBenignGitError({ stderr: 'fatal: not a git repository (or any of the parent directories): .git\n' }),
    true,
  )
  assert.equal(isBenignGitError({ code: 'ENOENT', message: 'spawn git ENOENT' }), true)
  assert.equal(isBenignGitError({ message: 'fatal: Not a git repository' }), true)
})

test('isBenignGitError rejects real git failures', () => {
  assert.equal(isBenignGitError({ code: 128, stderr: 'fatal: bad object HEAD\n' }), false)
  assert.equal(isBenignGitError({ killed: true, signal: 'SIGTERM', message: 'timeout' }), false)
  assert.equal(isBenignGitError(null), false)
  assert.equal(isBenignGitError('string error'), false)
})

test('describeGitError prefers the first stderr line over the message', () => {
  assert.equal(
    describeGitError('status', { stderr: 'fatal: bad object HEAD\nmore context\n', message: 'exited 128' }),
    'git status failed: fatal: bad object HEAD',
  )
  assert.equal(describeGitError('diff', { message: 'timed out' }), 'git diff failed: timed out')
})

test('getGitStatus returns empty for a non-repo directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-nonrepo-'))
  const service = new FileService(dir)
  const status = await service.getGitStatus()
  assert.equal(status.size, 0)
})

test('getFileDiff and getStagedDiff return empty for a non-repo directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-nonrepo-'))
  const service = new FileService(dir)
  assert.equal(await service.getFileDiff(), '')
  assert.equal(await service.getStagedDiff(), '')
})
