/* eslint-disable no-sync */
import { readdirSync, readlinkSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'

const maxListedViolations = 20

function isInside(root: string, target: string) {
  const rel = relative(root, target)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function findNonRelocatableSymlinks(root: string, dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(entryPath)
      if (isAbsolute(target) || !isInside(root, resolve(dir, target))) {
        out.push(`${entryPath} -> ${target}`)
      }
    } else if (entry.isDirectory()) {
      findNonRelocatableSymlinks(root, entryPath, out)
    }
  }
}

/**
 * Throws if any symlink under `root` is absolute or points outside `root`.
 *
 * Such links only resolve on the machine that built the app, so shipping them
 * breaks the app once it's installed elsewhere.
 */
export function assertRelocatableSymlinks(root: string): void {
  const resolvedRoot = resolve(root)
  const violations = new Array<string>()
  findNonRelocatableSymlinks(resolvedRoot, resolvedRoot, violations)

  if (violations.length === 0) {
    return
  }

  const listed = violations.slice(0, maxListedViolations)
  const remaining = violations.length - listed.length
  throw new Error(
    `Found ${violations.length} symlink(s) in ${resolvedRoot} that are absolute or point outside of it. ` +
      `They would break on users' machines:\n  ${listed.join('\n  ')}` +
      (remaining > 0 ? `\n  …and ${remaining} more` : '')
  )
}
