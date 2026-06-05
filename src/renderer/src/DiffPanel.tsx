import { useState } from 'react'
import { useLoom } from './loom-context'
import { parseDiff, groupByFile, toSplit } from './diff-utils'
import type { DiffLine } from './diff-utils'

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {lines.map((line, index) => {
        if (line.type === 'hunk') {
          return (
            <div key={index} className="dl-hunk">
              {line.text}
            </div>
          )
        }
        if (line.type === 'meta' || line.type === 'file') {
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
    </>
  )
}

function SplitView({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {toSplit(lines).map((row, index) => {
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
            <div
              className={`ds-cell${changed && row.left ? ' ds-del' : ''}${!row.left ? ' ds-empty' : ''}`}
            >
              <span className="dl-num">{row.left?.no ?? ''}</span>
              <span className="ds-text">{row.left?.text ?? ''}</span>
            </div>
            <div
              className={`ds-cell${changed && row.right ? ' ds-add' : ''}${!row.right ? ' ds-empty' : ''}`}
            >
              <span className="dl-num">{row.right?.no ?? ''}</span>
              <span className="ds-text">{row.right?.text ?? ''}</span>
            </div>
          </div>
        )
      })}
    </>
  )
}

function DiffPanel() {
  const { diffView, selectedDiffFile } = useLoom()
  const [mode, setMode] = useState<'unified' | 'split'>(
    () => (localStorage.getItem('loom.diffMode') as 'unified' | 'split') || 'split'
  )

  function setDiffMode(next: 'unified' | 'split'): void {
    setMode(next)
    localStorage.setItem('loom.diffMode', next)
  }

  if (!diffView) {
    return <div className="graph-empty">Select a file or commit to see its diff.</div>
  }

  const hasContent = diffView.text.trim().length > 0
  const sections = hasContent ? groupByFile(parseDiff(diffView.text)) : []
  const active =
    sections.find((section) => section.file === selectedDiffFile) ?? sections[0] ?? null

  return (
    <div className="diff-pane">
      <header className="diff-header">
        <span className="diff-title">
          {active ? active.file : diffView.title}
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
        {!active && (
          <div className="dl-meta">
            No textual diff (binary, untracked, or no changes).
          </div>
        )}
        {active &&
          (mode === 'unified' ? (
            <UnifiedView lines={active.lines} />
          ) : (
            <SplitView lines={active.lines} />
          ))}
      </div>
    </div>
  )
}

export default DiffPanel
