import { describe, it } from 'node:test'
import assert from 'node:assert'
import { findGitSearchMatches } from '../../src/lib/commit-search-git-matches'
import {
  gitSearchTermsKey,
  IGitSearchTerms,
} from '../../src/lib/commit-search-filter'

const terms: IGitSearchTerms = {
  content: 'foo',
  regex: null,
  file: null,
  allBranches: false,
  matchCase: false,
}

function setup(overrides: {
  isStillCurrent?: () => boolean
  existing?: Parameters<typeof findGitSearchMatches>[0]['existing']
  revisions?: Parameters<typeof findGitSearchMatches>[0]['revisions']
  searchResult?: ReadonlySet<string>
}) {
  const calls = { search: 0, waits: 0 }
  const options = {
    terms,
    revisions: overrides.revisions ?? ['HEAD'],
    existing: overrides.existing ?? null,
    isStillCurrent: overrides.isStillCurrent ?? (() => true),
    search: async () => {
      calls.search++
      return overrides.searchResult ?? new Set(['abc'])
    },
    waitForTypingToPause: async () => {
      calls.waits++
    },
  }
  return { calls, options }
}

describe('findGitSearchMatches', () => {
  it('asks git and keys the answer by terms and scope', async () => {
    const { calls, options } = setup({ revisions: ['HEAD', 'refs/heads/x'] })
    const result = await findGitSearchMatches(options)

    assert.notEqual(result, 'superseded')
    if (result === 'superseded') {
      return
    }
    assert.equal(result.termsKey, gitSearchTermsKey(terms))
    assert.equal(result.scopeKey, 'HEAD\0refs/heads/x')
    assert.deepEqual([...result.shas], ['abc'])
    assert.equal(calls.search, 1)
    assert.equal(calls.waits, 1)
  })

  it('reuses an existing answer for the same terms and scope', async () => {
    const existing = {
      termsKey: gitSearchTermsKey(terms),
      scopeKey: 'HEAD',
      shas: new Set(['old']),
    }
    const { calls, options } = setup({ existing })
    const result = await findGitSearchMatches(options)

    assert.equal(result, existing)
    assert.equal(calls.search, 0)
    assert.equal(calls.waits, 0)
  })

  it('searches again when the scope changed', async () => {
    const existing = {
      termsKey: gitSearchTermsKey(terms),
      scopeKey: 'HEAD',
      shas: new Set(['old']),
    }
    const { calls, options } = setup({
      existing,
      revisions: ['HEAD', 'refs/heads/other'],
    })
    await findGitSearchMatches(options)
    assert.equal(calls.search, 1)
  })

  it('searches again when the terms changed', async () => {
    const existing = {
      termsKey: gitSearchTermsKey({ ...terms, content: 'bar' }),
      scopeKey: 'HEAD',
      shas: new Set(['old']),
    }
    const { calls, options } = setup({ existing })
    await findGitSearchMatches(options)
    assert.equal(calls.search, 1)
  })

  it('uses a scope of "all" for all branches', async () => {
    const { options } = setup({ revisions: 'all' })
    const result = await findGitSearchMatches(options)
    assert.notEqual(result, 'superseded')
    if (result !== 'superseded') {
      assert.equal(result.scopeKey, 'all')
    }
  })

  it('does not ask git if the query changed while typing', async () => {
    const { calls, options } = setup({ isStillCurrent: () => false })
    const result = await findGitSearchMatches(options)

    assert.equal(result, 'superseded')
    assert.equal(calls.search, 0)
  })

  it('drops the answer if the query changed while git was working', async () => {
    let current = true
    const { calls, options } = setup({ isStillCurrent: () => current })
    const search = options.search
    options.search = async () => {
      const shas = await search()
      current = false
      return shas
    }
    const result = await findGitSearchMatches(options)

    assert.equal(result, 'superseded')
    assert.equal(calls.search, 1)
  })
})
