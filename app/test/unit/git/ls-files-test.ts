import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getTrackedFilePaths } from '../../../src/lib/git/ls-files'

describe('getTrackedFilePaths', () => {
  it('lists the tracked files, unquoted and with forward slashes', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    await mkdir(`${repository.path}/dir`)
    await makeCommit(repository, {
      entries: [
        { path: 'a.txt', contents: 'a' },
        { path: 'dir/b c.txt', contents: 'b' },
        { path: 'dir/ünï.txt', contents: 'u' },
      ],
    })

    const paths = await getTrackedFilePaths(repository)
    assert.deepEqual([...paths].sort(), ['a.txt', 'dir/b c.txt', 'dir/ünï.txt'])
  })

  it('does not list untracked files', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    await makeCommit(repository, {
      entries: [{ path: 'tracked.txt', contents: 'a' }],
    })
    await writeFile(`${repository.path}/untracked.txt`, 'x')

    assert.deepEqual(await getTrackedFilePaths(repository), ['tracked.txt'])
  })

  it('returns an empty list for a repository without commits', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    assert.deepEqual(await getTrackedFilePaths(repository), [])
  })
})
