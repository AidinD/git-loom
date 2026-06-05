import { useLoom } from './loom-context'

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

function DiffPanel() {
  const { diffView } = useLoom()

  if (!diffView) {
    return <div className="graph-empty">Select a file to see its diff.</div>
  }

  const lines = diffView.text.split('\n')

  return (
    <div className="diff-pane">
      <header className="diff-header">
        <span className="diff-title">
          {diffView.title}
          <span className="diff-scope">{diffView.subtitle}</span>
        </span>
      </header>
      <pre className="diff-body">
        {diffView.text.trim().length === 0 ? (
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
  )
}

export default DiffPanel
