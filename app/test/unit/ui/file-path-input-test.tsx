import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { FilePathInput } from '../../../src/ui/history/file-path-input'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const paths = [
  'app/src/ui/history/compare.tsx',
  'app/src/ui/history/commit-list.tsx',
  'app/src/lib/commit-search-filter.ts',
  'README.md',
]

function setup(value = '') {
  const committed = new Array<string>()
  let loads = 0
  const props = {
    label: 'File',
    value,
    onValueCommitted: (path: string) => committed.push(path),
    loadPaths: async () => {
      loads++
      return paths
    },
  }
  const view = render(<FilePathInput {...props} />)
  const input = screen.getByRole('textbox') as HTMLInputElement

  const type = async (text: string) => {
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: text } })
    await waitFor(() => assert.ok(loads > 0))
  }

  return { view, input, committed, type, getLoads: () => loads, props }
}

const options = () => screen.queryAllByRole('option')

describe('FilePathInput', () => {
  it('loads the paths once, when first focused', async () => {
    const { input, getLoads } = setup()
    assert.equal(getLoads(), 0)

    fireEvent.focus(input)
    fireEvent.blur(input)
    fireEvent.focus(input)

    await waitFor(() => assert.equal(getLoads(), 1))
  })

  it('suggests matching files while typing, without applying anything', async () => {
    const { type, committed } = setup()
    await type('comp')

    await waitFor(() => assert.ok(options().length > 0))
    assert.ok(
      options().some(o => o.textContent === 'app/src/ui/history/compare.tsx')
    )
    assert.deepEqual(committed, [])
  })

  it('suggests nothing for an empty box', async () => {
    const { input } = setup()
    fireEvent.focus(input)
    await waitFor(() => {})
    assert.equal(options().length, 0)
  })

  it('applies the highlighted suggestion with the arrow keys and Enter', async () => {
    const { input, type, committed } = setup()
    await type('commit')
    await waitFor(() => assert.ok(options().length >= 2))

    const second = options()[1].textContent
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    assert.deepEqual(committed, [second])
    assert.equal(input.value, second)
    assert.equal(options().length, 0)
  })

  it('applies a suggestion that is clicked', async () => {
    const { input, type, committed } = setup()
    await type('readme')
    await waitFor(() => assert.equal(options().length, 1))

    fireEvent.mouseDown(options()[0])

    assert.deepEqual(committed, ['README.md'])
    assert.equal(input.value, 'README.md')
  })

  it('applies exactly what was typed on Enter when nothing is suggested', async () => {
    const { input, type, committed } = setup()
    await type('zzzz/not-listed.txt')

    fireEvent.keyDown(input, { key: 'Enter' })

    assert.deepEqual(committed, ['zzzz/not-listed.txt'])
  })

  it('applies the draft when the box loses focus', async () => {
    const { input, type, committed } = setup()
    await type('docs/new.md')

    fireEvent.blur(input)

    assert.deepEqual(committed, ['docs/new.md'])
  })

  it('does not apply again when nothing changed', async () => {
    const { input, committed } = setup('README.md')

    fireEvent.focus(input)
    fireEvent.blur(input)

    assert.deepEqual(committed, [])
  })

  it('removes the restriction as soon as the box is cleared', async () => {
    const { input, committed } = setup('README.md')

    fireEvent.change(input, { target: { value: '' } })

    assert.deepEqual(committed, [''])
  })

  it('closes only the suggestions on Escape', async () => {
    const { input, type } = setup()
    await type('comp')
    await waitFor(() => assert.ok(options().length > 0))

    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' })

    assert.equal(options().length, 0)
    // the event was stopped, so a popover around the box stays open
    assert.equal(notPrevented, false)
  })

  it('shows a path applied from outside', () => {
    const { view, input, props } = setup('')

    view.rerender(<FilePathInput {...props} value="src/applied.ts" />)

    assert.equal(input.value, 'src/applied.ts')
  })
})
