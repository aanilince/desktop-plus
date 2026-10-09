import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  DefaultCommitSearchOptions,
  ICommitSearchOptions,
} from '../../../src/lib/commit-search-filter'
import { CommitSearchOptions } from '../../../src/ui/history/commit-search-options'
import { fireEvent, render, screen } from '../../helpers/ui/render'

function setup(
  options: Partial<ICommitSearchOptions> = {},
  showAllBranches = false
) {
  const changes = new Array<Partial<ICommitSearchOptions>>()
  render(
    <CommitSearchOptions
      options={{ ...DefaultCommitSearchOptions, ...options }}
      showAllBranches={showAllBranches}
      onChange={change => changes.push(change)}
      loadFilePaths={async () => []}
    />
  )
  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: /search options/i }))
  return { changes, open }
}

describe('CommitSearchOptions', () => {
  it('opens the options from the filter button', () => {
    const { open } = setup()
    assert.equal(screen.queryByText('Search in'), null)

    open()

    assert.ok(screen.getByText('Search in'))
    assert.ok(screen.getByLabelText('Commit message'))
  })

  it('changes what the text is searched in', () => {
    const { changes, open } = setup()
    open()

    fireEvent.click(screen.getByLabelText('Code changes (regex)'))

    assert.deepEqual(changes, [{ mode: 'regex' }])
  })

  it('offers "Match case" only when searching code', () => {
    const message = setup({ mode: 'message' })
    message.open()
    assert.equal(screen.queryByLabelText('Match case'), null)
  })

  it('offers "Match case" for the code-change modes and reports it', () => {
    const { changes, open } = setup({ mode: 'content' })
    open()

    fireEvent.click(screen.getByLabelText('Match case'))

    assert.deepEqual(changes, [{ matchCase: true }])
  })

  it('offers "All branches" only where it can show the results', () => {
    const history = setup({}, false)
    history.open()
    assert.equal(screen.queryByLabelText('All branches'), null)
  })

  it('offers and reports "All branches" in the graph', () => {
    const { changes, open } = setup({}, true)
    open()

    fireEvent.click(screen.getByLabelText('All branches'))

    assert.deepEqual(changes, [{ allBranches: true }])
  })

  it('flags the button and offers Reset once something is customized', () => {
    const { changes, open } = setup({ mode: 'content' })
    assert.ok(
      screen.getByRole('button', { name: /search options \(customized\)/i })
    )
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    assert.deepEqual(changes, [{ ...DefaultCommitSearchOptions }])
  })

  it('has nothing to reset by default', () => {
    const { open } = setup()
    open()
    assert.equal(screen.queryByRole('button', { name: 'Reset' }), null)
  })
})
