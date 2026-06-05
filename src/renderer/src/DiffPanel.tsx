import { useState } from 'react'
import { useLoom } from './loom-context'

type LineType = 'add' | 'del' | 'context' | 'hunk' | 'meta' | 'file'

interface DiffLine {
  type: LineType
  oldNo?: number
  newNo?: number
  text: string
}

interface SplitCell {
  no?: number
  text: string
}

interface SplitRow {
  kind: 'context' | 'change' | 'hunk' | 'meta' | 'file'
  text?: string
  left?: SplitCell
  right?: SplitCell
}

// Per-file metadata lines that are pure noise in a viewer.
const SKIP_PREFIXES = [
  'index ',
  '--- ',
  '+++ ',
  'old mode',
  'new mode',
  'similarity ',
  'rename ',
  'copy ',
  'dissimilarity '
]

function parseDiff(text: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0

  for (const line of text.split('\n')) {
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/)
    if (fileMatch) {
      out.push({ type: 'file', text: fileMatch[1] })
      continue
    }
    if (SKIP_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      continue
    }
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldNo = Number(match[1])
        newNo = Number(match[2])
      }
      out.push({ type: 'hunk', text: line })
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
    out.push({ type: 'meta', text: line })
  }

  return out
}

function toSplit(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === 'context') {
      rows.push({
        kind: 'context',
        left: { no: line.oldNo, text: line.text },
        right: { no: line.newNo, text: line.text }
      })
      i += 1
      continue
    }
    if (line.type === 'del' || line.type === 'add') {
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'del') {
        dels.push(lines[i])
        i += 1
      }
      while (i < lines.length && lines[i].type === 'add') {
        adds.push(lines[i])
        i += 1
      }
      const count = Math.max(dels.length, adds.length)
      for (let k = 0; k < count; k++) {
        const del = dels[k]
        const add = adds[k]
        rows.push({
          kind: 'change',
          left: del ? { no: del.oldNo, text: del.text } : undefined,
          right: add ? { no: add.newNo, text: add.text } : undefined
        })
      }
      continue
    }
    rows.push({ kind: line.type as 'hunk' | 'meta' | 'file', text: line.text })
    i += 1
  }
  return rows
}

function DiffPanel() {
  const { diffView } = useLoom()
  const [mode, setMode] = useState<'unified' | 'split'>(
    () => (localStorage.getItem('loom.diffMode') as 'unified' | 'split') || 'unified'
  )

  function setDiffMode(next: 'unified' | 'split'): void {
    setMode(next)
    localStorage.setItem('loom.diffMode', next)
  }

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
        <div className="diff-modes">
          <button
            className={mode === 'unified' ? 'active' : ''}
            onClick={() => setDiffMode('unified')}
          >
            Unified
          </button>
          <button
            className={mode === 'split' ? 'active' : ''}
            onClick={() => setDiffMode('split')}
          >
            Split
          </button>
        </div>
      </header>

      <div className="diff-body2">
        {!hasContent && (
          <div className="dl-meta">
            No textual diff (binary, untracked, or no changes).
          </div>
        )}

        {hasContent && mode === 'unified' &&
          lines.map((line, index) => {
            if (line.type === 'file') {
              return (
                <div key={index} className="dl-file">
                  {line.text}
                </div>
              )
            }
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

        {hasContent &&
          mode === 'split' &&
          toSplit(lines).map((row, index) => {
            if (row.kind === 'file') {
              return (
                <div key={index} className="dl-file">
                  {row.text}
                </div>
              )
            }
            if (row.kind === 'hunk') {
              return (
                <div key={index} className="dl-hunk">
                  {row.text}
                </div>
              )
            }
            if (row.kind === 'meta') {
              return (
                <div key={index} className="dl-meta">
                  {row.text || ' '}
                </div>
              )
            }
            const changed = row.kind === 'change'
            return (
              <div key={index} className="ds-row">
                <div className={`ds-cell${changed && row.left ? ' ds-del' : ''}${!row.left ? ' ds-empty' : ''}`}>
                  <span className="dl-num">{row.left?.no ?? ''}</span>
                  <span className="ds-text">{row.left?.text ?? ''}</span>
                </div>
                <div className={`ds-cell${changed && row.right ? ' ds-add' : ''}${!row.right ? ' ds-empty' : ''}`}>
                  <span className="dl-num">{row.right?.no ?? ''}</span>
                  <span className="ds-text">{row.right?.text ?? ''}</span>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default DiffPanel
