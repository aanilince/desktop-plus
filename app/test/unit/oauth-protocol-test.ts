import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = join(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(join(projectRoot, path), 'utf8')

// GitHub sends the browser back to the callback URL registered in the OAuth
// app, `<scheme>://oauth`. The app has to register that same scheme with the
// operating system in every place it can, or the sign-in never gets back to it.
// The official GitHub Desktop uses x-github-desktop-auth, so using it as well
// would let the two apps steal each other's sign-ins.
const ProductionAuthScheme = 'x-pickaxe-auth'
const OfficialAuthScheme = 'x-github-desktop-auth'

const places = [
  'app/src/main-process/main.ts',
  'script/build.ts',
  'script/package-appimage.ts',
  'script/package-debian.ts',
  'script/package-redhat.ts',
]

describe('GitHub sign-in URL scheme', () => {
  for (const place of places) {
    it(`is registered in ${place}`, () => {
      assert.ok(read(place).includes(ProductionAuthScheme))
    })

    it(`does not claim GitHub Desktop's scheme in ${place}`, () => {
      // x-github-desktop-dev-auth is the development scheme and is fine
      assert.ok(!read(place).includes(`${OfficialAuthScheme}`))
    })
  }
})
