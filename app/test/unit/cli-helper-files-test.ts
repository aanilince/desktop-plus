import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const appRoot = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(appRoot, path), 'utf8')

// The command line helpers are copied from app/static/<platform>/ into the
// packaged app, and several places refer to them by file name. Renaming the
// app once left the macOS helper behind, which silently broke installing the
// command line tool.
describe('command line helper files', () => {
  const referencedBy: ReadonlyArray<[string, string]> = [
    ['src/ui/lib/install-cli.ts', 'darwin'],
    ['src/main-process/squirrel-updater.ts', 'win32'],
    ['src/main-process/squirrel-updater.ts', 'linux'],
  ]

  for (const [source, platform] of referencedBy) {
    it(`finds the ${platform} helper that ${source} refers to`, () => {
      const names = [...read(source).matchAll(/[\w-]+-cli(?:\.sh|\.bat)?\b/g)]
        .map(m => m[0])
        .filter(name => !name.startsWith('install'))

      const dir = join(appRoot, 'static', platform)
      const platformNames = names.filter(name =>
        platform === 'darwin'
          ? name.endsWith('.sh')
          : platform === 'win32'
          ? name.endsWith('.bat') || name.endsWith('.sh')
          : !name.includes('.')
      )

      assert.ok(
        platformNames.length > 0,
        `${source} names no ${platform} helper`
      )
      for (const name of platformNames) {
        assert.ok(existsSync(join(dir, name)), `${join(dir, name)} is missing`)
      }
    })
  }

  it('uses the same helper name everywhere', () => {
    const sources = [
      'src/ui/lib/install-cli.ts',
      'src/main-process/squirrel-updater.ts',
      'src/cli/main.ts',
    ]
    const names = new Set(
      sources.flatMap(s =>
        [...read(s).matchAll(/([\w]+)-cli\b/g)]
          .map(m => m[1])
          .filter(prefix => prefix !== 'install')
      )
    )
    assert.deepEqual([...names], ['pickaxe'])
  })
})
