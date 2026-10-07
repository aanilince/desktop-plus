import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'
import { FileTreeGuides, fileTreeIndentWidth } from '../lib/file-tree-folder'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly focused: boolean
  /** Tree depth when rendered in a tree view; shows only the file name */
  readonly depth?: number
}

export class CommittedFileItem extends React.Component<ICommittedFileItemProps> {
  public render() {
    const { file, focused } = this.props
    const { status } = file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filePathPadding = 5
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth -
      fileTreeIndentWidth(this.props.depth ?? 0)

    return (
      <div className="file">
        {this.props.depth !== undefined && (
          <FileTreeGuides depth={this.props.depth} />
        )}
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
          fileNameOnly={this.props.depth !== undefined}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.NORTH}
        >
          <Octicon
            symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
      </div>
    )
  }
}
