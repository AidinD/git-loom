import { useLoom } from './loom-context'
import { parseDiff, groupByFile } from './diff-utils'

function FilesPanel() {
  const { diffView, selectedDiffFile, setSelectedDiffFile } = useLoom()

  if (!diffView) {
    return <div className="graph-empty">No diff selected.</div>
  }

  const files = groupByFile(parseDiff(diffView.text)).map((section) => section.file)
  if (files.length === 0) {
    return <div className="graph-empty">No changed files.</div>
  }

  const active = selectedDiffFile && files.includes(selectedDiffFile)
    ? selectedDiffFile
    : files[0]

  return (
    <div className="files-pane">
      {files.map((file) => (
        <div
          key={file}
          className={`files-item${file === active ? ' active' : ''}`}
          title={file}
          onClick={() => setSelectedDiffFile(file)}
        >
          {file}
        </div>
      ))}
    </div>
  )
}

export default FilesPanel
