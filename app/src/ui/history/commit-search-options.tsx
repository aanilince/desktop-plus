import * as React from 'react'
import classNames from 'classnames'
import {
  CommitSearchMode,
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
import { RadioGroup } from '../lib/radio-group'
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

const modes: ReadonlyArray<CommitSearchMode> = ['message', 'content', 'regex']

const modeLabels: Record<CommitSearchMode, string> = {
  message: 'Commit message',
  content: 'Code changes (exact text)',
  regex: 'Code changes (regex)',
}

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
          <RadioGroup<CommitSearchMode>
            ariaLabelledBy="commit-search-options-header"
            selectedKey={options.mode}
            radioButtonKeys={modes}
            onSelectionChanged={this.onModeChanged}
            renderRadioButtonLabelContents={this.renderModeLabel}
          />
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

        {options.mode !== 'message' && (
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

  private renderModeLabel = (mode: CommitSearchMode) => modeLabels[mode]

  private onModeChanged = (mode: CommitSearchMode) => {
    this.props.onChange({ mode })
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
