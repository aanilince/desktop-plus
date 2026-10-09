import { describe, it } from 'node:test'
import assert from 'node:assert'
import { suggestFilePaths } from '../../src/lib/file-path-suggestions'

const paths = [
  'app/src/ui/history/commit-search-options.tsx',
  'app/src/ui/history/compare.tsx',
  'app/src/lib/commit-search-filter.ts',
  'app/test/unit/commit-search-filter-test.ts',
  'README.md',
  'docs/Getting Started.md',
]

describe('suggestFilePaths', () => {
  it('suggests nothing for an empty query', () => {
    assert.deepEqual(suggestFilePaths(paths, ''), [])
    assert.deepEqual(suggestFilePaths(paths, '   '), [])
  })

  it('finds paths by a part of the name, ignoring case', () => {
    const result = suggestFilePaths(paths, 'READme')
    assert.deepEqual(result, ['README.md'])
  })

  it('is fuzzy, like a quick-open box', () => {
    const result = suggestFilePaths(paths, 'cso')
    assert.ok(result.includes('app/src/ui/history/commit-search-options.tsx'))
  })

  it('finds paths with spaces', () => {
    assert.deepEqual(suggestFilePaths(paths, 'getting started'), [
      'docs/Getting Started.md',
    ])
  })

  it('accepts Windows separators in the query', () => {
    const result = suggestFilePaths(paths, 'history\\compare')
    assert.equal(result[0], 'app/src/ui/history/compare.tsx')
  })

  it('returns at most the requested number of suggestions', () => {
    assert.equal(suggestFilePaths(paths, 'app', 2).length, 2)
  })

  it('suggests nothing when nothing matches', () => {
    assert.deepEqual(suggestFilePaths(paths, 'zzzzqq'), [])
  })
})
