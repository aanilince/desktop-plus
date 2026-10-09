import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  canNarrowExistingResults,
  commitMatchesSearchFilter,
  isCommitSearchFilterEmpty,
  parseCommitSearchFilter,
  withGitSearchMatches,
  buildCommitSearchQuery,
  DefaultCommitSearchOptions,
  hasCustomCommitSearchOptions,
  quoteSearchValue,
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
      allBranches: false,
      matchCase: false,
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

describe('quoted values', () => {
  it('unescapes \\" and \\\\ inside quotes', () => {
    const f = parseCommitSearchFilter('content:"say \\"hi\\" \\\\ ok"')
    assert.equal(f.gitTerms?.content, 'say "hi" \\ ok')
  })

  it('round-trips arbitrary text through quoteSearchValue', () => {
    for (const value of ['a "b" c', 'back\\slash', 'end\\', '"', '\\"']) {
      const f = parseCommitSearchFilter(`content:${quoteSearchValue(value)}`)
      assert.equal(f.gitTerms?.content, value)
    }
  })
})

describe('scope:all', () => {
  it('widens a git search to all branches', () => {
    const f = parseCommitSearchFilter('content:foo scope:all')
    assert.equal(f.gitTerms?.allBranches, true)
  })

  it('is not free text and does nothing without a git term', () => {
    const f = parseCommitSearchFilter('fix scope:all')
    assert.equal(f.gitTerms, null)
    assert.equal(f.queryTextLowercase, 'fix')
  })

  it('does not narrow results when the scope changes', () => {
    assert.equal(
      canNarrowExistingResults('content:foo', 'content:foo scope:all'),
      false
    )
  })
})

describe('case:match', () => {
  it('makes the git search case-sensitive', () => {
    assert.equal(
      parseCommitSearchFilter('content:Foo case:match').gitTerms?.matchCase,
      true
    )
    assert.equal(
      parseCommitSearchFilter('content:Foo').gitTerms?.matchCase,
      false
    )
  })

  it('is not free text', () => {
    const f = parseCommitSearchFilter('fix case:match')
    assert.equal(f.gitTerms, null)
    assert.equal(f.queryTextLowercase, 'fix')
  })

  it('does not narrow results when it changes', () => {
    assert.equal(
      canNarrowExistingResults('content:foo', 'content:foo case:match'),
      false
    )
  })
})

describe('buildCommitSearchQuery', () => {
  const opts = (o: Partial<typeof DefaultCommitSearchOptions>) => ({
    ...DefaultCommitSearchOptions,
    ...o,
  })

  it('leaves the text untouched with default options', () => {
    assert.equal(
      buildCommitSearchQuery('fix  bug ', DefaultCommitSearchOptions),
      'fix  bug '
    )
  })

  it('turns the text into a content search', () => {
    assert.equal(
      buildCommitSearchQuery('hello world', opts({ mode: 'content' })),
      'content:"hello world"'
    )
  })

  it('turns the text into a regex search', () => {
    assert.equal(
      buildCommitSearchQuery('a.+b', opts({ mode: 'regex' })),
      'regex:"a.+b"'
    )
  })

  it('keeps author: terms out of the searched code', () => {
    assert.equal(
      buildCommitSearchQuery(
        'foo author:me@x.com bar',
        opts({ mode: 'content' })
      ),
      'author:me@x.com content:"foo  bar"'
    )
  })

  it('adds the file restriction', () => {
    assert.equal(
      buildCommitSearchQuery('fix', opts({ file: 'src\\a b.ts' })),
      'fix file:"src/a b.ts"'
    )
  })

  it('searches just a file when there is no text', () => {
    assert.equal(
      buildCommitSearchQuery('', opts({ file: 'a.ts' })),
      'file:"a.ts"'
    )
  })

  it('adds scope:all only when there is a git term to widen', () => {
    assert.equal(
      buildCommitSearchQuery('x', opts({ mode: 'content', allBranches: true })),
      'content:"x" scope:all'
    )
    assert.equal(buildCommitSearchQuery('x', opts({ allBranches: true })), 'x')
  })

  it('adds case:match only when searching code', () => {
    assert.equal(
      buildCommitSearchQuery('x', opts({ mode: 'regex', matchCase: true })),
      'regex:"x" case:match'
    )
    assert.equal(buildCommitSearchQuery('x', opts({ matchCase: true })), 'x')
    assert.equal(
      buildCommitSearchQuery('', opts({ mode: 'content', matchCase: true })),
      ''
    )
  })

  it('does not search code for empty text', () => {
    assert.equal(buildCommitSearchQuery('', opts({ mode: 'content' })), '')
  })

  it('produces queries the parser understands', () => {
    const f = parseCommitSearchFilter(
      buildCommitSearchQuery(
        'say "hi"',
        opts({ mode: 'content', file: 'dir/a b.ts', allBranches: true })
      )
    )
    assert.deepEqual(f.gitTerms, {
      content: 'say "hi"',
      regex: null,
      file: 'dir/a b.ts',
      allBranches: true,
      matchCase: false,
    })
  })
})

describe('hasCustomCommitSearchOptions', () => {
  it('is false for the defaults and true for any change', () => {
    assert.equal(
      hasCustomCommitSearchOptions(DefaultCommitSearchOptions),
      false
    )
    assert.equal(
      hasCustomCommitSearchOptions({
        ...DefaultCommitSearchOptions,
        mode: 'regex',
      }),
      true
    )
    assert.equal(
      hasCustomCommitSearchOptions({
        ...DefaultCommitSearchOptions,
        file: 'a',
      }),
      true
    )
    assert.equal(
      hasCustomCommitSearchOptions({
        ...DefaultCommitSearchOptions,
        file: '  ',
      }),
      false
    )
  })
})
