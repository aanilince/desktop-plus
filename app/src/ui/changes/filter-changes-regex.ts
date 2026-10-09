export interface IRegexFilterOptions {
  readonly caseSensitive: boolean
}

export interface IRegexFilterQuery extends IRegexFilterOptions {
  /** Regexes a path must match any of. Empty means "match everything". */
  readonly include: string
  /** Regexes a path must NOT match any of. Empty means "exclude nothing". */
  readonly exclude: string
}

export type CompiledRegexFilter =
  | { readonly kind: 'empty' }
  /** Some pattern could not be parsed; `regexes` are the ones that could. */
  | {
      readonly kind: 'invalid'
      readonly error: string
      readonly regexes: ReadonlyArray<RegExp>
    }
  | { readonly kind: 'valid'; readonly regexes: ReadonlyArray<RegExp> }

/**
 * Split a list of patterns on its commas, e.g. `test, lock, json`.
 *
 * A comma is kept as part of its pattern when it is escaped (`\,`) or inside
 * a group, character class or quantifier (`(a,b)`, `[a,b]`, `a{1,2}`).
 * Surrounding whitespace and empty items are dropped.
 */
export function splitRegexList(list: string): ReadonlyArray<string> {
  const patterns = new Array<string>()
  let current = ''
  let depth = 0
  let inCharacterClass = false

  for (let i = 0; i < list.length; i++) {
    const c = list[i]

    if (c === '\\') {
      current += c + (list[i + 1] ?? '')
      i++
      continue
    }

    if (inCharacterClass) {
      inCharacterClass = c !== ']'
    } else if (c === '[') {
      inCharacterClass = true
    } else if (c === '(' || c === '{') {
      depth++
    } else if ((c === ')' || c === '}') && depth > 0) {
      depth--
    } else if (c === ',' && depth === 0) {
      patterns.push(current)
      current = ''
      continue
    }

    current += c
  }
  patterns.push(current)

  return patterns.map(p => p.trim()).filter(p => p !== '')
}

/**
 * Compile a user-entered, comma-separated list of patterns. Never throws: a
 * pattern that can't be parsed is reported as `invalid` (with the error of the
 * first bad one) so the UI can flag it without breaking the list, and the
 * patterns that did parse are still returned.
 */
export function compileRegexFilter(
  list: string,
  { caseSensitive }: IRegexFilterOptions
): CompiledRegexFilter {
  const patterns = splitRegexList(list)
  if (patterns.length === 0) {
    return { kind: 'empty' }
  }

  const regexes = new Array<RegExp>()
  let error: string | null = null

  for (const pattern of patterns) {
    try {
      regexes.push(new RegExp(pattern, caseSensitive ? '' : 'i'))
    } catch (e) {
      error ??= e instanceof Error ? e.message : `${e}`
    }
  }

  return error === null
    ? { kind: 'valid', regexes }
    : { kind: 'invalid', error, regexes }
}

/**
 * Whether a file path passes the include/exclude regex filter.
 *
 * Patterns that can't be parsed are ignored so a half-typed regex never blanks
 * the list; the UI is responsible for showing the error.
 */
export function matchesRegexFilter(
  path: string,
  { include, exclude, caseSensitive }: IRegexFilterQuery
): boolean {
  const inc = compileRegexFilter(include, { caseSensitive })
  if (
    inc.kind !== 'empty' &&
    inc.regexes.length > 0 &&
    !inc.regexes.some(regex => regex.test(path))
  ) {
    return false
  }

  const exc = compileRegexFilter(exclude, { caseSensitive })
  if (exc.kind !== 'empty' && exc.regexes.some(regex => regex.test(path))) {
    return false
  }

  return true
}
