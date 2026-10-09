import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * The paths of every file git tracks in the repository, relative to its root
 * and with forward slashes. Empty for a repository without commits.
 */
export async function getTrackedFilePaths(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  // -z: NUL-separated and unquoted, so names with spaces or non-ASCII
  // characters come back exactly as they are on disk.
  const result = await git(['ls-files', '-z'], repository.path, 'lsFiles', {
    successExitCodes: new Set([0, 128]),
  })

  if (result.exitCode !== 0) {
    return []
  }

  return result.stdout.split('\0').filter(path => path !== '')
}
