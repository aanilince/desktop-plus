import * as React from 'react'
import classNames from 'classnames'
import { IFileListFilterState } from '../../lib/app-state'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { compileRegexFilter } from './filter-changes-regex'

interface IRegexFilterTogglesProps {
  readonly fileListFilter: IFileListFilterState
  readonly onUpdate: (update: Partial<IFileListFilterState>) => void
}

/** Returns the parse error of an invalid pattern, or null if it is usable. */
export function getRegexFilterError(
  filter: IFileListFilterState,
  pattern: string
): string | null {
  if (!filter.useRegex) {
    return null
  }

  const compiled = compileRegexFilter(pattern, {
    caseSensitive: filter.caseSensitive,
  })
  return compiled.kind === 'invalid' ? compiled.error : null
}

/** The `.*` (regex) and `Aa` (match case) toggles shown next to the filter box. */
export class RegexFilterToggles extends React.Component<IRegexFilterTogglesProps> {
  public render() {
    const { useRegex, caseSensitive } = this.props.fileListFilter

    return (
      <div className="regex-filter-toggles">
        <Button
          className={classNames('regex-filter-toggle', { active: useRegex })}
          ariaLabel="Use regular expression"
          ariaPressed={useRegex}
          tooltip="Use regular expressions on the full file path (separate several with commas)"
          onClick={this.onToggleRegex}
        >
          .*
        </Button>
        <Button
          className={classNames('regex-filter-toggle', {
            active: caseSensitive,
          })}
          ariaLabel="Match case"
          ariaPressed={caseSensitive}
          tooltip="Match case"
          disabled={!useRegex}
          onClick={this.onToggleCaseSensitive}
        >
          Aa
        </Button>
      </div>
    )
  }

  private onToggleRegex = () => {
    this.props.onUpdate({ useRegex: !this.props.fileListFilter.useRegex })
  }

  private onToggleCaseSensitive = () => {
    this.props.onUpdate({
      caseSensitive: !this.props.fileListFilter.caseSensitive,
    })
  }
}

interface IRegexExcludeFilterProps {
  readonly fileListFilter: IFileListFilterState
  readonly onUpdate: (update: Partial<IFileListFilterState>) => void
}

/** Second box for the regex of files to hide. Only shown in regex mode. */
export class RegexExcludeFilter extends React.Component<IRegexExcludeFilterProps> {
  public render() {
    const { fileListFilter } = this.props

    if (!fileListFilter.useRegex) {
      return null
    }

    const includeError = getRegexFilterError(
      fileListFilter,
      fileListFilter.filterText
    )
    const excludeError = getRegexFilterError(
      fileListFilter,
      fileListFilter.excludeText
    )

    return (
      <div
        className={classNames('regex-exclude-filter', {
          invalid: excludeError !== null,
        })}
      >
        <TextBox
          ariaLabel="Files to exclude (regular expression)"
          ariaDescribedBy={
            excludeError !== null ? 'regex-filter-error' : undefined
          }
          placeholder="Exclude (regex, e.g. test, lock, json)"
          displayClearButton={true}
          value={fileListFilter.excludeText}
          onValueChanged={this.onExcludeTextChanged}
        />
        {(includeError !== null || excludeError !== null) && (
          <div id="regex-filter-error" className="regex-filter-error">
            {includeError !== null && <div>Filter: {includeError}</div>}
            {excludeError !== null && <div>Exclude: {excludeError}</div>}
          </div>
        )}
      </div>
    )
  }

  private onExcludeTextChanged = (excludeText: string) => {
    this.props.onUpdate({ excludeText })
  }
}
