import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { assertRelocatableSymlinks } from '../../../../script/verify-symlinks'

describe('assertRelocatableSymlinks', () => {
  let tempDir: string
  let root: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'verify-symlinks-'))
    root = join(tempDir, 'root')
    await mkdir(join(root, 'sub'), { recursive: true })
    await writeFile(join(root, 'file'), '')
    await writeFile(join(root, 'sub', 'file'), '')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('accepts a relative link to a sibling', async () => {
    await symlink('file', join(root, 'link'))
    assertRelocatableSymlinks(root)
  })

  it('accepts a relative link into a subdirectory', async () => {
    await symlink(join('sub', 'file'), join(root, 'link'))
    assertRelocatableSymlinks(root)
  })

  it('accepts a dangling relative link inside the root', async () => {
    await symlink('missing', join(root, 'sub', 'link'))
    assertRelocatableSymlinks(root)
  })

  it('rejects an absolute link', async () => {
    await symlink(join(root, 'file'), join(root, 'sub', 'link'))
    assert.throws(() => assertRelocatableSymlinks(root), /sub.link ->/)
  })

  it('rejects a relative link escaping the root', async () => {
    await writeFile(join(tempDir, 'outside'), '')
    await symlink(join('..', 'outside'), join(root, 'link'))
    assert.throws(() => assertRelocatableSymlinks(root), /link -> \.\./)
  })

  it('reports a symlinked directory outside the root without traversing it', async () => {
    const outsideDir = join(tempDir, 'outside')
    await mkdir(outsideDir)
    await symlink('/absolute', join(outsideDir, 'nested'))
    await symlink(join('..', 'outside'), join(root, 'dir-link'))

    assert.throws(
      () => assertRelocatableSymlinks(root),
      (err: Error) =>
        err.message.includes('dir-link') && !err.message.includes('nested')
    )
  })
})
