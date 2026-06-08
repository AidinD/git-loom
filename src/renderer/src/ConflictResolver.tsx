import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConflictFile } from '../../shared/types'
import {
  parseConflicts,
  buildMerged,
  isFullyResolved,
  type Choice,
  type Segment,
  type ConflictSegment
} from './conflict-parse'

interface Props {
  repoPath: string
  kind: 'merge' | 'rebase' | 'revert' | 'cherry-pick'
  onResolved: () => void
  onAbort: () => void
  onClose: () => void
}

/**
 * Conflict resolver: lists conflicted files, and for the selected file shows
 * each conflict block (Current vs Incoming) with per-block accept buttons plus
 * an editable merged-result view. Saving writes the file and stages it.
 */
function ConflictResolver({ repoPath, kind, onResolved, onAbort, onClose }: Props) {
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [merged, setMerged] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeBlock, setActiveBlock] = useState(0)
  const blockRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.api.listConflicts(repoPath)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const names = result.files.map((entry: ConflictFile) => entry.file)
    setUnresolved(names)
    setAllFiles((previous) => {
      const merged2 = new Set(previous)
      for (const name of names) {
        merged2.add(name)
      }
      return [...merged2].sort((a, b) => a.localeCompare(b))
    })
  }, [repoPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openFile = useCallback(
    async (file: string): Promise<void> => {
      setSelected(file)
      setError(null)
      const result = await window.api.readConflictFile(repoPath, file)
      if (!result.ok) {
        setError(result.error)
        setSegments([])
        setMerged('')
        return
      }
      const parsed = parseConflicts(result.content)
      const initial: Record<number, Choice> = {}
      blockRefs.current = {}
      setActiveBlock(0)
      setSegments(parsed)
      setChoices(initial)
      setMerged(buildMerged(parsed, initial))
    },
    [repoPath]
  )

  function applyChoice(index: number, choice: Choice): void {
    const next = { ...choices, [index]: choice }
    setChoices(next)
    setMerged(buildMerged(segments, next))
  }

  function applyAll(choice: Choice): void {
    const next: Record<number, Choice> = {}
    for (const segment of segments) {
      if (segment.kind === 'conflict') {
        next[segment.index] = choice
      }
    }
    setChoices(next)
    setMerged(buildMerged(segments, next))
  }

  function gotoBlock(index: number): void {
    setActiveBlock(index)
    const el = blockRefs.current[index]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  function gotoNext(): void {
    if (conflictBlocks.length === 0) {
      return
    }
    const order = conflictBlocks.map((block) => block.index)
    const pos = order.indexOf(activeBlock)
    const next = order[(pos + 1) % order.length]
    gotoBlock(next)
  }

  function gotoPrev(): void {
    if (conflictBlocks.length === 0) {
      return
    }
    const order = conflictBlocks.map((block) => block.index)
    const pos = order.indexOf(activeBlock)
    const prev = order[(pos - 1 + order.length) % order.length]
    gotoBlock(prev)
  }

  async function saveFile(): Promise<void> {
    if (!selected) {
      return
    }
    setBusy(true)
    setError(null)
    const result = await window.api.resolveConflictFile(repoPath, selected, merged)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelected(null)
    setSegments([])
    await refresh()
  }

  async function doContinue(): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await window.api.continueConflict(repoPath, kind)
    setBusy(false)
    if (result.ok) {
      onResolved()
      return
    }
    setError(result.error)
    await refresh()
  }

  async function doSkip(): Promise<void> {
    if (kind === 'merge') {
      return
    }
    setBusy(true)
    setError(null)
    const result = await window.api.skipConflict(repoPath, kind)
    setBusy(false)
    if (result.ok) {
      onResolved()
      return
    }
    setError(result.error)
    await refresh()
  }

  const conflictBlocks = segments.filter(
    (segment): segment is ConflictSegment => segment.kind === 'conflict'
  )
  const resolvedBlocks = conflictBlocks.filter(
    (block) => (choices[block.index] ?? 'none') !== 'none'
  ).length
  const remaining = unresolved.length
  const canContinue = allFiles.length > 0 && remaining === 0
  const canSave = selected !== null && merged.length >= 0 && isFullyResolved(merged)

  const oursLabel = conflictBlocks[0]?.oursLabel ?? 'HEAD'
  const theirsLabel = conflictBlocks[0]?.theirsLabel ?? 'incoming'
  let helpText: string
  if (kind === 'rebase') {
    helpText = `⚠ During a rebase the sides are inverted: Current (${oursLabel}) is the branch you're rebasing onto; Incoming (${theirsLabel}) is your own commits being replayed.`
  } else if (kind === 'cherry-pick') {
    helpText = `Current (${oursLabel}) is your branch; Incoming (${theirsLabel}) is the commit being cherry-picked in.`
  } else if (kind === 'revert') {
    helpText = `Current (${oursLabel}) is your working state; Incoming (${theirsLabel}) is the change introduced by the revert.`
  } else {
    helpText = `Current (${oursLabel}) is the branch you're on; Incoming (${theirsLabel}) is the branch being merged in.`
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal conflict-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="conflict-title">Resolve {kind} conflicts</h3>
        <p className="conflict-sub">
          {remaining > 0
            ? `${remaining} file${remaining === 1 ? '' : 's'} still in conflict`
            : 'All conflicts resolved — ready to continue'}
        </p>

        <div className="conflict-body">
          <div className="conflict-files">
            {allFiles.length === 0 && <div className="empty">No conflicted files.</div>}
            {allFiles.map((file) => {
              const isResolved = !unresolved.includes(file)
              return (
                <div
                  key={file}
                  className={`conflict-file-row${file === selected ? ' active' : ''}${
                    isResolved ? ' resolved' : ''
                  }`}
                  title={file}
                  onClick={() => void openFile(file)}
                >
                  <span className="conflict-status">{isResolved ? '✓' : '⚠'}</span>
                  <span className="conflict-file-name">{file}</span>
                </div>
              )
            })}
          </div>

          <div className="conflict-detail">
            {!selected && (
              <div className="empty conflict-hint">
                Select a file to resolve its conflicts.
              </div>
            )}

            {selected && (
              <>
                <div className="conflict-detail-bar">
                  <span className="conflict-detail-file">{selected}</span>
                  <span className="conflict-detail-actions">
                    <span className="conflict-counter">
                      {resolvedBlocks}/{conflictBlocks.length} resolved
                    </span>
                    <button
                      className="secondary"
                      disabled={conflictBlocks.length < 2}
                      title="Previous conflict"
                      onClick={gotoPrev}
                    >
                      ↑
                    </button>
                    <button
                      className="secondary"
                      disabled={conflictBlocks.length < 2}
                      title="Next conflict"
                      onClick={gotoNext}
                    >
                      ↓
                    </button>
                    <button className="secondary" onClick={() => applyAll('ours')}>
                      All Current
                    </button>
                    <button className="secondary" onClick={() => applyAll('theirs')}>
                      All Incoming
                    </button>
                  </span>
                </div>

                <div className="conflict-help">{helpText}</div>

                <div className="conflict-blocks">
                  {conflictBlocks.length === 0 && (
                    <div className="empty">No conflict markers found in this file.</div>
                  )}
                  {conflictBlocks.map((block) => {
                    const choice = choices[block.index] ?? 'none'
                    const isDone = choice !== 'none'
                    return (
                      <div
                        key={block.index}
                        ref={(el) => {
                          blockRefs.current[block.index] = el
                        }}
                        className={`cblock${block.index === activeBlock ? ' active' : ''}${
                          isDone ? ' done' : ''
                        }`}
                      >
                        <div className="cblock-choices">
                          <span className="cblock-label">
                            {isDone ? '✓ ' : ''}Conflict {block.index + 1}
                          </span>
                          {(
                            [
                              ['ours', 'Current'],
                              ['theirs', 'Incoming'],
                              ['both', 'Both (C→I)'],
                              ['both-rev', 'Both (I→C)']
                            ] as [Choice, string][]
                          ).map(([value, label]) => (
                            <button
                              key={value}
                              className={`cblock-btn${choice === value ? ' active' : ''}`}
                              onClick={() => applyChoice(block.index, value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div
                          className={`cblock-cols${
                            block.base.length > 0 ? ' has-base' : ''
                          }`}
                        >
                          <div className="cblock-col ours">
                            <div className="cblock-col-title">
                              Current · {block.oursLabel}
                            </div>
                            <pre>{block.ours.join('\n')}</pre>
                          </div>
                          {block.base.length > 0 && (
                            <div className="cblock-col base">
                              <div className="cblock-col-title">
                                Base · common ancestor
                              </div>
                              <pre>{block.base.join('\n')}</pre>
                            </div>
                          )}
                          <div className="cblock-col theirs">
                            <div className="cblock-col-title">
                              Incoming · {block.theirsLabel}
                            </div>
                            <pre>{block.theirs.join('\n')}</pre>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="conflict-merged">
                  <div className="conflict-merged-head">
                    <span>Merged result (editable)</span>
                    {!canSave && (
                      <span className="conflict-merged-warn">
                        Conflict markers remain
                      </span>
                    )}
                  </div>
                  <textarea
                    className="conflict-merged-text"
                    spellCheck={false}
                    value={merged}
                    onChange={(event) => setMerged(event.target.value)}
                  />
                  <div className="conflict-merged-actions">
                    <button disabled={busy || !canSave} onClick={() => void saveFile()}>
                      Save resolved
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {error && <div className="error conflict-error">{error}</div>}

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Later
          </button>
          <button disabled={busy || !canContinue} onClick={() => void doContinue()}>
            Continue {kind}
          </button>
          {kind !== 'merge' && (
            <button
              className="secondary"
              disabled={busy}
              title="Drop this commit and continue (use when it became empty)"
              onClick={() => void doSkip()}
            >
              Skip commit
            </button>
          )}
          <button className="danger" disabled={busy} onClick={onAbort}>
            Abort {kind}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConflictResolver
