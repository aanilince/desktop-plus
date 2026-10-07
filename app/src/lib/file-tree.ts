import { AppFileStatus, AppFileStatusKind } from '../models/status'
import { IMatches } from './fuzzy-find'

/** A folder or file row in a file tree view. */
export type FileTreeRow<T> =
  | {
      readonly kind: 'folder'
      /** Repository-relative path of the folder, used as its identity */
      readonly path: string
      /** Display name; single-child folder chains are compacted ("a/b/c") */
      readonly name: string
      readonly depth: number
      /** All files contained in the folder, including nested ones */
      readonly files: ReadonlyArray<T>
      readonly collapsed: boolean
    }
  | { readonly kind: 'file'; readonly file: T; readonly depth: number }

interface IFolderNode<T> {
  readonly folders: Map<string, IFolderNode<T>>
  readonly files: Array<T>
}

const newNode = <T>(): IFolderNode<T> => ({ folders: new Map(), files: [] })

function collectFiles<T>(node: IFolderNode<T>, out: Array<T> = []) {
  out.push(...node.files)
  node.folders.forEach(child => collectFiles(child, out))
  return out
}

/**
 * Turn a flat list of (forward slash separated) file paths into depth-first
 * tree rows. Each folder lists its subfolders first, then its direct files.
 * Contents of folders in `collapsed` are omitted.
 */
export function buildFileTreeRows<T extends { readonly path: string }>(
  files: ReadonlyArray<T>,
  collapsed: ReadonlySet<string>
): ReadonlyArray<FileTreeRow<T>> {
  const root = newNode<T>()

  for (const file of files) {
    let node = root
    for (const part of file.path.split('/').slice(0, -1)) {
      let child = node.folders.get(part)
      if (child === undefined) {
        child = newNode<T>()
        node.folders.set(part, child)
      }
      node = child
    }
    node.files.push(file)
  }

  const rows = new Array<FileTreeRow<T>>()

  const walk = (node: IFolderNode<T>, prefix: string, depth: number) => {
    for (const [folderName, child] of node.folders) {
      let name = folderName
      let folder = child
      while (folder.files.length === 0 && folder.folders.size === 1) {
        const [[nextName, next]] = folder.folders
        name += `/${nextName}`
        folder = next
      }

      const path = prefix + name
      const isCollapsed = collapsed.has(path)
      rows.push({
        kind: 'folder',
        path,
        name,
        depth,
        files: collectFiles(folder),
        collapsed: isCollapsed,
      })

      if (!isCollapsed) {
        walk(folder, `${path}/`, depth + 1)
      }
    }

    for (const file of node.files) {
      rows.push({ kind: 'file', file, depth })
    }
  }

  walk(root, '', 0)
  return rows
}

/** The given folder and every folder nested in it, as shown in the tree */
export function getNestedFolderPaths(
  files: ReadonlyArray<{ readonly path: string }>,
  folder: string
): ReadonlyArray<string> {
  const paths = new Array<string>()
  for (const row of buildFileTreeRows(files, new Set())) {
    if (
      row.kind === 'folder' &&
      (row.path === folder || row.path.startsWith(`${folder}/`))
    ) {
      paths.push(row.path)
    }
  }
  return paths
}

const fileName = (path: string) => path.substring(path.lastIndexOf('/') + 1)
const dirName = (path: string) => path.substring(0, path.lastIndexOf('/'))

/**
 * The label of a file row in a tree, which only shows the file name. For
 * renames the old name is shortened too when the folder is the same, and
 * highlighted characters are shifted to the file name.
 */
export function getTreeFileLabel<
  T extends { path: string; status: AppFileStatus; matches?: IMatches }
>(label: T): T {
  const { path, status, matches } = label
  const offset = path.length - fileName(path).length
  return {
    ...label,
    path: fileName(path),
    status:
      (status.kind === AppFileStatusKind.Renamed ||
        status.kind === AppFileStatusKind.Copied) &&
      dirName(status.oldPath) === dirName(path)
        ? { ...status, oldPath: fileName(status.oldPath) }
        : status,
    matches: matches && {
      title: matches.title.filter(i => i >= offset).map(i => i - offset),
      subtitle: matches.subtitle,
    },
  }
}
