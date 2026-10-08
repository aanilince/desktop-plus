import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AppFileStatusKind } from '../../src/models/status'
import { DiffSelectionType } from '../../src/models/diff'
import { WorkingDirectoryFileChange } from '../../src/models/status'
import { DiffSelection } from '../../src/models/diff'
import {
  applyFilterOptions,
  isCommittingFileHiddenByFilter,
  getNoResultsMessage,
  hasActiveFilters,
  applyFilters,
} from '../../src/ui/changes/filter-changes-logic'
import { IFileListFilterState } from '../../src/lib/app-state'
import { IChangesListItem } from '../../src/ui/changes/filter-changes-list'

// Helper function to create a test file
function createTestFile(
  path: string,
  kind:
    | AppFileStatusKind.New
    | AppFileStatusKind.Modified
    | AppFileStatusKind.Deleted,
  selectionType: DiffSelectionType
): WorkingDirectoryFileChange {
  const selection =
    selectionType === DiffSelectionType.Partial
      ? DiffSelection.fromInitialSelection(
          DiffSelectionType.All
        ).withLineSelection(0, false)
      : DiffSelection.fromInitialSelection(
          selectionType as DiffSelectionType.All | DiffSelectionType.None
        )
  return new WorkingDirectoryFileChange(path, { kind }, selection)
}

// Helper function to create a test changes list item
function createTestItem(
  path: string,
  status:
    | AppFileStatusKind.New
    | AppFileStatusKind.Modified
    | AppFileStatusKind.Deleted,
  selectionType: DiffSelectionType
): IChangesListItem {
  const change = createTestFile(path, status, selectionType)
  return {
    id: path,
    text: [path],
    change,
  }
}

