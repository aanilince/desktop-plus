import * as React from 'react'
import memoizeOne from 'memoize-one'
import { mapStatus } from '../../lib/status'
import {
  buildFileTreeRows,
  FileTreeRow,
  getNestedFolderPaths,
} from '../../lib/file-tree'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'

import { CommittedFileChange } from '../../models/status'
import { ClickSource, List } from '../lib/list'
import { FileTreeFolder } from '../lib/file-tree-folder'
import { CommittedFileItem } from './committed-file-item'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFiles: ReadonlyArray<CommittedFileChange>
  readonly onSelectionChanged: (
    files: ReadonlyArray<CommittedFileChange>
  ) => void
  readonly onRowDoubleClick: (row: number, source: ClickSource) => void
  readonly availableWidth: number
  readonly onContextMenu?: (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
  /** Group files by folder in a collapsible tree */
  readonly treeView?: boolean
  /** Extra context menu items for a folder in the tree view */
  readonly getFolderContextMenuItems?: (
    path: string
  ) => ReadonlyArray<IMenuItem>
}

interface IFileListState {
  readonly focusedRow: number | null
  readonly collapsedFolders: ReadonlySet<string>
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileList extends React.Component<IFileListProps, IFileListState> {
  private getRows = memoizeOne(
    (
      files: ReadonlyArray<CommittedFileChange>,
      treeView: boolean,
      collapsedFolders: ReadonlySet<string>
    ): ReadonlyArray<FileTreeRow<CommittedFileChange>> =>
      treeView
        ? buildFileTreeRows(files, collapsedFolders)
        : files.map(file => ({ kind: 'file' as const, file, depth: 0 }))
  )

  public constructor(props: IFileListProps) {
    super(props)

    this.state = {
      focusedRow: null,
      collapsedFolders: new Set(),
    }
  }

  private get rows() {
    return this.getRows(
      this.props.files,
      this.props.treeView === true,
      this.state.collapsedFolders
    )
  }

  /** The file in the given row, or undefined for folder rows */
  private fileAt(row: number) {
    const r = this.rows[row]
    return r?.kind === 'file' ? r.file : undefined
  }

  private canSelectRow = (row: number) => this.fileAt(row) !== undefined

  private onSelectionChanged = (rows: ReadonlyArray<number>) => {
    const files = rows
      .map(r => this.fileAt(r))
      .filter((f): f is CommittedFileChange => f !== undefined)
    this.props.onSelectionChanged(files)
  }

  private onToggleCollapsed = (path: string) => {
    const collapsedFolders = new Set(this.state.collapsedFolders)
    if (!collapsedFolders.delete(path)) {
      collapsedFolders.add(path)
    }
    this.setState({ collapsedFolders })
  }

  private setCollapsedRecursively(path: string, collapsed: boolean) {
    const collapsedFolders = new Set(this.state.collapsedFolders)
    for (const p of getNestedFolderPaths(this.props.files, path)) {
      if (collapsed) {
        collapsedFolders.add(p)
      } else {
        collapsedFolders.delete(p)
      }
    }
    this.setState({ collapsedFolders })
  }

  private onFolderContextMenu = (
    path: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    const extraItems = this.props.getFolderContextMenuItems?.(path) ?? []
    showContextualMenu([
      {
        label: __DARWIN__ ? 'Expand Recursively' : 'Expand recursively',
        action: () => this.setCollapsedRecursively(path, false),
      },
      {
        label: __DARWIN__ ? 'Collapse Recursively' : 'Collapse recursively',
        action: () => this.setCollapsedRecursively(path, true),
      },
      ...(extraItems.length > 0 ? [{ type: 'separator' as const }] : []),
      ...extraItems,
    ])
  }

  private renderRow = (row: number) => {
    const r = this.rows[row]
    if (r.kind === 'folder') {
      return (
        <FileTreeFolder
          path={r.path}
          name={r.name}
          depth={r.depth}
          collapsed={r.collapsed}
          fileCount={r.files.length}
          onToggleCollapsed={this.onToggleCollapsed}
          onContextMenu={this.onFolderContextMenu}
        />
      )
    }

    return (
      <CommittedFileItem
        file={r.file}
        availableWidth={this.props.availableWidth}
        focused={this.state.focusedRow === row}
        depth={this.props.treeView ? r.depth : undefined}
      />
    )
  }

  private selectedRowsForFiles(): ReadonlyArray<number> {
    const { selectedFiles } = this.props
    const { rows } = this
    return selectedFiles
      .map(sf =>
        rows.findIndex(r => r.kind === 'file' && r.file.path === sf.path)
      )
      .filter(i => i >= 0)
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const file = this.fileAt(row)
    if (file !== undefined) {
      this.props.onContextMenu?.(file, event)
    }
  }

  private onRowDoubleClick = (row: number, source: ClickSource) => {
    const file = this.fileAt(row)
    if (file !== undefined) {
      // Callers index into their own (flat) files array
      this.props.onRowDoubleClick(this.props.files.indexOf(file), source)
    }
  }

  private getFileAriaLabel = (row: number) => {
    const r = this.rows[row]
    if (r.kind === 'folder') {
      return `${r.path} folder, ${r.collapsed ? 'collapsed' : 'expanded'}`
    }
    const { path, status } = r.file
    const fileStatus = mapStatus(status)
    return `${path} ${fileStatus}`
  }

  public render() {
    return (
      <div
        className={this.props.treeView ? 'file-list tree-view' : 'file-list'}
      >
        <List
          rowRenderer={this.renderRow}
          rowCount={this.rows.length}
          rowHeight={29}
          selectionMode="multi"
          selectedRows={this.selectedRowsForFiles()}
          canSelectRow={this.canSelectRow}
          onSelectionChanged={this.onSelectionChanged}
          onRowDoubleClick={this.onRowDoubleClick}
          onRowContextMenu={this.onRowContextMenu}
          onRowKeyboardFocus={this.onRowFocus}
          onRowBlur={this.onRowBlur}
          getRowAriaLabel={this.getFileAriaLabel}
          invalidationProps={{
            focusedRow: this.state.focusedRow,
            rows: this.rows,
          }}
        />
      </div>
    )
  }

  private onRowFocus = (row: number) => {
    this.setState({ focusedRow: row })
  }

  private onRowBlur = (row: number) => {
    if (this.state.focusedRow === row) {
      this.setState({ focusedRow: null })
    }
  }
}
