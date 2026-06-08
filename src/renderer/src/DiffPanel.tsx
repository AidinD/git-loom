import { useState } from 'react'
import { useLoom } from './loom-context'
import { parseDiff, groupByFile, toSplit, inlineDiff, splitHunks, hunkPatch } from './diff-utils'
import type { DiffLine, InlineSeg } from './diff-utils'

/** Renders inline word-diff segments, or plain text when no segments exist. */
function InlineText({
  segs,
  fallback,
  side
}: {
  segs: InlineSeg[] | undefined
  fallback: string
  side: 'add' | 'del'
}) {
  if (!segs) {
    return <>{fallback || ' '}</>
  }
  return (
    <>
      {segs.map((seg, index) =>
        seg.changed ? (
          <span key={index} className={`word-diff-${side}`}>
            {seg.text}
          </span>
        ) : (
          <span key={index}>{seg.text}</span>
        )
      )}
    </>
  )
}

/** Attaches inline word-diff segments to paired del/add lines (unified view). */
function annotateInline(lines: DiffLine[]): (DiffLine & { segs?: InlineSeg[] })[] {
  const out: (DiffLine & { segs?: InlineSeg[] })[] = lines.map((line) => ({ ...line }))
  let i = 0
  while (i < out.length) {
    if (out[i].type !== 'del') {
      i += 1
      continue
    }
    const delStart = i
    while (i < out.length && out[i].type === 'del') {
      i += 1
    }
    const addStart = i
    while (i < out.length && out[i].type === 'add') {
      i += 1
    }
    const count = Math.min(addStart - delStart, i - addStart)
    for (let k = 0; k < count; k++) {
      const del = out[delStart + k]
      const add = out[addStart + k]
      const diff = inlineDiff(del.text, add.text)
      del.segs = diff.left
      add.segs = diff.right
    }
  }
  return out
}

function UnifiedView({ lines }: { lines: DiffLine[] }) {
  const annotated = annotateInline(lines)
  return (
    <>
      {annotated.map((line, index) => {
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
        const side = line.type === 'add' ? 'add' : 'del'
        return (
          <div key={index} className={`dl dl-${line.type}`}>
            <span className="dl-num">{line.oldNo ?? ''}</span>
            <span className="dl-num">{line.newNo ?? ''}</span>
            <span className="dl-sign">
              {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
            </span>
            <span className="dl-text">
              {line.type === 'add' || line.type === 'del' ? (
                <InlineText segs={line.segs} fallback={line.text} side={side} />
              ) : (
                line.text || ' '
              )}
            </span>
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
        const paired = changed && row.left && row.right
        const segs = paired ? inlineDiff(row.left!.text, row.right!.text) : null
        return (
          <div key={index} className="ds-row">
            <div
              className={`ds-cell${changed && row.left ? ' ds-del' : ''}${!row.left ? ' ds-empty' : ''}`}
            >
              <span className="dl-num">{row.left?.no ?? ''}</span>
              <span className="ds-text">
                {row.left ? (
                  <InlineText segs={segs?.left} fallback={row.left.text} side="del" />
                ) : (
                  ''
                )}
              </span>
            </div>
            <div
              className={`ds-cell${changed && row.right ? ' ds-add' : ''}${!row.right ? ' ds-empty' : ''}`}
            >
              <span className="dl-num">{row.right?.no ?? ''}</span>
              <span className="ds-text">
                {row.right ? (
                  <InlineText segs={segs?.right} fallback={row.right.text} side="add" />
                ) : (
                  ''
                )}
              </span>
            </div>
          </div>
        )
      })}
    </>
  )
}

function DiffPanel() {
  const { diffView, selectedDiffFile, onStageHunk } = useLoom()
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
  // Working-tree diffs (a single file with staged/unstaged scope) support
  // per-hunk staging; commit diffs do not.
  const stageable = !!diffView.file && diffView.staged !== undefined && hasContent
  const sections = hasContent ? groupByFile(parseDiff(diffView.text)) : []
  const active =
    sections.find((section) => section.file === selectedDiffFile) ?? sections[0] ?? null

  const split = stageable ? splitHunks(diffView.text) : null
  const stageLabel = diffView.staged ? 'Unstage hunk' : 'Stage hunk'

  function renderLines(lines: ReturnType<typeof parseDiff>) {
    return mode === 'unified' ? <UnifiedView lines={lines} /> : <SplitView lines={lines} />
  }

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
          stageable &&
          split &&
          split.hunks.map((hunk, index) => (
            <div key={index} className="diff-hunk">
              <div className="diff-hunk-bar">
                <button
                  className="hunk-stage-btn"
                  onClick={() =>
                    onStageHunk(
                      diffView.file!,
                      diffView.staged!,
                      hunkPatch(split, hunk)
                    )
                  }
                >
                  {stageLabel}
                </button>
              </div>
              {renderLines(parseDiff(hunk))}
            </div>
          ))}

        {active && !stageable && renderLines(active.lines)}
      </div>
    </div>
  )
}

export default DiffPanel
