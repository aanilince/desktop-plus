import { git } from './core'
import { Repository } from '../../models/repository'
import { IGitSearchTerms } from '../commit-search-filter'

/** Characters that make a `file:` term a pathspec glob instead of one path. */
const globCharacters = /[*?[]/

/**
 * Ask git for every commit reachable from `revisions` that matches the given
 * git-backed search terms:
 *
 *  - `content` -> `git log -S` (commits adding/removing that exact text)
 *  - `regex`   -> `git log -G` (commits whose changed lines match the regex)
 *  - `file`    -> commits touching that path. A plain path is followed across
 *                 renames (`--follow`); a path with glob characters is passed
 *                 as a pathspec and is not followed.
 *
 * Several terms must all match, so each pickaxe runs on its own (git does not
 * allow -S and -G together) and the results are intersected.
 *
 * The whole history is searched, not just the part of it that is loaded in the
 * UI, so the answer does not depend on how far the user has scrolled.
 *
 * An unusable query (unborn HEAD, invalid regex) matches nothing.
 *
 * @param revisions Revisions to search from, e.g. `['HEAD']`. Pass `'all'` to
 *                  search every branch and tag instead.
 */
export async function searchCommitShas(
  repository: Repository,
  terms: IGitSearchTerms,
  revisions: ReadonlyArray<string> | 'all'
): Promise<ReadonlySet<string>> {
  const pickaxes = new Array<string | null>()
  if (terms.content !== null) {
    pickaxes.push(`-S${terms.content}`)
  }
  if (terms.regex !== null) {
    pickaxes.push(`-G${terms.regex}`)
  }
  if (pickaxes.length === 0) {
    pickaxes.push(null)
  }

  const runs = await Promise.all(
    pickaxes.map(pickaxe =>
      runLogSearch(repository, pickaxe, terms.file, revisions)
    )
  )

  return runs.reduce((acc, next) => {
    const intersection = new Set<string>()
    for (const sha of acc) {
      if (next.has(sha)) {
        intersection.add(sha)
      }
    }
    return intersection
  })
}

async function runLogSearch(
  repository: Repository,
  pickaxe: string | null,
  file: string | null,
  revisions: ReadonlyArray<string> | 'all'
): Promise<ReadonlySet<string>> {
  const args = ['log', '--format=%H', '--no-color', '--no-show-signature']

  if (pickaxe !== null) {
    args.push(pickaxe)
  }

  // Users on Windows will type backslashes; git pathspecs use forward slashes.
  const path = file === null ? null : file.replace(/\\/g, '/')
  const isGlob = path !== null && globCharacters.test(path)

  if (path !== null && !isGlob) {
    args.push('--follow')
  }

  if (revisions === 'all') {
    args.push('--all')
  }

  args.push('--end-of-options')

  if (revisions !== 'all') {
    args.push(...revisions)
  }

  args.push('--')

  if (path !== null) {
    // `:(literal)` stops characters like `:` or `!` at the start of a name
    // from being read as pathspec magic.
    args.push(isGlob ? path : `:(literal)${path}`)
  }

  const result = await git(args, repository.path, 'searchCommitShas', {
    // 128: unborn HEAD or an invalid -G regex
    successExitCodes: new Set([0, 128]),
  })

  if (result.exitCode === 128) {
    return new Set()
  }

  return new Set(result.stdout.split('\n').filter(sha => sha.length > 0))
}
