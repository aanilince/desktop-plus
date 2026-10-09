import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupEmptyRepositoryDefaultMain } from '../../helpers/repositories'
import {
  createBranch,
  makeCommit,
  switchTo,
} from '../../helpers/repository-scaffolding'
import { git } from '../../../src/lib/git/core'
import { searchCommitShas } from '../../../src/lib/git/log-search'
import { Repository } from '../../../src/models/repository'

const noTerms = {
  content: null,
  regex: null,
  file: null,
  allBranches: false,
  matchCase: false,
  matchAny: false,
}

/** The commits found for the code searches (content/regex). */
async function findCode(
  ...args: Parameters<typeof searchCommitShas>
): Promise<ReadonlySet<string>> {
  return (await searchCommitShas(...args)).pickaxe ?? new Set()
}

/** The commits found for the file restriction. */
async function findFile(
  ...args: Parameters<typeof searchCommitShas>
): Promise<ReadonlySet<string>> {
  return (await searchCommitShas(...args)).file ?? new Set()
}

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
    const shas = await findCode(repository, { ...noTerms, content: 'needle' }, [
      'HEAD',
    ])
    assert.deepEqual([...shas], [c2])
  })

  it('ignores case for content by default', async t => {
    const { repository, c2 } = await setupHistory(t)
    const shas = await findCode(repository, { ...noTerms, content: 'NEEDLE' }, [
      'HEAD',
    ])
    assert.deepEqual([...shas], [c2])
  })

  it('ignores case for a regex by default', async t => {
    const { repository, c2 } = await setupHistory(t)
    const shas = await findCode(repository, { ...noTerms, regex: 'NEED.E' }, [
      'HEAD',
    ])
    assert.deepEqual([...shas], [c2])
  })

  it('matches case for content when asked to', async t => {
    const { repository, c2 } = await setupHistory(t)
    const terms = { ...noTerms, matchCase: true }
    const wrongCase = await findCode(
      repository,
      { ...terms, content: 'NEEDLE' },
      ['HEAD']
    )
    const rightCase = await findCode(
      repository,
      { ...terms, content: 'needle' },
      ['HEAD']
    )
    assert.equal(wrongCase.size, 0)
    assert.deepEqual([...rightCase], [c2])
  })

  it('matches case for a regex when asked to', async t => {
    const { repository, c2 } = await setupHistory(t)
    const terms = { ...noTerms, matchCase: true }
    const wrongCase = await findCode(
      repository,
      { ...terms, regex: 'NEED.E' },
      ['HEAD']
    )
    const rightCase = await findCode(
      repository,
      { ...terms, regex: 'need.e' },
      ['HEAD']
    )
    assert.equal(wrongCase.size, 0)
    assert.deepEqual([...rightCase], [c2])
  })

  it('finds commits whose changed lines match a regex (-G)', async t => {
    const { repository, c1, c2, c3 } = await setupHistory(t)
    const shas = await findCode(repository, { ...noTerms, regex: 'hel+o' }, [
      'HEAD',
    ])
    assert.ok(shas.has(c1))
    assert.ok(shas.has(c3))
    assert.ok(!shas.has(c2))
  })

  it('follows renames for a file history', async t => {
    const { repository, c1, c2, c3, c4 } = await setupHistory(t)
    const shas = await findFile(
      repository,
      { ...noTerms, file: 'renamed.txt' },
      ['HEAD']
    )
    assert.deepEqual(new Set(shas), new Set([c1, c3, c4]))
    assert.ok(!shas.has(c2))
  })

  it('combines content with a file', async t => {
    const { repository, c3 } = await setupHistory(t)
    const shas = await findCode(
      repository,
      { ...noTerms, content: 'hello world', file: 'renamed.txt' },
      ['HEAD']
    )
    assert.deepEqual([...shas], [c3])
  })

  it('intersects content and regex', async t => {
    const { repository, c3 } = await setupHistory(t)
    const shas = await findCode(
      repository,
      { ...noTerms, content: 'world', regex: 'hello' },
      ['HEAD']
    )
    assert.deepEqual([...shas], [c3])
  })

  it('treats a file with glob characters as a pathspec', async t => {
    const { repository, c1, c2, c3 } = await setupHistory(t)
    const shas = await findFile(repository, { ...noTerms, file: '*.txt' }, [
      'HEAD',
    ])
    assert.ok(shas.has(c1) && shas.has(c2) && shas.has(c3))
  })

  it('treats content that looks like an option as text', async t => {
    const { repository } = await setupHistory(t)
    const shas = await findCode(repository, { ...noTerms, content: '--all' }, [
      'HEAD',
    ])
    assert.equal(shas.size, 0)
  })

  it('returns an empty set for an invalid regex instead of throwing', async t => {
    const { repository } = await setupHistory(t)
    const shas = await findCode(
      repository,
      { ...noTerms, regex: '(unclosed' },
      ['HEAD']
    )
    assert.equal(shas.size, 0)
  })

  it('returns an empty set for an unborn HEAD', async t => {
    const repository = await setupEmptyRepositoryDefaultMain(t)
    const shas = await findCode(repository, { ...noTerms, content: 'x' }, [
      'HEAD',
    ])
    assert.equal(shas.size, 0)
  })
  it('searches only the given revisions, or every branch with "all"', async t => {
    const { repository } = await setupHistory(t)
    await createBranch(repository, 'other', 'HEAD')
    await switchTo(repository, 'other')
    await makeCommit(repository, {
      entries: [{ path: 'c.txt', contents: 'only on other branch\n' }],
    })
    await switchTo(repository, 'main')

    const terms = { ...noTerms, content: 'only on other branch' }
    const onHead = await findCode(repository, terms, ['HEAD'])
    const onAll = await findCode(repository, terms, 'all')

    assert.equal(onHead.size, 0)
    assert.equal(onAll.size, 1)
  })
  it('gives no result for a search that was not asked for', async t => {
    const { repository } = await setupHistory(t)

    const onlyCode = await searchCommitShas(
      repository,
      { ...noTerms, content: 'needle' },
      ['HEAD']
    )
    assert.notEqual(onlyCode.pickaxe, null)
    assert.equal(onlyCode.file, null)

    const onlyFile = await searchCommitShas(
      repository,
      { ...noTerms, file: 'b.txt' },
      ['HEAD']
    )
    assert.equal(onlyFile.pickaxe, null)
    assert.notEqual(onlyFile.file, null)
  })

  it('answers the code search and the file restriction separately', async t => {
    const { repository, c1, c2, c3 } = await setupHistory(t)
    const result = await searchCommitShas(
      repository,
      { ...noTerms, regex: 'hello', file: 'a.txt' },
      ['HEAD']
    )

    // git also reports the commit that renamed the file away, so only check
    // what must be there and what must not
    assert.ok(result.pickaxe?.has(c1) && result.pickaxe.has(c3))
    assert.ok(!result.pickaxe?.has(c2))
    assert.ok(result.file?.has(c1) && result.file.has(c3))
    assert.ok(!result.file?.has(c2))
  })

  it('requires every code search by default and any of them with matchAny', async t => {
    const { repository, c2, c3 } = await setupHistory(t)
    // c3 adds "hello world"; c2 adds "needle here"
    const terms = { ...noTerms, content: 'world', regex: 'needle' }

    const required = await findCode(repository, terms, ['HEAD'])
    const alternatives = await findCode(
      repository,
      { ...terms, matchAny: true },
      ['HEAD']
    )

    assert.equal(required.size, 0)
    assert.deepEqual(new Set(alternatives), new Set([c2, c3]))
  })

  it('stops searching when aborted, without throwing', async t => {
    const { repository } = await setupHistory(t)
    const controller = new AbortController()
    controller.abort()

    const result = await searchCommitShas(
      repository,
      { ...noTerms, content: 'needle', file: 'b.txt' },
      ['HEAD'],
      controller.signal
    )

    assert.equal(result.pickaxe?.size, 0)
    assert.equal(result.file?.size, 0)
  })
})
