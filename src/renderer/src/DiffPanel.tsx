import { useLoom } from './loom-context'

type LineType = 'add' | 'del' | 'context' | 'hunk' | 'meta'

interface DiffLine {
  type: LineType
  oldNo?: number
  newNo?: number
  text: string
}

const META_PREFIXES = [
  'diff --git',
  'index ',
  'new file',
  'deleted file',
  'old mode',
  'new mode',
  'rename ',
  'similarity ',
  'copy ',
  '--- ',
  '+++ ',
  'Binary files'
]

function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0

  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldNo = Number(match[1])
        newNo = Number(match[2])
      }
      out.push({ type: 'hunk', text: line })
      continue
    }
    if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      out.push({ type: 'meta', text: line })
      continue
    }
    if (line.startsWith('+')) {
      out.push({ type: 'add', newNo, text: line.slice(1) })
      newNo += 1
      continue
    }
    if (line.startsWith('-')) {
      out.push({ type: 'del', oldNo, text: line.slice(1) })
      oldNo += 1
      continue
    }
    if (line.startsWith(' ')) {
      out.push({ type: 'context', oldNo, newNo, text: line.slice(1) })
      oldNo += 1
      newNo += 1
      continue
    }
    // Commit header / message lines from `git show`, or blank lines.
    out.push({ type: 'meta', text: line })
  }

  return out
}

function DiffPanel() {
  const { diffView } = useLoom()

  if (!diffView) {
    return <div className="graph-empty">Select a file or commit to see its diff.</div>
  }

  const hasContent = diffView.text.trim().length > 0
  const lines = hasContent ? parseDiff(diffView.text) : []

  return (
    <div className="diff-pane">
      <header className="diff-header">
        <span className="diff-title">
          {diffView.title}
          <span className="diff-scope">{diffView.subtitle}</span>
        </span>
      </header>
      <div className="diff-body2">
        {!hasContent && (
          <div className="dl-meta">
            No textual diff (binary, untracked, or no changes).
          </div>
        )}
        {lines.map((line, index) => {
          if (line.type === 'hunk') {
            return (
              <div key={index} className="dl-hunk">
                {line.text}
              </div>
            )
          }
          if (line.type === 'meta') {
            return (
              <div key={index} className="dl-meta">
                {line.text || ' '}
              </div>
            )
          }
          return (
            <div key={index} className={`dl dl-${line.type}`}>
              <span className="dl-num">{line.oldNo ?? ''}</span>
              <span className="dl-num">{line.newNo ?? ''}</span>
              <span className="dl-sign">
                {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
              </span>
              <span className="dl-text">{line.text || ' '}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DiffPanel
