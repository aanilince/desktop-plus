import { git } from './core'
import { Repository } from '../../models/repository'
import { IGitMatchedShas, IGitSearchTerms } from '../commit-search-filter'

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
 * The code searches (`pickaxe`) are answered apart from the file restriction
 * (`file`) so a caller can combine them with a search git cannot do, the
 * message search. When a file is given the code searches only look at that
 * file, which also makes them far faster than reading the whole history.
 *
 * Several code searches are all required, or any one of them with
 * `terms.matchAny`; each runs on its own because git does not allow -S and -G
 * together.
 *
 * The whole history is searched, not just the part of it that is loaded in the
 * UI, so the answer does not depend on how far the user has scrolled.
 *
 * An unusable query (unborn HEAD, invalid regex) matches nothing, and so does
 * a search that was aborted.
 *
 * @param revisions Revisions to search from, e.g. `['HEAD']`. Pass `'all'` to
 *                  search every branch and tag instead.
 * @param signal    Stops the git processes when aborted (a search of a big
 *                  history can take many seconds).
 */
export async function searchCommitShas(
  repository: Repository,
  terms: IGitSearchTerms,
  revisions: ReadonlyArray<string> | 'all',
  signal?: AbortSignal
): Promise<IGitMatchedShas> {
  const pickaxes = new Array<string>()
  if (terms.content !== null) {
    pickaxes.push(`-S${terms.content}`)
  }
  if (terms.regex !== null) {
    pickaxes.push(`-G${terms.regex}`)
  }

  const [pickaxeRuns, file] = await Promise.all([
    Promise.all(
      pickaxes.map(pickaxe =>
        runLogSearch(repository, pickaxe, terms, revisions, signal)
      )
    ),
    terms.file === null
      ? null
      : runLogSearch(repository, null, terms, revisions, signal),
  ])

  return {
    pickaxe:
      pickaxeRuns.length === 0
        ? null
        : combine(pickaxeRuns, terms.matchAny ? 'union' : 'intersection'),
    file,
  }
}

function combine(
  sets: ReadonlyArray<ReadonlySet<string>>,
  how: 'union' | 'intersection'
): ReadonlySet<string> {
  return sets.reduce((acc, next) => {
    const result = new Set<string>()
    if (how === 'union') {
      acc.forEach(sha => result.add(sha))
      next.forEach(sha => result.add(sha))
    } else {
      acc.forEach(sha => next.has(sha) && result.add(sha))
    }
    return result
  })
}

async function runLogSearch(
  repository: Repository,
  pickaxe: string | null,
  { file, matchCase }: IGitSearchTerms,
  revisions: ReadonlyArray<string> | 'all',
  signal: AbortSignal | undefined
): Promise<ReadonlySet<string>> {
  const args = ['log', '--format=%H', '--no-color', '--no-show-signature']

  if (pickaxe !== null) {
    args.push(pickaxe)
    if (!matchCase) {
      args.push('--regexp-ignore-case')
    }
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

  try {
    const result = await git(args, repository.path, 'searchCommitShas', {
      // 128: unborn HEAD or an invalid -G regex
      successExitCodes: new Set([0, 128]),
      signal,
    })

    if (result.exitCode === 128) {
      return new Set()
    }

    return new Set(result.stdout.split('\n').filter(sha => sha.length > 0))
  } catch (e) {
    // An aborted search is not an error: whoever aborted it no longer wants
    // the answer.
    if (signal?.aborted) {
      return new Set()
    }
    throw e
  }
}
