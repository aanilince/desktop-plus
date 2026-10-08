import { Commit } from '../models/commit'

export const AuthorFilterPrefix = 'author:'
export const ContentFilterPrefix = 'content:'
export const RegexFilterPrefix = 'regex:'
export const FileFilterPrefix = 'file:'

/**
 * Terms that can only be answered by asking git (they look at the diffs or
 * the paths touched by a commit, not at the commit metadata we have loaded).
 */
export interface IGitSearchTerms {
  /** Commits adding or removing this exact text (`git log -S`) */
  readonly content: string | null
  /** Commits adding or removing text matching this regex (`git log -G`) */
  readonly regex: string | null
  /** Commits touching this path, following renames (`git log --follow`) */
  readonly file: string | null
}

export interface ICommitSearchFilter {
  readonly queryTextLowercase: string
  readonly authorEmailsLowercase: ReadonlySet<string>
  /** The git-backed terms in the query, or null if there are none. */
  readonly gitTerms: IGitSearchTerms | null
  /**
   * The SHAs git reported for `gitTerms`, or null if they are not known (yet).
   * Only meaningful when `gitTerms` is not null.
   */
  readonly gitMatchedShas: ReadonlySet<string> | null
}

const emptyAuthorEmails: ReadonlySet<string> = new Set()

const gitPrefixes: ReadonlyArray<[string, keyof IGitSearchTerms]> = [
  [ContentFilterPrefix, 'content'],
  [RegexFilterPrefix, 'regex'],
  [FileFilterPrefix, 'file'],
]

/**
 * Split a raw commit search query into its 'author:' terms, its git-backed
 * terms ('content:', 'regex:', 'file:') and the free text left over.
 */
export function parseCommitSearchFilter(query: string): ICommitSearchFilter {
  const lowercaseQuery = query.toLowerCase()
  const hasGitPrefix = gitPrefixes.some(([prefix]) =>
    lowercaseQuery.includes(prefix)
  )

  if (!hasGitPrefix && !lowercaseQuery.includes(AuthorFilterPrefix)) {
    return {
      queryTextLowercase: lowercaseQuery,
      authorEmailsLowercase: emptyAuthorEmails,
      gitTerms: null,
      gitMatchedShas: null,
    }
  }

  const authorEmails = new Set<string>()
  const textTerms = new Array<string>()
  const addTerm = (term: string) => {
    if (term.startsWith(AuthorFilterPrefix)) {
      const email = term.substring(AuthorFilterPrefix.length)

      if (email.length === 0) {
        textTerms.push(term)
      } else {
        authorEmails.add(email)
      }
    } else if (term.length > 0) {
      textTerms.push(term)
    }
  }

  let gitTerms: { -readonly [K in keyof IGitSearchTerms]: string | null } = {
    content: null,
    regex: null,
    file: null,
  }

  if (!hasGitPrefix) {
    lowercaseQuery.split(/\s+/).forEach(addTerm)
  } else {
    // Git terms keep their case and may be quoted ('content:"two words"'), so
    // tokenize the original query instead of just splitting on whitespace.
    let i = 0
    while (i < query.length) {
      if (/\s/.test(query[i])) {
        i++
        continue
      }

      const gitPrefix = gitPrefixes.find(
        ([prefix]) => lowercaseQuery.substr(i, prefix.length) === prefix
      )

      if (gitPrefix === undefined) {
        let end = i
        while (end < query.length && !/\s/.test(query[end])) {
          end++
        }
        addTerm(lowercaseQuery.substring(i, end))
        i = end
        continue
      }

      const [prefix, key] = gitPrefix
      const valueStart = i + prefix.length
      let value: string
      let end: number

      if (query[valueStart] === '"') {
        const close = query.indexOf('"', valueStart + 1)
        end = close === -1 ? query.length : close + 1
        value = query.substring(valueStart + 1, close === -1 ? end : close)
      } else {
        end = valueStart
        while (end < query.length && !/\s/.test(query[end])) {
          end++
        }
        value = query.substring(valueStart, end)
      }

      if (value.length === 0) {
        // Still being typed: keep it searchable as plain text.
        addTerm(lowercaseQuery.substring(i, end))
      } else {
        gitTerms = { ...gitTerms, [key]: value }
      }
      i = end
    }
  }

  const hasGitTerms =
    gitTerms.content !== null ||
    gitTerms.regex !== null ||
    gitTerms.file !== null

  return {
    queryTextLowercase: textTerms.join(' '),
    authorEmailsLowercase: authorEmails,
    gitTerms: hasGitTerms ? gitTerms : null,
    gitMatchedShas: null,
  }
}

