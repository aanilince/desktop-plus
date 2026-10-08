import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  canNarrowExistingResults,
  commitMatchesSearchFilter,
  isCommitSearchFilterEmpty,
  parseCommitSearchFilter,
  withGitSearchMatches,
  fileHistorySearchQuery,
} from '../../src/lib/commit-search-filter'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

function makeCommit(sha: string, summary = 'a summary', email = 'a@b.c') {
  const identity = new CommitIdentity('Name', email, new Date(0))
  return new Commit(
    sha,
    sha.slice(0, 7),
    summary,
    '',
    identity,
    identity,
    [],
    [],
    []
  )
}

describe('parseCommitSearchFilter (existing behaviour)', () => {
  it('lowercases plain text and has no git terms', () => {
    const f = parseCommitSearchFilter('Fix BUG')
    assert.equal(f.queryTextLowercase, 'fix bug')
    assert.equal(f.gitTerms, null)
  })

  it('extracts author: terms', () => {
    const f = parseCommitSearchFilter('author:Me@X.com fix')
    assert.deepEqual([...f.authorEmailsLowercase], ['me@x.com'])
    assert.equal(f.queryTextLowercase, 'fix')
  })

  it('treats an empty author: as plain text', () => {
    assert.equal(
      parseCommitSearchFilter('author:').queryTextLowercase,
      'author:'
    )
  })
})

describe('parseCommitSearchFilter (git terms)', () => {
  it('parses content:, regex: and file: and keeps their case', () => {
    const f = parseCommitSearchFilter('content:FooBar regex:a.+b file:src/X.ts')
    assert.deepEqual(f.gitTerms, {
      content: 'FooBar',
      regex: 'a.+b',
      file: 'src/X.ts',
    })
    assert.equal(f.queryTextLowercase, '')
  })

  it('accepts quoted values with spaces', () => {
    const f = parseCommitSearchFilter(
      'content:"hello world" file:"my dir/a b.ts"'
    )
    assert.equal(f.gitTerms?.content, 'hello world')
    assert.equal(f.gitTerms?.file, 'my dir/a b.ts')
  })

  it('takes the rest of the query for an unterminated quote while typing', () => {
    const f = parseCommitSearchFilter('content:"half typed')
    assert.equal(f.gitTerms?.content, 'half typed')
  })

  it('matches prefixes case-insensitively', () => {
    assert.equal(parseCommitSearchFilter('CONTENT:x').gitTerms?.content, 'x')
  })

  it('treats an empty value as plain text (still being typed)', () => {
    const f = parseCommitSearchFilter('content:')
    assert.equal(f.gitTerms, null)
    assert.equal(f.queryTextLowercase, 'content:')
  })

  it('combines git terms with free text and author', () => {
    const f = parseCommitSearchFilter('fix content:foo author:a@b.c')
    assert.equal(f.queryTextLowercase, 'fix')
    assert.equal(f.gitTerms?.content, 'foo')
    assert.deepEqual([...f.authorEmailsLowercase], ['a@b.c'])
  })

  it('is not considered empty when only a git term is present', () => {
    assert.equal(
      isCommitSearchFilterEmpty(parseCommitSearchFilter('file:x')),
      false
    )
  })
})

describe('commitMatchesSearchFilter with git matches', () => {
  const filter = parseCommitSearchFilter('content:foo')

  it('matches nothing until the git results are known', () => {
    assert.equal(
      commitMatchesSearchFilter(makeCommit('aaa1111'), filter),
      false
    )
  })

  it('matches only commits in the git result set', () => {
    const resolved = withGitSearchMatches(filter, new Set(['aaa1111']))
    assert.equal(
      commitMatchesSearchFilter(makeCommit('aaa1111'), resolved),
      true
    )
    assert.equal(
      commitMatchesSearchFilter(makeCommit('bbb2222'), resolved),
      false
    )
  })

  it('still applies free text and author on top of the git result set', () => {
    const resolved = withGitSearchMatches(
      parseCommitSearchFilter('content:foo needle'),
      new Set(['aaa1111', 'bbb2222'])
    )
    assert.equal(
      commitMatchesSearchFilter(makeCommit('aaa1111', 'has needle'), resolved),
      true
    )
    assert.equal(
      commitMatchesSearchFilter(makeCommit('bbb2222', 'nothing'), resolved),
      false
    )
  })

  it('ignores git results for a filter without git terms', () => {
    const plain = withGitSearchMatches(parseCommitSearchFilter('x'), new Set())
    assert.equal(
      commitMatchesSearchFilter(makeCommit('aaa1111', 'x'), plain),
      true
    )
  })
})

describe('canNarrowExistingResults', () => {
  it('narrows when only plain text grows', () => {
    assert.equal(canNarrowExistingResults('fi', 'fix'), true)
  })

  it('does not narrow when the git terms change', () => {
    assert.equal(
      canNarrowExistingResults('content:foo', 'content:foobar'),
      false
    )
  })

  it('narrows when the git terms are identical and the text grows', () => {
    assert.equal(
      canNarrowExistingResults('content:foo fi', 'content:foo fix'),
      true
    )
  })
})

describe('fileHistorySearchQuery', () => {
  const roundTrip = (path: string) =>
    parseCommitSearchFilter(fileHistorySearchQuery(path)).gitTerms?.file

  it('produces a plain term for a simple path', () => {
    assert.equal(fileHistorySearchQuery('src/a.ts'), 'file:src/a.ts')
  })

  it('quotes paths with spaces', () => {
    assert.equal(
      fileHistorySearchQuery('my dir/a b.ts'),
      'file:"my dir/a b.ts"'
    )
  })

  it('round-trips through the parser', () => {
    for (const path of ['src/a.ts', 'my dir/a b.ts', 'weird[1].ts', 'ü/ö.ts']) {
      assert.equal(roundTrip(path), path)
    }
  })

  it('uses forward slashes so Windows paths work', () => {
    assert.equal(fileHistorySearchQuery('src\\a.ts'), 'file:src/a.ts')
  })
})