describe('filter-changes-logic', () => {
  describe('applyFilterOptions', () => {
    describe('when no filters are active', () => {
      it('should show all files', () => {
        const filters: IFileListFilterState = {
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: false,
          isNewFile: false,
          isModifiedFile: false,
          isDeletedFile: false,
        }

        const newFile = createTestItem(
          'new.txt',
          AppFileStatusKind.New,
          DiffSelectionType.All
        )
        const modifiedFile = createTestItem(
          'modified.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.All
        )
        const deletedFile = createTestItem(
          'deleted.txt',
          AppFileStatusKind.Deleted,
          DiffSelectionType.All
        )

        assert.equal(applyFilterOptions(newFile, filters), true)
        assert.equal(applyFilterOptions(modifiedFile, filters), true)
        assert.equal(applyFilterOptions(deletedFile, filters), true)
      })
    })

    describe('when using AND logic', () => {
      it('should show files matching ALL active filters', () => {
        const filters: IFileListFilterState = {
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: true,
          isExcludedFromCommit: false,
          isNewFile: true,
          isModifiedFile: false,
          isDeletedFile: false,
        }

        // Staged new file - matches both filters
        const stagedNewFile = createTestItem(
          'staged-new.txt',
          AppFileStatusKind.New,
          DiffSelectionType.All
        )
        // Unstaged new file - doesn't match included filter
        const unstagedNewFile = createTestItem(
          'unstaged-new.txt',
          AppFileStatusKind.New,
          DiffSelectionType.None
        )
        // Staged modified file - doesn't match new file filter
        const stagedModifiedFile = createTestItem(
          'staged-modified.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.All
        )

        assert.equal(applyFilterOptions(stagedNewFile, filters), true)
        assert.equal(applyFilterOptions(unstagedNewFile, filters), false)
        assert.equal(applyFilterOptions(stagedModifiedFile, filters), false)
      })

      it('should handle conflicting filters correctly', () => {
        const filters: IFileListFilterState = {
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: true,
          isExcludedFromCommit: true, // Both can't be true at same time
          isNewFile: false,
          isModifiedFile: false,
          isDeletedFile: false,
        }

        const stagedFile = createTestItem(
          'staged.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.All
        )
        const unstagedFile = createTestItem(
          'unstaged.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.None
        )

        // No file can be both staged and unstaged
        assert.equal(applyFilterOptions(stagedFile, filters), false)
        assert.equal(applyFilterOptions(unstagedFile, filters), false)
      })

      it('should treat untracked files as new files', () => {
        const filters: IFileListFilterState = {
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: false,
          isNewFile: true,
          isModifiedFile: false,
          isDeletedFile: false,
        }

        const untrackedFile = {
          id: 'untracked.txt',
          text: ['untracked.txt'],
          change: new WorkingDirectoryFileChange(
            'untracked.txt',
            { kind: AppFileStatusKind.Untracked },
            DiffSelection.fromInitialSelection(DiffSelectionType.None)
          ),
        }

        assert.equal(applyFilterOptions(untrackedFile, filters), true)
      })

      it('should match excluded files when excluded filter is active', () => {
        const filters: IFileListFilterState = {
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: true,
          isNewFile: false,
          isModifiedFile: false,
          isDeletedFile: false,
        }

        const excludedFile = createTestItem(
          'excluded.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.None
        )
        const includedFile = createTestItem(
          'included.txt',
          AppFileStatusKind.Modified,
          DiffSelectionType.All
        )

        assert.equal(applyFilterOptions(excludedFile, filters), true)
        assert.equal(applyFilterOptions(includedFile, filters), false)
      })
    })
  })

  describe('isCommittingFileHiddenByFilter', () => {
    it('should return false when no filters are active', () => {
      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      const fileIds = ['file1', 'file2']
      const filteredItems = new Map([
        ['file1', {} as IChangesListItem],
        ['file2', {} as IChangesListItem],
      ])

      assert.equal(
        isCommittingFileHiddenByFilter(fileIds, filteredItems, 2, filters),
        false
      )
    })

    it('should return true when committing files not in filtered list', () => {
      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: true,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      const fileIds = ['file1', 'file2', 'file3']
      const filteredItems = new Map([
        ['file1', {} as IChangesListItem],
        ['file2', {} as IChangesListItem],
      ])

      assert.equal(
        isCommittingFileHiddenByFilter(fileIds, filteredItems, 5, filters),
        true
      )
    })

    it('should return false when all files remain visible after filtering', () => {
      const filters: IFileListFilterState = {
        filterText: 'src',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: true,
        isDeletedFile: false,
      }

      const fileIds = ['file1', 'file2']
      const filteredItems = new Map([
        ['file1', {} as IChangesListItem],
        ['file2', {} as IChangesListItem],
      ])

      assert.equal(
        isCommittingFileHiddenByFilter(fileIds, filteredItems, 2, filters),
        false
      )
    })
  })

  describe('getNoResultsMessage', () => {
    it('should return undefined when no filters active', () => {
      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      assert.equal(getNoResultsMessage(filters), undefined)
    })

    it('should return message with text filter', () => {
      const filters: IFileListFilterState = {
        filterText: 'test',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      const message = getNoResultsMessage(filters)
      assert(message?.includes('"test"'))
    })

    it('should return message with multiple filters', () => {
      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: true,
        isExcludedFromCommit: false,
        isNewFile: true,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      const message = getNoResultsMessage(filters)
      assert(message?.includes('Included in commit'))
      assert(message?.includes('New files'))
    })

    it('should format three or more filters with commas and and', () => {
      const filters: IFileListFilterState = {
        filterText: 'src',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: true,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: true,
        isDeletedFile: true,
      }

      assert.equal(
        getNoResultsMessage(filters),
        `Sorry, I can't find any changed files matching the following filters: "src", Included in commit, Modified files, and Deleted files`
      )
    })
  })

  describe('hasActiveFilters', () => {
    it('should return false when no text or filter options are active', () => {
      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: false,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      assert.equal(hasActiveFilters(filters), false)
    })

    it('should return true when either text or filter options are active', () => {
      assert.equal(
        hasActiveFilters({
          filterText: 'src',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: false,
          isNewFile: false,
          isModifiedFile: false,
          isDeletedFile: false,
        }),
        true
      )

      assert.equal(
        hasActiveFilters({
          filterText: '',
          useRegex: false,
          caseSensitive: false,
          excludeText: '',
          isIncludedInCommit: false,
          isExcludedFromCommit: false,
          isNewFile: false,
          isModifiedFile: true,
          isDeletedFile: false,
        }),
        true
      )
    })
  })

  describe('applyFilters', () => {
    it('should bypass filter logic when the changes filter is hidden', () => {
      const item = createTestItem(
        'deleted.txt',
        AppFileStatusKind.Deleted,
        DiffSelectionType.All
      )

      const filters: IFileListFilterState = {
        filterText: '',
        useRegex: false,
        caseSensitive: false,
        excludeText: '',
        isIncludedInCommit: false,
        isExcludedFromCommit: false,
        isNewFile: true,
        isModifiedFile: false,
        isDeletedFile: false,
      }

      assert.equal(applyFilters(item, false, filters), true)
      assert.equal(applyFilters(item, true, filters), false)
    })
  })
})

describe('regex mode', () => {
  const regexFilters = (
    overrides: Partial<IFileListFilterState>
  ): IFileListFilterState => ({
    filterText: '',
    isIncludedInCommit: false,
    isExcludedFromCommit: false,
    isNewFile: false,
    isModifiedFile: false,
    isDeletedFile: false,
    useRegex: true,
    caseSensitive: false,
    excludeText: '',
    ...overrides,
  })

  const item = (path: string) =>
    createTestItem(path, AppFileStatusKind.Modified, DiffSelectionType.All)

  it('applies the include regex to the full path', () => {
    const filters = regexFilters({ filterText: '^app/src/' })
    assert.equal(applyFilters(item('app/src/a.ts'), true, filters), true)
    assert.equal(applyFilters(item('app/test/a.ts'), true, filters), false)
  })

  it('applies the exclude regex', () => {
    const filters = regexFilters({ excludeText: '/test/' })
    assert.equal(applyFilters(item('app/src/a.ts'), true, filters), true)
    assert.equal(applyFilters(item('app/test/a.ts'), true, filters), false)
  })

  it('combines regex with the status filters (AND)', () => {
    const filters = regexFilters({ filterText: '\\.ts$', isNewFile: true })
    assert.equal(applyFilters(item('app/src/a.ts'), true, filters), false)
  })

  it('does not apply the regex when regex mode is off', () => {
    const filters = regexFilters({ useRegex: false, filterText: '^nomatch$' })
    // Plain mode leaves text matching to the fuzzy list filter
    assert.equal(applyFilters(item('app/src/a.ts'), true, filters), true)
  })

  it('counts a non-empty exclude pattern as an active filter', () => {
    assert.equal(hasActiveFilters(regexFilters({ excludeText: 'x' })), true)
    assert.equal(
      hasActiveFilters(regexFilters({ useRegex: false, excludeText: 'x' })),
      false
    )
  })

  it('describes regex filters in the no-results message', () => {
    const message = getNoResultsMessage(
      regexFilters({ filterText: '\\.ts$', excludeText: 'tests?' })
    )
    assert.ok(message?.includes('regex /\\.ts$/'))
    assert.ok(message?.includes('excluding regex /tests?/'))
  })
})
