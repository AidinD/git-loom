interface DiffView {
  path: string
  staged: boolean
  text: string
}

interface Props {
  diff: DiffView
  onClose: () => void
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'diff-meta'
  }
  if (line.startsWith('@@')) {
    return 'diff-hunk'
  }
  if (line.startsWith('+')) {
    return 'diff-add'
  }
  if (line.startsWith('-')) {
    return 'diff-del'
  }
  if (line.startsWith('diff ') || line.startsWith('index ')) {
    return 'diff-meta'
  }
  return 'diff-context'
}

function DiffModal({ diff, onClose }: Props) {
  const lines = diff.text.split('\n')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="diff-modal" onClick={(event) => event.stopPropagation()}>
        <header className="diff-header">
          <span className="diff-title">
            {diff.path}
            <span className="diff-scope">{diff.staged ? 'staged' : 'unstaged'}</span>
          </span>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <pre className="diff-body">
          {diff.text.trim().length === 0 ? (
            <span className="diff-context">
              No textual diff (binary, untracked, or no changes).
            </span>
          ) : (
            lines.map((line, index) => (
              <div key={index} className={lineClass(line)}>
                {line || ' '}
              </div>
            ))
          )}
        </pre>
      </div>
    </div>
  )
}

export default DiffModal
