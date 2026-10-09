import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  compileRegexFilter,
  matchesRegexFilter,
  splitRegexList,
} from '../../src/ui/changes/filter-changes-regex'

describe('compileRegexFilter', () => {
  it('returns a matcher that accepts everything for an empty pattern', () => {
    const result = compileRegexFilter('', { caseSensitive: false })
    assert.equal(result.kind, 'empty')
  })

  it('reports invalid patterns instead of throwing', () => {
    const result = compileRegexFilter('(unclosed', { caseSensitive: false })
    assert.equal(result.kind, 'invalid')
  })

  it('compiles a valid pattern', () => {
    const result = compileRegexFilter('\\.tsx?$', { caseSensitive: false })
    assert.equal(result.kind, 'valid')
  })
})

describe('matchesRegexFilter', () => {
  const path = 'app/src/ui/Changes/Filter-Changes.tsx'

  it('matches against the full path, not just the file name', () => {
    assert.equal(
      matchesRegexFilter(path, {
        include: '^app/src/ui/',
        exclude: '',
        caseSensitive: false,
      }),
      true
    )
  })

  it('is case-insensitive by default', () => {
    assert.equal(
      matchesRegexFilter(path, {
        include: 'filter-changes',
        exclude: '',
        caseSensitive: false,
      }),
      true
    )
  })

  it('respects the case-sensitive option', () => {
    assert.equal(
      matchesRegexFilter(path, {
        include: 'filter-changes',
        exclude: '',
        caseSensitive: true,
      }),
      false
    )
  })

  it('rejects files matching the exclude pattern', () => {
    assert.equal(
      matchesRegexFilter('app/test/unit/foo-test.ts', {
        include: '\\.ts$',
        exclude: '/test/',
        caseSensitive: false,
      }),
      false
    )
  })

  it('keeps files that match include and do not match exclude', () => {
    assert.equal(
      matchesRegexFilter('app/src/lib/foo.ts', {
        include: '\\.ts$',
        exclude: '/test/',
        caseSensitive: false,
      }),
      true
    )
  })

  it('treats an empty include as "match everything" so exclude works alone', () => {
    assert.equal(
      matchesRegexFilter('app/test/unit/foo-test.ts', {
        include: '',
        exclude: '/test/',
        caseSensitive: false,
      }),
      false
    )
    assert.equal(
      matchesRegexFilter('app/src/lib/foo.ts', {
        include: '',
        exclude: '/test/',
        caseSensitive: false,
      }),
      true
    )
  })

  it('ignores an invalid exclude pattern rather than hiding everything', () => {
    assert.equal(
      matchesRegexFilter(path, {
        include: '',
        exclude: '(unclosed',
        caseSensitive: false,
      }),
      true
    )
  })

  it('ignores an invalid include pattern rather than hiding everything', () => {
    assert.equal(
      matchesRegexFilter(path, {
        include: '(unclosed',
        exclude: '',
        caseSensitive: false,
      }),
      true
    )
  })
})

describe('comma-separated patterns', () => {
  const query = (include: string, exclude: string) => ({
    include,
    exclude,
    caseSensitive: false,
  })

  it('excludes files matching any pattern of the list', () => {
    const q = query('', 'test, lock, json')
    assert.equal(matchesRegexFilter('app/test/a.ts', q), false)
    assert.equal(matchesRegexFilter('yarn.lock', q), false)
    assert.equal(matchesRegexFilter('package.json', q), false)
    assert.equal(matchesRegexFilter('app/src/a.ts', q), true)
  })

  it('includes files matching any pattern of the list', () => {
    const q = query('\\.ts$, \\.tsx$', '')
    assert.equal(matchesRegexFilter('a.ts', q), true)
    assert.equal(matchesRegexFilter('a.tsx', q), true)
    assert.equal(matchesRegexFilter('a.json', q), false)
  })

  it('does not split commas inside groups, classes or quantifiers', () => {
    assert.deepEqual(splitRegexList('a{1,2}b, [x,y], (c,d)'), [
      'a{1,2}b',
      '[x,y]',
      '(c,d)',
    ])
  })

  it('treats an escaped comma as part of the pattern', () => {
    assert.deepEqual(splitRegexList('a\\,b, c'), ['a\\,b', 'c'])
    assert.equal(matchesRegexFilter('a,b.txt', query('', 'a\\,b')), false)
  })

  it('ignores empty items', () => {
    assert.deepEqual(splitRegexList(' , json,, '), ['json'])
  })

  it('still applies the valid patterns when another one is invalid', () => {
    const q = query('', 'json, (unclosed')
    assert.equal(matchesRegexFilter('package.json', q), false)
    assert.equal(matchesRegexFilter('a.ts', q), true)
    assert.equal(
      compileRegexFilter('json, (unclosed', { caseSensitive: false }).kind,
      'invalid'
    )
  })
})
