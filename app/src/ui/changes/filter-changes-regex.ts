export interface IRegexFilterOptions {
  readonly caseSensitive: boolean
}

export interface IRegexFilterQuery extends IRegexFilterOptions {
  /** Regex a path must match. Empty means "match everything". */
  readonly include: string
  /** Regex a path must NOT match. Empty means "exclude nothing". */
  readonly exclude: string
}

export type CompiledRegexFilter =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly error: string }
  | { readonly kind: 'valid'; readonly regex: RegExp }

/**
 * Compile a user-entered pattern. Never throws: an unparsable pattern is
 * reported as `invalid` so the UI can flag it without breaking the list.
 */
export function compileRegexFilter(
  pattern: string,
  { caseSensitive }: IRegexFilterOptions
): CompiledRegexFilter {
  if (pattern === '') {
    return { kind: 'empty' }
  }

  try {
    return {
      kind: 'valid',
      regex: new RegExp(pattern, caseSensitive ? '' : 'i'),
    }
  } catch (e) {
    return { kind: 'invalid', error: e instanceof Error ? e.message : `${e}` }
  }
}

/**
 * Whether a file path passes the include/exclude regex filter.
 *
 * Invalid patterns are ignored (treated like empty) so a half-typed regex
 * never blanks the list; the UI is responsible for showing the error.
 */
export function matchesRegexFilter(
  path: string,
  { include, exclude, caseSensitive }: IRegexFilterQuery
): boolean {
  const inc = compileRegexFilter(include, { caseSensitive })
  if (inc.kind === 'valid' && !inc.regex.test(path)) {
    return false
  }

  const exc = compileRegexFilter(exclude, { caseSensitive })
  if (exc.kind === 'valid' && exc.regex.test(path)) {
    return false
  }

  return true
}
