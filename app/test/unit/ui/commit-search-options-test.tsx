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

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement

describe('CommitSearchOptions', () => {
  it('opens the options from the filter button', () => {
    const { open } = setup()
    assert.equal(screen.queryByText('Search in'), null)

    open()

    assert.ok(screen.getByText('Search in'))
  })

  it('searches the message and the code (regex) by default', () => {
    const { open } = setup()
    open()

    assert.equal(box('Commit message').checked, true)
    assert.equal(box('Code changes (regex)').checked, true)
    assert.equal(box('Code changes (exact text)').checked, false)
  })

  it('reports a place being switched off', () => {
    const { changes, open } = setup()
    open()

    fireEvent.click(box('Code changes (regex)'))

    assert.deepEqual(changes, [{ regex: false }])
  })

  it('reports a place being switched on', () => {
    const { changes, open } = setup()
    open()

    fireEvent.click(box('Code changes (exact text)'))

    assert.deepEqual(changes, [{ content: true }])
  })

  it('keeps the last checked place checked', () => {
    const { changes, open } = setup({ message: true, regex: false })
    open()

    assert.equal(box('Commit message').disabled, true)
    fireEvent.click(box('Commit message'))

    assert.deepEqual(changes, [])
    // the others can still be switched on, and then either can be switched off
    assert.equal(box('Code changes (regex)').disabled, false)
  })

  it('lets any place go once two are checked', () => {
    const { open } = setup()
    open()

    assert.equal(box('Commit message').disabled, false)
    assert.equal(box('Code changes (regex)').disabled, false)
  })

  it('offers "Match case" and warns about speed only when code is searched', () => {
    const messageOnly = setup({ message: true, regex: false })
    messageOnly.open()

    assert.equal(screen.queryByLabelText('Match case'), null)
    assert.equal(screen.queryByText(/slow on a big history/i), null)
  })

  it('offers "Match case" and reports it when code is searched', () => {
    const { changes, open } = setup()
    open()

    assert.ok(screen.getByText(/slow on a big history/i))
    fireEvent.click(box('Match case'))

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

    fireEvent.click(box('All branches'))

    assert.deepEqual(changes, [{ allBranches: true }])
  })

  it('is not flagged and has nothing to reset by default', () => {
    const { open } = setup()
    assert.equal(
      screen.queryByRole('button', { name: /search options \(customized\)/i }),
      null
    )
    open()
    assert.equal(screen.queryByRole('button', { name: 'Reset' }), null)
  })

  it('flags the button and offers Reset once something is customized', () => {
    const { changes, open } = setup({ content: true })
    assert.ok(
      screen.getByRole('button', { name: /search options \(customized\)/i })
    )
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    assert.deepEqual(changes, [{ ...DefaultCommitSearchOptions }])
  })
})
