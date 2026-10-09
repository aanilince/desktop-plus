import {
  gitSearchTermsKey,
  IGitMatchedShas,
  IGitSearchMatches,
  IGitSearchTerms,
} from './commit-search-filter'

interface IFindGitSearchMatchesOptions {
  readonly terms: IGitSearchTerms

  /** Revisions to search from, or 'all' for every branch and tag. */
  readonly revisions: ReadonlyArray<string> | 'all'

  /** The answer the state already holds, if any. */
  readonly existing: IGitSearchMatches | null

  /**
   * Aborted when the query being answered is no longer the one the user wants,
   * so a search that is still running can be stopped.
   */
  readonly signal: AbortSignal

  /** Ask git for the commits matching the terms. */
  readonly search: (
    terms: IGitSearchTerms,
    revisions: ReadonlyArray<string> | 'all',
    signal: AbortSignal
  ) => Promise<IGitMatchedShas>

  /** Resolves once typing has paused, so git isn't asked on every keystroke. */
  readonly waitForTypingToPause: () => Promise<void>
}

/**
 * Work out git's answer for a query's git terms, without asking git again if
 * `existing` already answers them for the same revisions.
 *
 * Returns 'superseded' if the query changed while waiting, in which case a
 * newer search is responsible for the answer and nothing should be stored.
 */
export async function findGitSearchMatches({
  terms,
  revisions,
  existing,
  signal,
  search,
  waitForTypingToPause,
}: IFindGitSearchMatchesOptions): Promise<IGitSearchMatches | 'superseded'> {
  const termsKey = gitSearchTermsKey(terms)
  const scopeKey = revisions === 'all' ? revisions : revisions.join('\0')

  if (existing?.termsKey === termsKey && existing.scopeKey === scopeKey) {
    return existing
  }

  await waitForTypingToPause()
  if (signal.aborted) {
    return 'superseded'
  }

  const shas = await search(terms, revisions, signal)
  if (signal.aborted) {
    return 'superseded'
  }

  return { termsKey, scopeKey, shas }
}
