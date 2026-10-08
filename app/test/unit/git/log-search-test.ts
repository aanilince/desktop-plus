import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { git } from '../../../src/lib/git/core'
import { searchCommitShas } from '../../../src/lib/git/log-search'
import { Repository } from '../../../src/models/repository'

const noTerms = { content: null, regex: null, file: null }

async function shasOldestFirst(repository: Repository) {
  const result = await git(
    ['rev-list', '--reverse', 'HEAD'],
    repository.path,
    'test'
  )
  return result.stdout.trim().split('\n')
}

/**
 * c1: add a.txt ("hello")
 * c2: add b.txt ("needle here")
 * c3: change a.txt to "hello world"
 * c4: rename a.txt -> renamed.txt (same contents)
 */
async function setupHistory(
  t: Parameters<typeof setupEmptyRepositoryDefaultMain>[0]
) {
  const repository = await setupEmptyRepositoryDefaultMain(t)
  await makeCommit(repository, {
    entries: [{ path: 'a.txt', contents: 'hello\n' }],
  })
  await makeCommit(repository, {
    entries: [{ path: 'b.txt', contents: 'needle here\n' }],
  })
  await makeCommit(repository, {
    entries: [{ path: 'a.txt', contents: 'hello world\n' }],
  })
  await makeCommit(repository, {
    entries: [
      { path: 'a.txt', contents: null },
      { path: 'renamed.txt', contents: 'hello world\n' },
    ],
  })
  const [c1, c2, c3, c4] = await shasOldestFirst(repository)
  return { repository, c1, c2, c3, c4 }
}

describe('searchCommitShas', () => {
  it('finds commits that add or remove the exact text (-S)', async t => {
    const { repository, c2 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: 'needle' },
      ['HEAD']
    )
    assert.deepEqual([...shas], [c2])
  })

  it('is case-sensitive for content, like git -S', async t => {
    const { repository } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: 'NEEDLE' },
      ['HEAD']
    )
    assert.equal(shas.size, 0)
  })

  it('finds commits whose changed lines match a regex (-G)', async t => {
    const { repository, c1, c2, c3 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, regex: 'hel+o' },
      ['HEAD']
    )
    assert.ok(shas.has(c1))
    assert.ok(shas.has(c3))
    assert.ok(!shas.has(c2))
  })

  it('follows renames for a file history', async t => {
    const { repository, c1, c2, c3, c4 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, file: 'renamed.txt' },
      ['HEAD']
    )
    assert.deepEqual(new Set(shas), new Set([c1, c3, c4]))
    assert.ok(!shas.has(c2))
  })

  it('combines content with a file', async t => {
    const { repository, c3 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: 'hello world', file: 'renamed.txt' },
      ['HEAD']
    )
    assert.deepEqual([...shas], [c3])
  })

  it('intersects content and regex', async t => {
    const { repository, c3 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: 'world', regex: 'hello' },
      ['HEAD']
    )
    assert.deepEqual([...shas], [c3])
  })

  it('treats a file with glob characters as a pathspec', async t => {
    const { repository, c1, c2, c3 } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, file: '*.txt' },
      ['HEAD']
    )
    assert.ok(shas.has(c1) && shas.has(c2) && shas.has(c3))
  })

  it('treats content that looks like an option as text', async t => {
    const { repository } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: '--all' },
      ['HEAD']
    )
    assert.equal(shas.size, 0)
  })

  it('returns an empty set for an invalid regex instead of throwing', async t => {
    const { repository } = await setupHistory(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, regex: '(unclosed' },
      ['HEAD']
    )
    assert.equal(shas.size, 0)
  })

  it('returns an empty set for an unborn HEAD', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const shas = await searchCommitShas(
      repository,
      { ...noTerms, content: 'x' },
      ['HEAD']
    )
    assert.equal(shas.size, 0)
  })
})
