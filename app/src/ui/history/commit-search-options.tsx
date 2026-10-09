import * as React from 'react'
import classNames from 'classnames'
import {
  DefaultCommitSearchOptions,
  hasCustomCommitSearchOptions,
  ICommitSearchOptions,
} from '../../lib/commit-search-filter'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { FilePathInput } from './file-path-input'

interface ICommitSearchOptionsProps {
  readonly options: ICommitSearchOptions

  /**
   * Whether to offer searching all branches. Only the commit graph can show
   * commits from other branches, so the history list leaves this out.
   */
  readonly showAllBranches: boolean

  readonly onChange: (options: Partial<ICommitSearchOptions>) => void

  /** Lists the repository's files, to suggest paths for the file option. */
  readonly loadFilePaths: () => Promise<ReadonlyArray<string>>
}

interface ICommitSearchOptionsState {
  readonly isOpen: boolean
}

/** The places the text typed in the search box can be looked for in. */
type SearchPlace = 'message' | 'content' | 'regex'

const places: ReadonlyArray<{ readonly place: SearchPlace; label: string }> = [
  { place: 'message', label: 'Commit message' },
  { place: 'content', label: 'Code changes (exact text)' },
  { place: 'regex', label: 'Code changes (regex)' },
]

/**
 * A button next to the commit search box that opens the options the search
 * would otherwise need typed keywords for: what to look for in, which file,
 * and which branches.
 */
export class CommitSearchOptions extends React.Component<
  ICommitSearchOptionsProps,
  ICommitSearchOptionsState
> {
  private buttonRef: HTMLButtonElement | null = null
  private placeHandlers = new Map<
    SearchPlace,
    (event: React.FormEvent<HTMLInputElement>) => void
  >()

  public constructor(props: ICommitSearchOptionsProps) {
    super(props)
    this.state = { isOpen: false }
  }

  public render() {
    const isActive = hasCustomCommitSearchOptions(this.props.options)
    const label = `Search options${isActive ? ' (customized)' : ''}`

    return (
      <>
        <Button
          className={classNames('commit-search-options-button', {
            active: isActive,
          })}
          onClick={this.toggle}
          ariaExpanded={this.state.isOpen}
          onButtonRef={this.onButtonRef}
          tooltip={label}
          ariaLabel={label}
        >
          <Octicon symbol={octicons.filter} />
          {isActive && <span className="active-badge" aria-hidden="true" />}
          <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.state.isOpen && this.renderPopover()}
      </>
    )
  }

  private renderPopover() {
    const { options, showAllBranches } = this.props
    const checkedPlaces = places.filter(({ place }) => options[place]).length
    const searchesCode = options.content || options.regex

    return (
      <Popover
        className="commit-search-options-popover"
        ariaLabelledby="commit-search-options-header"
        anchor={this.buttonRef}
        anchorPosition={PopoverAnchorPosition.BottomLeft}
        decoration={PopoverDecoration.Balloon}
        onMousedownOutside={this.close}
        onClickOutside={this.close}
      >
        <div className="commit-search-options-header">
          <h3 id="commit-search-options-header">Search options</h3>
          <button className="close" onClick={this.close} aria-label="Close">
            <Octicon symbol={octicons.x} />
          </button>
        </div>

        <fieldset className="commit-search-options-group">
          <legend>Search in</legend>
          {places.map(({ place, label }) => (
            <Checkbox
              key={place}
              label={label}
              value={options[place] ? CheckboxValue.On : CheckboxValue.Off}
              // At least one place has to stay checked
              disabled={options[place] && checkedPlaces === 1}
              onChange={this.getPlaceChangedHandler(place)}
            />
          ))}
          <p className="commit-search-options-hint">
            A commit is shown if it matches in any checked place.
            {searchesCode &&
              ' Searching code reads every commit, which is slow on a big history unless a file is chosen below.'}
          </p>
        </fieldset>

        <div className="commit-search-options-group">
          <FilePathInput
            label="Only commits touching this file"
            placeholder="path/to/file.ts"
            value={options.file}
            onValueCommitted={this.onFileChanged}
            loadPaths={this.props.loadFilePaths}
          />
        </div>

        {searchesCode && (
          <div className="commit-search-options-group">
            <Checkbox
              label="Match case"
              value={options.matchCase ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onMatchCaseChanged}
            />
          </div>
        )}

        {showAllBranches && (
          <div className="commit-search-options-group">
            <Checkbox
              label="All branches"
              value={options.allBranches ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onAllBranchesChanged}
            />
          </div>
        )}

        {hasCustomCommitSearchOptions(options) && (
          <div className="commit-search-options-footer">
            <Button onClick={this.onReset}>Reset</Button>
          </div>
        )}
      </Popover>
    )
  }

  private getPlaceChangedHandler(place: SearchPlace) {
    let handler = this.placeHandlers.get(place)
    if (handler === undefined) {
      handler = event => {
        const checked = event.currentTarget.checked
        const { options } = this.props
        const checkedPlaces = places.filter(p => options[p.place]).length

        // At least one place has to stay checked
        if (!checked && options[place] && checkedPlaces === 1) {
          return
        }

        this.props.onChange({ [place]: checked })
      }
      this.placeHandlers.set(place, handler)
    }
    return handler
  }

  private onFileChanged = (file: string) => {
    this.props.onChange({ file })
  }

  private onMatchCaseChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onChange({ matchCase: event.currentTarget.checked })
  }

  private onAllBranchesChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onChange({ allBranches: event.currentTarget.checked })
  }

  private onReset = () => {
    // The history list has no all-branches option, so leave that one alone
    this.props.onChange({
      ...DefaultCommitSearchOptions,
      allBranches: this.props.showAllBranches
        ? DefaultCommitSearchOptions.allBranches
        : this.props.options.allBranches,
    })
  }

  private toggle = () => {
    this.setState(({ isOpen }) => ({ isOpen: !isOpen }))
  }

  private close = () => {
    this.setState({ isOpen: false })
  }

  private onButtonRef = (button: HTMLButtonElement | null) => {
    this.buttonRef = button
  }
}
