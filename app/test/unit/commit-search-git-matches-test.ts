import { describe, it } from 'node:test'
import assert from 'node:assert'
import { findGitSearchMatches } from '../../src/lib/commit-search-git-matches'
import {
  gitSearchTermsKey,
  IGitMatchedShas,
  IGitSearchMatches,
  IGitSearchTerms,
} from '../../src/lib/commit-search-filter'

const terms: IGitSearchTerms = {
  content: 'foo',
  regex: null,
  file: null,
  allBranches: false,
  matchCase: false,
  matchAny: false,
}

const answer = (...shas: string[]): IGitMatchedShas => ({
  pickaxe: new Set(shas),
  file: null,
})

function setup(
  overrides: {
    existing?: IGitSearchMatches | null
    revisions?: ReadonlyArray<string> | 'all'
    controller?: AbortController
    onWait?: () => void
    onSearch?: () => void
  } = {}
) {
  const controller = overrides.controller ?? new AbortController()
  const calls = { search: 0, waits: 0 }
  const received: { signal: AbortSignal | null } = { signal: null }
  const options = {
    terms,
    revisions: overrides.revisions ?? ['HEAD'],
    existing: overrides.existing ?? null,
    signal: controller.signal,
    search: async (
      _terms: IGitSearchTerms,
      _revisions: ReadonlyArray<string> | 'all',
      signal: AbortSignal
    ) => {
      calls.search++
      received.signal = signal
      overrides.onSearch?.()
      return answer('abc')
    },
    waitForTypingToPause: async () => {
      calls.waits++
      overrides.onWait?.()
    },
  }
  return { calls, options, controller, received }
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
    assert.deepEqual([...(result.shas.pickaxe ?? [])], ['abc'])
    assert.equal(calls.search, 1)
    assert.equal(calls.waits, 1)
  })

  it('lets git know when the search is no longer wanted', async () => {
    const { options, controller, received } = setup()
    await findGitSearchMatches(options)

    assert.equal(received.signal, controller.signal)
  })

  it('reuses an existing answer for the same terms and scope', async () => {
    const existing = {
      termsKey: gitSearchTermsKey(terms),
      scopeKey: 'HEAD',
      shas: answer('old'),
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
      shas: answer('old'),
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
      shas: answer('old'),
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
    const { calls, options, controller } = setup({
      onWait: () => controller.abort(),
    })
    const result = await findGitSearchMatches(options)

    assert.equal(result, 'superseded')
    assert.equal(calls.search, 0)
  })

  it('drops the answer if the query changed while git was working', async () => {
    const { calls, options, controller } = setup({
      onSearch: () => controller.abort(),
    })
    const result = await findGitSearchMatches(options)

    assert.equal(result, 'superseded')
    assert.equal(calls.search, 1)
  })
})
