import * as React from 'react'
import classNames from 'classnames'
import { suggestFilePaths } from '../../lib/file-path-suggestions'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'
import { TextBox } from '../lib/text-box'

const MaxSuggestions = 8

interface IFilePathInputProps {
  readonly label: string
  readonly placeholder?: string

  /** The path currently applied. */
  readonly value: string

  /**
   * Called when the user settles on a path: by picking a suggestion, pressing
   * Enter, leaving the box or clearing it. Not on every keystroke, so a
   * half-typed path doesn't trigger a search.
   */
  readonly onValueCommitted: (path: string) => void

  /** Loads the paths to suggest from, the first time the box is focused. */
  readonly loadPaths: () => Promise<ReadonlyArray<string>>
}

interface IFilePathInputState {
  /** What is in the box, which may not be applied yet. */
  readonly draft: string
  readonly paths: ReadonlyArray<string> | null
  readonly isFocused: boolean
  readonly selectedIndex: number
  /** Set when the user dismissed the suggestions; reset when they type. */
  readonly isDismissed: boolean
}

/**
 * A text box for a file path in the repository, suggesting the tracked files
 * that match what has been typed so far.
 */
export class FilePathInput extends React.Component<
  IFilePathInputProps,
  IFilePathInputState
> {
  private readonly listId = createUniqueId('file-path-suggestions')
  private isLoadingPaths = false

  public constructor(props: IFilePathInputProps) {
    super(props)
    this.state = {
      draft: props.value,
      paths: null,
      isFocused: false,
      selectedIndex: 0,
      isDismissed: false,
    }
  }

  public componentDidUpdate(prevProps: IFilePathInputProps) {
    // The applied path changed from outside (Reset, "Show history of this file")
    if (
      prevProps.value !== this.props.value &&
      this.props.value !== this.state.draft
    ) {
      this.setState({ draft: this.props.value })
    }
  }

  public componentWillUnmount() {
    releaseUniqueId(this.listId)
  }

  private get suggestions(): ReadonlyArray<string> {
    const { paths, draft, isFocused, isDismissed } = this.state
    if (paths === null || !isFocused || isDismissed) {
      return []
    }

    // Once the box holds exactly a tracked path there is nothing left to suggest
    if (paths.includes(draft.trim().replace(/\\/g, '/'))) {
      return []
    }

    return suggestFilePaths(paths, draft, MaxSuggestions)
  }

  public render() {
    const suggestions = this.suggestions
    const isOpen = suggestions.length > 0

    return (
      <div className="file-path-input">
        <TextBox
          label={this.props.label}
          placeholder={this.props.placeholder}
          displayClearButton={true}
          value={this.state.draft}
          onValueChanged={this.onValueChanged}
          onKeyDown={this.onKeyDown}
          onFocus={this.onFocus}
          onBlur={this.onBlur}
          ariaControls={this.listId}
          ariaExpanded={isOpen}
          ariaAutocomplete="list"
          ariaHasPopup="listbox"
          ariaActiveDescendant={
            isOpen ? this.getOptionId(this.state.selectedIndex) : undefined
          }
        />
        {isOpen && (
          <ul id={this.listId} role="listbox" className="file-path-suggestions">
            {suggestions.map((path, index) => (
              <li
                key={path}
                id={this.getOptionId(index)}
                role="option"
                aria-selected={index === this.state.selectedIndex}
                className={classNames({
                  selected: index === this.state.selectedIndex,
                })}
                title={path}
                // mousedown rather than click: it happens before the box
                // loses focus, which would otherwise close the list first
                onMouseDown={this.onSuggestionMouseDown}
                data-path={path}
              >
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  private getOptionId(index: number) {
    return `${this.listId}-option-${index}`
  }

  private onFocus = () => {
    this.setState({ isFocused: true })

    if (this.state.paths === null && !this.isLoadingPaths) {
      this.isLoadingPaths = true
      this.props
        .loadPaths()
        .then(paths => this.setState({ paths }))
        .catch(e => log.error('Could not list the repository files', e))
        .finally(() => (this.isLoadingPaths = false))
    }
  }

  private onBlur = () => {
    this.setState({ isFocused: false })
    this.commit(this.state.draft)
  }

  private onValueChanged = (draft: string) => {
    this.setState({ draft, selectedIndex: 0, isDismissed: false })

    // Clearing the box removes the restriction right away
    if (draft === '') {
      this.commit(draft)
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestions = this.suggestions
    const { selectedIndex } = this.state

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (suggestions.length === 0) {
          return
        }
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        this.setState({
          selectedIndex:
            (selectedIndex + step + suggestions.length) % suggestions.length,
        })
        break
      }
      case 'Enter':
        event.preventDefault()
        this.select(suggestions[selectedIndex] ?? this.state.draft)
        break
      case 'Escape':
        if (suggestions.length > 0) {
          // Only close the suggestions, not the popover around the box
          event.preventDefault()
          event.stopPropagation()
          this.setState({ isDismissed: true })
        }
        break
    }
  }

  private onSuggestionMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    const path = event.currentTarget.dataset.path
    if (path !== undefined) {
      this.select(path)
    }
  }

  private select(path: string) {
    this.setState({ draft: path, isDismissed: true })
    this.commit(path)
  }

  private commit(path: string) {
    const normalized = path.trim()
    if (normalized !== this.props.value) {
      this.props.onValueCommitted(normalized)
    }
  }
}
