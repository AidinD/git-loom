import { useEffect, useState } from 'react'
import { useLoom } from './loom-context'
import {
  parseDiff,
  groupByFile,
  toSplit,
  inlineDiff,
  splitHunks,
  hunkPatch,
  linePatch
} from './diff-utils'
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

interface UnifiedProps {
  lines: DiffLine[]
  /** When set, add/del lines are clickable for line-level staging. */
  selectable?: boolean
  selected?: Set<number>
  onToggleLine?: (bodyIndex: number) => void
}

function UnifiedView({ lines, selectable, selected, onToggleLine }: UnifiedProps) {
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
        // The first rendered line is the @@ header, so body index = index - 1.
        const bodyIndex = index - 1
        const canSelect = selectable && (line.type === 'add' || line.type === 'del')
        const isSelected = canSelect && selected?.has(bodyIndex)
        return (
          <div
            key={index}
            className={`dl dl-${line.type}${canSelect ? ' selectable' : ''}${
              isSelected ? ' line-selected' : ''
            }`}
            onClick={canSelect ? () => onToggleLine?.(bodyIndex) : undefined}
          >
            {selectable && (
              <span className="dl-check">{isSelected ? '☑' : '☐'}</span>
            )}
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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i

function ImageDiffView({
  repoPath,
  file,
  staged
}: {
  repoPath: string
  file: string
  staged: boolean
}) {
  const [data, setData] = useState<{ before: string | null; after: string | null } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    setError(null)
    window.api.imageDiff(repoPath, file, staged).then((result) => {
      if (!active) {
        return
      }
      if (result.ok) {
        setData({ before: result.before, after: result.after })
      } else {
        setError(result.error)
      }
    })
    return () => {
      active = false
    }
  }, [repoPath, file, staged])

  if (error) {
    return <div className="dl-meta">{error}</div>
  }
  if (!data) {
    return <div className="dl-meta">Loading image…</div>
  }
  return (
    <div className="image-diff">
      <div className="image-diff-side">
        <div className="image-diff-label image-diff-before">Before</div>
        {data.before ? (
          <img className="image-diff-img" src={data.before} alt="before" />
        ) : (
          <div className="image-diff-none">(none)</div>
        )}
      </div>
      <div className="image-diff-side">
        <div className="image-diff-label image-diff-after">After</div>
        {data.after ? (
          <img className="image-diff-img" src={data.after} alt="after" />
        ) : (
          <div className="image-diff-none">(none)</div>
        )}
      </div>
    </div>
  )
}

function DiffPanel() {
  const { diffView, selectedDiffFile, onStageHunk, repoPath } = useLoom()
  const [mode, setMode] = useState<'unified' | 'split'>(
    () => (localStorage.getItem('loom.diffMode') as 'unified' | 'split') || 'split'
  )
  // Per-hunk sets of selected body-line indices for line-level staging.
  const [selected, setSelected] = useState<Record<number, number[]>>({})

  // Clear line selection whenever the diff content changes (e.g. after staging).
  useEffect(() => {
    setSelected({})
  }, [diffView?.text])

  function setDiffMode(next: 'unified' | 'split'): void {
    setMode(next)
    localStorage.setItem('loom.diffMode', next)
  }

  function toggleLine(hunkIndex: number, bodyIndex: number): void {
    setSelected((current) => {
      const existing = current[hunkIndex] ?? []
      const next = existing.includes(bodyIndex)
        ? existing.filter((value) => value !== bodyIndex)
        : [...existing, bodyIndex]
      return { ...current, [hunkIndex]: next }
    })
  }

  if (!diffView) {
    return <div className="graph-empty">Select a file or commit to see its diff.</div>
  }

  const hasContent = diffView.text.trim().length > 0
  // Image files in a working-tree diff get a before/after preview instead of
  // the binary "files differ" text.
  const showImage =
    !!diffView.file &&
    diffView.staged !== undefined &&
    !!repoPath &&
    IMAGE_EXT.test(diffView.file)
  // Working-tree diffs (a single file with staged/unstaged scope) support
  // per-hunk staging; commit diffs do not.
  const stageable =
    !showImage && !!diffView.file && diffView.staged !== undefined && hasContent
  const sections = hasContent ? groupByFile(parseDiff(diffView.text)) : []
  const active =
    sections.find((section) => section.file === selectedDiffFile) ?? sections[0] ?? null

  const split = stageable ? splitHunks(diffView.text) : null
  const isStaged = !!diffView.staged
  const hunkLabel = isStaged ? '− Unstage hunk' : '+ Stage hunk'
  const lineSelectable = stageable && mode === 'unified'

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
        {showImage && (
          <ImageDiffView
            repoPath={repoPath!}
            file={diffView.file!}
            staged={diffView.staged!}
          />
        )}

        {!showImage && !active && (
          <div className="dl-meta">
            No textual diff (binary, untracked, or no changes).
          </div>
        )}

        {active &&
          stageable &&
          split &&
          split.hunks.map((hunk, index) => {
            const picked = selected[index] ?? []
            const pickedSet = new Set(picked)
            return (
              <div key={index} className="diff-hunk">
                <div className="diff-hunk-bar">
                  <span className="diff-hunk-label">Hunk {index + 1}</span>
                  {picked.length > 0 && (
                    <button
                      className={`hunk-stage-btn${isStaged ? ' unstage' : ''}`}
                      onClick={() =>
                        onStageHunk(
                          diffView.file!,
                          diffView.staged!,
                          linePatch(split, hunk, pickedSet)
                        )
                      }
                    >
                      {isStaged ? '−' : '+'} {isStaged ? 'Unstage' : 'Stage'}{' '}
                      {picked.length} line{picked.length === 1 ? '' : 's'}
                    </button>
                  )}
                  <button
                    className={`hunk-stage-btn${isStaged ? ' unstage' : ''}`}
                    onClick={() =>
                      onStageHunk(diffView.file!, diffView.staged!, hunkPatch(split, hunk))
                    }
                  >
                    {hunkLabel}
                  </button>
                </div>
                {mode === 'unified' ? (
                  <UnifiedView
                    lines={parseDiff(hunk)}
                    selectable={lineSelectable}
                    selected={pickedSet}
                    onToggleLine={(bodyIndex) => toggleLine(index, bodyIndex)}
                  />
                ) : (
                  <SplitView lines={parseDiff(hunk)} />
                )}
              </div>
            )
          })}

        {!showImage && active && !stageable && (
          <>
            {mode === 'unified' ? (
              <UnifiedView lines={active.lines} />
            ) : (
              <SplitView lines={active.lines} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default DiffPanel
