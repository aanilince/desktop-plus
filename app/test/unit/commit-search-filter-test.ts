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
      matchAny: false,
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
  const answer = (
    pickaxe: ReadonlyArray<string> | null,
    file: ReadonlyArray<string> | null = null
  ) => ({
    pickaxe: pickaxe === null ? null : new Set(pickaxe),
    file: file === null ? null : new Set(file),
  })
  const matches = (
    query: string,
    commit: ReturnType<typeof makeCommit>,
    git?: ReturnType<typeof answer>
  ) => {
    const filter = parseCommitSearchFilter(query)
    return commitMatchesSearchFilter(
      commit,
      git === undefined ? filter : withGitSearchMatches(filter, git)
    )
  }

  describe('code search on its own', () => {
    it('matches nothing until git has answered', () => {
      assert.equal(matches('content:foo', makeCommit('aaa1111')), false)
    })

    it('matches only the commits git found', () => {
      const git = answer(['aaa1111'])
      assert.equal(matches('content:foo', makeCommit('aaa1111'), git), true)
      assert.equal(matches('content:foo', makeCommit('bbb2222'), git), false)
    })

    it('ignores git results for a filter without git terms', () => {
      const plain = withGitSearchMatches(
        parseCommitSearchFilter('x'),
        answer([])
      )
      assert.equal(
        commitMatchesSearchFilter(makeCommit('aaa1111', 'x'), plain),
        true
      )
    })
  })

  describe('text and code search both required (typed terms)', () => {
    const query = 'needle content:foo'

    it('needs the message and the code to match', () => {
      const git = answer(['aaa1111', 'bbb2222'])
      const hit = makeCommit('aaa1111', 'has needle')
      const noText = makeCommit('bbb2222', 'nothing')
      const noCode = makeCommit('ccc3333', 'has needle')

      assert.equal(matches(query, hit, git), true)
      assert.equal(matches(query, noText, git), false)
      assert.equal(matches(query, noCode, git), false)
    })

    it('still applies the author', () => {
      const git = answer(['aaa1111'])
      const query = 'content:foo author:me@x.com'
      assert.equal(
        matches(query, makeCommit('aaa1111', 's', 'me@x.com'), git),
        true
      )
      assert.equal(
        matches(query, makeCommit('aaa1111', 's', 'you@x.com'), git),
        false
      )
    })
  })

  describe('text or code search (match:any)', () => {
    const query = 'needle content:foo match:any'

    it('shows the commits whose message matches while git is still working', () => {
      assert.equal(matches(query, makeCommit('aaa1111', 'has needle')), true)
      assert.equal(matches(query, makeCommit('bbb2222', 'nothing')), false)
    })

    it('adds the commits git found once it has answered', () => {
      const git = answer(['bbb2222'])
      assert.equal(
        matches(query, makeCommit('aaa1111', 'has needle'), git),
        true
      )
      assert.equal(matches(query, makeCommit('bbb2222', 'nothing'), git), true)
      assert.equal(matches(query, makeCommit('ccc3333', 'nothing'), git), false)
    })

    it('without text it is just the code search', () => {
      const query = 'content:foo match:any'
      assert.equal(matches(query, makeCommit('aaa1111')), false)
      assert.equal(
        matches(query, makeCommit('aaa1111'), answer(['aaa1111'])),
        true
      )
    })

    it('still applies the author to both', () => {
      const git = answer(['aaa1111'])
      const query = 'needle content:foo author:me@x.com match:any'
      assert.equal(
        matches(query, makeCommit('aaa1111', 'x', 'you@x.com'), git),
        false
      )
      assert.equal(
        matches(query, makeCommit('aaa1111', 'x', 'me@x.com'), git),
        true
      )
    })
  })

  describe('file restriction', () => {
    it('matches nothing until git has answered', () => {
      assert.equal(matches('file:"a.ts"', makeCommit('aaa1111')), false)
    })

    it('keeps only the commits touching the file', () => {
      const git = answer(null, ['aaa1111'])
      assert.equal(matches('file:"a.ts"', makeCommit('aaa1111'), git), true)
      assert.equal(matches('file:"a.ts"', makeCommit('bbb2222'), git), false)
    })

    it('restricts the message search too', () => {
      const git = answer(null, ['aaa1111'])
      const query = 'needle file:"a.ts"'
      assert.equal(
        matches(query, makeCommit('aaa1111', 'has needle'), git),
        true
      )
      assert.equal(
        matches(query, makeCommit('bbb2222', 'has needle'), git),
        false
      )
    })

    it('restricts the message OR code search as a whole', () => {
      const git = answer(['aaa1111', 'bbb2222'], ['aaa1111', 'ccc3333'])
      const query = 'needle content:foo file:"a.ts" match:any'
      // touches the file and has the text
      assert.equal(
        matches(query, makeCommit('ccc3333', 'has needle'), git),
        true
      )
      // touches the file and has the code
      assert.equal(matches(query, makeCommit('aaa1111', 'nothing'), git), true)
      // has the code but not in the file
      assert.equal(matches(query, makeCommit('bbb2222', 'nothing'), git), false)
    })

    it('shows nothing for a file restricted message OR code search before git answers', () => {
      const query = 'needle content:foo file:"a.ts" match:any'
      assert.equal(matches(query, makeCommit('aaa1111', 'has needle')), false)
    })
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

describe('match:any', () => {
  it('makes the message and the code searches alternatives', () => {
    assert.equal(
      parseCommitSearchFilter('x content:y match:any').gitTerms?.matchAny,
      true
    )
    assert.equal(
      parseCommitSearchFilter('x content:y').gitTerms?.matchAny,
      false
    )
  })

  it('is not free text', () => {
    const f = parseCommitSearchFilter('fix match:any')
    assert.equal(f.gitTerms, null)
    assert.equal(f.queryTextLowercase, 'fix')
  })

  it('does not narrow results when it changes', () => {
    assert.equal(
      canNarrowExistingResults('x content:y', 'x content:y match:any'),
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
  const messageOnly = { message: true, content: false, regex: false }
  const regexOnly = { message: false, content: false, regex: true }
  const contentOnly = { message: false, content: true, regex: false }

  it('searches messages and code (regex) by default', () => {
    assert.equal(
      buildCommitSearchQuery('hello world', DefaultCommitSearchOptions),
      'hello world regex:"hello world" match:any'
    )
  })

  it('leaves short text alone: not worth a search of the whole history', () => {
    assert.equal(buildCommitSearchQuery('fi', DefaultCommitSearchOptions), 'fi')
    assert.equal(
      buildCommitSearchQuery('fix  bug ', opts(messageOnly)),
      'fix  bug '
    )
  })

  it('only searches the message when only that is chosen', () => {
    assert.equal(
      buildCommitSearchQuery('hello world', opts(messageOnly)),
      'hello world'
    )
  })

  it('only searches code when the message is not chosen', () => {
    assert.equal(
      buildCommitSearchQuery('a.+b', opts(regexOnly)),
      'regex:"a.+b"'
    )
    assert.equal(
      buildCommitSearchQuery('hello world', opts(contentOnly)),
      'content:"hello world"'
    )
  })

  it('searches short text for code when the message is not also searched', () => {
    assert.equal(buildCommitSearchQuery('ab', opts(regexOnly)), 'regex:"ab"')
  })

  it('combines several searches as alternatives', () => {
    assert.equal(
      buildCommitSearchQuery('hello', opts({ content: true })),
      'hello content:"hello" regex:"hello" match:any'
    )
    assert.equal(
      buildCommitSearchQuery('hello', opts({ regex: false, content: true })),
      'hello content:"hello" match:any'
    )
    assert.equal(
      buildCommitSearchQuery(
        'hello',
        opts({ message: false, content: true, regex: true })
      ),
      'content:"hello" regex:"hello" match:any'
    )
  })

  it('keeps author: terms out of the searched code', () => {
    assert.equal(
      buildCommitSearchQuery(
        'foo author:me@x.com bar',
        DefaultCommitSearchOptions
      ),
      'foo author:me@x.com bar regex:"foo  bar" match:any'
    )
    assert.equal(
      buildCommitSearchQuery('foo author:me@x.com bar', opts(contentOnly)),
      'author:me@x.com content:"foo  bar"'
    )
  })

  it('adds the file restriction', () => {
    assert.equal(
      buildCommitSearchQuery(
        'fix',
        opts({ ...messageOnly, file: 'src\\a b.ts' })
      ),
      'fix file:"src/a b.ts"'
    )
    assert.equal(
      buildCommitSearchQuery('', opts({ file: 'a.ts' })),
      'file:"a.ts"'
    )
  })

  it('adds scope:all only when there is a git term to widen', () => {
    assert.equal(
      buildCommitSearchQuery(
        'hello',
        opts({ ...contentOnly, allBranches: true })
      ),
      'content:"hello" scope:all'
    )
    assert.equal(
      buildCommitSearchQuery(
        'hello',
        opts({ ...messageOnly, allBranches: true })
      ),
      'hello'
    )
  })

  it('adds case:match only when searching code', () => {
    assert.equal(
      buildCommitSearchQuery('hello', opts({ ...regexOnly, matchCase: true })),
      'regex:"hello" case:match'
    )
    assert.equal(
      buildCommitSearchQuery(
        'hello',
        opts({ ...messageOnly, matchCase: true })
      ),
      'hello'
    )
    assert.equal(
      buildCommitSearchQuery('', opts({ ...regexOnly, matchCase: true })),
      ''
    )
  })

  it('does not search code for empty text', () => {
    assert.equal(buildCommitSearchQuery('', opts(regexOnly)), '')
    assert.equal(buildCommitSearchQuery('', DefaultCommitSearchOptions), '')
  })

  it('falls back to the message when nothing is chosen', () => {
    assert.equal(
      buildCommitSearchQuery(
        'hello',
        opts({ message: false, content: false, regex: false })
      ),
      'hello'
    )
  })

  it('produces queries the parser understands', () => {
    const f = parseCommitSearchFilter(
      buildCommitSearchQuery('say "hi"', {
        ...DefaultCommitSearchOptions,
        content: true,
        file: 'dir/a b.ts',
        allBranches: true,
      })
    )
    assert.deepEqual(f.gitTerms, {
      content: 'say "hi"',
      regex: 'say "hi"',
      file: 'dir/a b.ts',
      allBranches: true,
      matchCase: false,
      matchAny: true,
    })
    assert.equal(f.queryTextLowercase, 'say "hi"')
  })
})

describe('hasCustomCommitSearchOptions', () => {
  it('is false for the defaults', () => {
    assert.equal(
      hasCustomCommitSearchOptions(DefaultCommitSearchOptions),
      false
    )
  })

  it('is true as soon as something differs', () => {
    const differs = (o: Partial<typeof DefaultCommitSearchOptions>) =>
      hasCustomCommitSearchOptions({ ...DefaultCommitSearchOptions, ...o })

    assert.equal(differs({ message: false }), true)
    assert.equal(differs({ content: true }), true)
    assert.equal(differs({ regex: false }), true)
    assert.equal(differs({ file: 'a' }), true)
    assert.equal(differs({ allBranches: true }), true)
    assert.equal(differs({ matchCase: true }), true)
  })

  it('ignores a blank file', () => {
    assert.equal(
      hasCustomCommitSearchOptions({
        ...DefaultCommitSearchOptions,
        file: '  ',
      }),
      false
    )
  })
})