/** Attach the SHAs git found for the filter's git terms. */
export function withGitSearchMatches(
  filter: ICommitSearchFilter,
  gitMatchedShas: ReadonlySet<string>
): ICommitSearchFilter {
  return { ...filter, gitMatchedShas }
}

/** What git answered for a query's git terms, kept in the compare state. */
export interface IGitSearchMatches {
  /** Which terms these matches answer (see `gitSearchTermsKey`) */
  readonly termsKey: string
  /** Which revisions were searched, to know when the answer is out of date */
  readonly scopeKey: string
  readonly shas: ReadonlySet<string>
}

/**
 * Parse a query and attach git's answer for its git terms, if `gitMatches`
 * has one for exactly those terms.
 */
export function resolveCommitSearchFilter(
  query: string,
  gitMatches: IGitSearchMatches | null
): ICommitSearchFilter {
  const filter = parseCommitSearchFilter(query)
  if (
    filter.gitTerms !== null &&
    gitMatches !== null &&
    gitMatches.termsKey === gitSearchTermsKey(filter.gitTerms)
  ) {
    return withGitSearchMatches(filter, gitMatches.shas)
  }
  return filter
}

/**
 * The search query that shows the history of a single file, e.g. what the
 * "Show history of this file" menu items put in the search box.
 *
 * A path containing a double quote can't be quoted and is not supported.
 */
export function fileHistorySearchQuery(path: string): string {
  // git pathspecs use forward slashes, whatever the platform
  const normalized = path.replace(/\\/g, '/')
  return /\s/.test(normalized)
    ? `${FileFilterPrefix}"${normalized}"`
    : `${FileFilterPrefix}${normalized}`
}

/** A stable key identifying a set of git terms, for caching their results. */
export function gitSearchTermsKey(terms: IGitSearchTerms): string {
  return JSON.stringify([terms.content, terms.regex, terms.file])
}

function gitTermsEqual(a: IGitSearchTerms | null, b: IGitSearchTerms | null) {
  if (a === null || b === null) {
    return a === b
  }
  return gitSearchTermsKey(a) === gitSearchTermsKey(b)
}

/** Whether the filter places no restriction at all on the commits shown. */
export function isCommitSearchFilterEmpty(filter: ICommitSearchFilter) {
  return (
    filter.queryTextLowercase.length === 0 &&
    filter.authorEmailsLowercase.size === 0 &&
    filter.gitTerms === null
  )
}

/** Whether the given commit should be included in the results of the filter. */
export function commitMatchesSearchFilter(
  commit: Commit | undefined,
  filter: ICommitSearchFilter
): boolean {
  if (commit === undefined) {
    return false
  }

  const { queryTextLowercase: queryText, authorEmailsLowercase: authorEmails } =
    filter

  // Until git answers, a git-backed query matches nothing rather than
  // flashing results that would then disappear.
  if (
    filter.gitTerms !== null &&
    (filter.gitMatchedShas === null || !filter.gitMatchedShas.has(commit.sha))
  ) {
    return false
  }

  if (
    authorEmails.size > 0 &&
    !authorEmails.has(commit.author.email.toLowerCase())
  ) {
    return false
  }

  return (
    queryText.length === 0 ||
    commit.summary.toLowerCase().includes(queryText) ||
    commit.body.toLowerCase().includes(queryText) ||
    commit.tags.some(tag => tag.toLowerCase().startsWith(queryText)) ||
    commit.sha.toLowerCase().startsWith(queryText)
  )
}

/**
 * Whether re-running 'next' over the results of 'prev' yields the same answer
 * as re-running it over every commit.
 */
export function canNarrowExistingResults(prev: string, next: string) {
  if (!next.startsWith(prev)) {
    return false
  }

  const prevFilter = parseCommitSearchFilter(prev)
  const nextFilter = parseCommitSearchFilter(next)
  const prevEmails = prevFilter.authorEmailsLowercase
  const nextEmails = nextFilter.authorEmailsLowercase
  return (
    prevEmails.size === nextEmails.size &&
    [...prevEmails].every(email => nextEmails.has(email)) &&
    gitTermsEqual(prevFilter.gitTerms, nextFilter.gitTerms)
  )
}
