import { useLoom } from './loom-context'
import { parseDiff, groupByFile, countChanges, type FileStatus } from './diff-utils'

const STATUS_BADGE: Record<FileStatus, { label: string; title: string }> = {
  added: { label: 'A', title: 'Added' },
  deleted: { label: 'D', title: 'Deleted' },
  renamed: { label: 'R', title: 'Renamed' },
  modified: { label: 'M', title: 'Modified' }
}

function FilesPanel() {
  const { diffView, selectedDiffFile, setSelectedDiffFile } = useLoom()

  if (!diffView) {
    return <div className="graph-empty">No diff selected.</div>
  }

  const sections = groupByFile(parseDiff(diffView.text))
  if (sections.length === 0) {
    return <div className="graph-empty">No changed files.</div>
  }

  const files = sections.map((section) => section.file)
  const active = selectedDiffFile && files.includes(selectedDiffFile)
    ? selectedDiffFile
    : files[0]

  return (
    <div className="files-pane">
      {sections.map((section) => {
        const { add, del } = countChanges(section.lines)
        return (
          <div
            key={section.file}
            className={`files-item${section.file === active ? ' active' : ''}`}
            title={section.file}
            onClick={() => setSelectedDiffFile(section.file)}
          >
            <span
              className={`files-status status-${section.status}`}
              title={STATUS_BADGE[section.status].title}
            >
              {STATUS_BADGE[section.status].label}
            </span>
            <span className="files-item-name">{section.file}</span>
            <span className="files-item-stat">
              {add > 0 && <span className="stat-add">+{add}</span>}
              {del > 0 && <span className="stat-del">−{del}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default FilesPanel
