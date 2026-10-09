import * as fuzzAldrin from 'fuzzaldrin-plus'

/**
 * The paths that best match what the user has typed so far, like the box of a
 * "quick open" command: fuzzy, case-insensitive and aware of path separators.
 *
 * Nothing is suggested for an empty query, so a big repository's whole file
 * list is never shown.
 */
export function suggestFilePaths(
  paths: ReadonlyArray<string>,
  query: string,
  limit = 10
): ReadonlyArray<string> {
  // Paths from git use forward slashes, whatever the platform
  const normalized = query.trim().replace(/\\/g, '/')
  if (normalized === '') {
    return []
  }

  return fuzzAldrin.filter(paths as string[], normalized, {
    maxResults: limit,
  })
}
