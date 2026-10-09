import { Commit } from '../models/commit'

export const AuthorFilterPrefix = 'author:'
export const ContentFilterPrefix = 'content:'
export const RegexFilterPrefix = 'regex:'
export const FileFilterPrefix = 'file:'
/** A bare `scope:all` term makes the git-backed terms search all branches. */
export const AllBranchesTerm = 'scope:all'
/** A bare `case:match` term makes `content:` and `regex:` case-sensitive. */
export const MatchCaseTerm = 'case:match'

const flagTerms = [AllBranchesTerm, MatchCaseTerm]

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
  /** Search every branch and tag instead of just what the views show */
  readonly allBranches: boolean
  /** Match `content` and `regex` with their exact case (else ignore case) */
  readonly matchCase: boolean
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

type ValueTerm = 'content' | 'regex' | 'file'

const gitPrefixes: ReadonlyArray<[string, ValueTerm]> = [
  [ContentFilterPrefix, 'content'],
  [RegexFilterPrefix, 'regex'],
  [FileFilterPrefix, 'file'],
]

/**
 * Read a double-quoted value starting at the opening quote. `\"` and `\\` are
 * escapes, and a quote that is never closed (the user is still typing) runs to
 * the end of the query.
 */
function readQuotedValue(query: string, openQuote: number) {
  let value = ''
  let i = openQuote + 1
  while (i < query.length) {
    const c = query[i]
    const next = query[i + 1]
    if (c === '\\' && (next === '"' || next === '\\')) {
      value += next
      i += 2
    } else if (c === '"') {
      return { value, end: i + 1 }
    } else {
      value += c
      i++
    }
  }
  return { value, end: query.length }
}

/** Quote a value so `readQuotedValue` gives back exactly `value`. */
export function quoteSearchValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Split a raw commit search query into its 'author:' terms, its git-backed
 * terms ('content:', 'regex:', 'file:') and the free text left over.
 */
export function parseCommitSearchFilter(query: string): ICommitSearchFilter {
  const lowercaseQuery = query.toLowerCase()
  const hasGitPrefix =
    flagTerms.some(flag => lowercaseQuery.includes(flag)) ||
    gitPrefixes.some(([prefix]) => lowercaseQuery.includes(prefix))

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

  let valueTerms: Record<ValueTerm, string | null> = {
    content: null,
    regex: null,
    file: null,
  }
  let allBranches = false
  let matchCase = false

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

      const flag = flagTerms.find(
        term =>
          lowercaseQuery.startsWith(term, i) &&
          (i + term.length >= query.length || /\s/.test(query[i + term.length]))
      )
      if (flag !== undefined) {
        allBranches ||= flag === AllBranchesTerm
        matchCase ||= flag === MatchCaseTerm
        i += flag.length
        continue
      }

      const gitPrefix = gitPrefixes.find(([prefix]) =>
        lowercaseQuery.startsWith(prefix, i)
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
        ;({ value, end } = readQuotedValue(query, valueStart))
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
        valueTerms = { ...valueTerms, [key]: value }
      }
      i = end
    }
  }

  const hasGitTerms =
    valueTerms.content !== null ||
    valueTerms.regex !== null ||
    valueTerms.file !== null

  return {
    queryTextLowercase: textTerms.join(' '),
    authorEmailsLowercase: authorEmails,
    // `scope:all` and `case:match` only tune a git search, they aren't one
    gitTerms: hasGitTerms ? { ...valueTerms, allBranches, matchCase } : null,
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

/** What the text typed in the search box is looked for in. */
export type CommitSearchMode =
  /** The commit message, author, tags and SHA */
  | 'message'
  /** The code the commit adds or removes, as exact text */
  | 'content'
  /** The code the commit adds or removes, as a regular expression */
  | 'regex'

/** The search settings chosen with buttons rather than typed in the box. */
export interface ICommitSearchOptions {
  readonly mode: CommitSearchMode
  /** Only commits touching this file (renames are followed). Empty: any. */
  readonly file: string
  /** Search all branches instead of just what the views show */
  readonly allBranches: boolean
  /** Match the code searched for with its exact case (else ignore case) */
  readonly matchCase: boolean
}

export const DefaultCommitSearchOptions: ICommitSearchOptions = {
  mode: 'message',
  file: '',
  allBranches: false,
  matchCase: false,
}

/** Whether any option differs from the default (to flag the button as active). */
export function hasCustomCommitSearchOptions(options: ICommitSearchOptions) {
  return (
    options.mode !== DefaultCommitSearchOptions.mode ||
    options.file.trim() !== '' ||
    options.allBranches ||
    options.matchCase
  )
}

/**
 * Combine the text typed in the search box with the options chosen with
 * buttons into the query string the filtering works on, so the box itself
 * never has to show keywords like `content:`.
 *
 * `author:` terms stay terms in every mode; the rest of the text becomes the
 * code to look for in the 'content' and 'regex' modes.
 */
export function buildCommitSearchQuery(
  text: string,
  options: ICommitSearchOptions
): string {
  const file = options.file.trim()
  if (options.mode === 'message' && file === '') {
    return text
  }

  const terms = new Array<string>()
  let hasGitTerm = file !== ''
  let searchesCode = false

  if (options.mode === 'message') {
    terms.push(text.trim())
  } else {
    const authorTerms = new Array<string>()
    const rest = text
      .replace(/(^|\s)(author:\S+)/gi, (_match, _space, term: string) => {
        authorTerms.push(term)
        return ' '
      })
      .trim()

    terms.push(...authorTerms)
    if (rest !== '') {
      const prefix =
        options.mode === 'content' ? ContentFilterPrefix : RegexFilterPrefix
      terms.push(`${prefix}${quoteSearchValue(rest)}`)
      hasGitTerm = true
      searchesCode = true
    }
  }

  if (file !== '') {
    // git pathspecs use forward slashes, whatever the platform
    terms.push(
      `${FileFilterPrefix}${quoteSearchValue(file.replace(/\\/g, '/'))}`
    )
  }

  if (options.allBranches && hasGitTerm) {
    terms.push(AllBranchesTerm)
  }

  if (options.matchCase && searchesCode) {
    terms.push(MatchCaseTerm)
  }

  return terms.filter(term => term !== '').join(' ')
}

/** A stable key identifying a set of git terms, for caching their results. */
export function gitSearchTermsKey(terms: IGitSearchTerms): string {
  return JSON.stringify([
    terms.content,
    terms.regex,
    terms.file,
    terms.allBranches,
    terms.matchCase,
  ])
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
