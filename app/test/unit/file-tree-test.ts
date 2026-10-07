import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildFileTreeRows,
  getNestedFolderPaths,
  getTreeFileLabel,
} from '../../src/lib/file-tree'
import { AppFileStatus, AppFileStatusKind } from '../../src/models/status'

const files = [
  'README.md',
  'src/a.ts',
  'src/lib/deep/b.ts',
  'src/lib/deep/c.ts',
].map(path => ({ path }))

const describeRows = (collapsed: ReadonlySet<string>) =>
  buildFileTreeRows(files, collapsed).map(r =>
    r.kind === 'folder'
      ? `${r.depth}:${r.name}/(${r.files.length})`
      : `${r.depth}:${r.file.path}`
  )

describe('buildFileTreeRows', () => {
  it('lists folders before files and compacts single-child chains', () => {
    assert.deepStrictEqual(describeRows(new Set()), [
      '0:src/(3)',
      '1:lib/deep/(2)',
      '2:src/lib/deep/b.ts',
      '2:src/lib/deep/c.ts',
      '1:src/a.ts',
      '0:README.md',
    ])
  })

  it('hides contents of collapsed folders', () => {
    assert.deepStrictEqual(describeRows(new Set(['src/lib/deep'])), [
      '0:src/(3)',
      '1:lib/deep/(2)',
      '1:src/a.ts',
      '0:README.md',
    ])
  })
})

describe('getNestedFolderPaths', () => {
  it('returns the folder and its descendants', () => {
    assert.deepStrictEqual(getNestedFolderPaths(files, 'src'), [
      'src',
      'src/lib/deep',
    ])
  })
})

describe('getTreeFileLabel', () => {
  const renamed = (oldPath: string): AppFileStatus => ({
    kind: AppFileStatusKind.Renamed,
    oldPath,
    renameIncludesModifications: false,
  })

  it('shows only the file name', () => {
    const status: AppFileStatus = { kind: AppFileStatusKind.Modified }
    const label = getTreeFileLabel({ path: 'src/lib/a.ts', status })
    assert.equal(label.path, 'a.ts')
    assert.equal(label.status, status)
  })

  it('shortens the old path of renames within the same folder', () => {
    const label = getTreeFileLabel({
      path: 'src/b.ts',
      status: renamed('src/a.ts'),
    })
    assert.deepStrictEqual(label.status, renamed('a.ts'))
  })

  it('keeps the old path of renames from another folder', () => {
    const label = getTreeFileLabel({
      path: 'src/b.ts',
      status: renamed('lib/b.ts'),
    })
    assert.deepStrictEqual(label.status, renamed('lib/b.ts'))
  })

  it('shifts highlighted characters to the file name', () => {
    const label = getTreeFileLabel({
      path: 'src/a.ts',
      status: { kind: AppFileStatusKind.Modified },
      matches: { title: [0, 4, 5], subtitle: [] },
    })
    assert.deepStrictEqual(label.matches, { title: [0, 1], subtitle: [] })
  })
})
