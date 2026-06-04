import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { FileChange, StashEntry } from '../../shared/types'

interface Props {
  files: FileChange[]
  stashes: StashEntry[]
  commitMessage: string
  onCommitMessageChange: (value: string) => void
  onStage: (file: string) => void
  onUnstage: (file: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onCommit: () => void
  onShowDiff: (file: string, staged: boolean) => void
  onStash: () => void
  onPopStash: (ref: string) => void
  onDropStash: (ref: string) => void
  onDiscard: (file: string, untracked: boolean) => void
  openFileMenu: (
    x: number,
    y: number,
    file: string,
    staged: boolean,
    untracked: boolean
  ) => void
}

interface Badge {
  text: string
  cls: string
}

function badgeFor(char: string): Badge {
  switch (char) {
    case 'M':
      return { text: 'M', cls: 'mod' }
    case 'A':
      return { text: 'A', cls: 'add' }
    case 'D':
      return { text: 'D', cls: 'del' }
    case 'R':
      return { text: 'R', cls: 'mod' }
    case 'C':
      return { text: 'C', cls: 'mod' }
    case '?':
      return { text: 'U', cls: 'new' }
    default:
      return { text: char, cls: 'mod' }
  }
}

function isStaged(file: FileChange): boolean {
  return file.index !== ' ' && file.index !== '?'
}

function isUnstaged(file: FileChange): boolean {
  return file.worktree !== ' '
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Reads a persisted number from localStorage with a fallback. */
function stored(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function ChangesPanel({
  files,
  stashes,
  commitMessage,
  onCommitMessageChange,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onCommit,
  onShowDiff,
  onStash,
  onPopStash,
  onDropStash,
  onDiscard,
  openFileMenu
}: Props) {
  const [stagedHeight, setStagedHeight] = useState(() =>
    stored('loom.stagedHeight', 150)
  )
  const [changesHeight, setChangesHeight] = useState(() =>
    stored('loom.changesHeight', 190)
  )

  useEffect(() => {
    localStorage.setItem('loom.stagedHeight', String(stagedHeight))
  }, [stagedHeight])
  useEffect(() => {
    localStorage.setItem('loom.changesHeight', String(changesHeight))
  }, [changesHeight])

  const staged = files.filter(isStaged)
  const unstaged = files.filter(isUnstaged)
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0
  const hasChanges = files.length > 0

  function startDrag(
    axis: 'x' | 'y',
    current: number,
    setter: (value: number) => void,
    min: number,
    max: number,
    invert = false
  ) {
    return (event: ReactMouseEvent) => {
      event.preventDefault()
      const start = axis === 'x' ? event.clientX : event.clientY
      function onMove(moveEvent: MouseEvent): void {
        const now = axis === 'x' ? moveEvent.clientX : moveEvent.clientY
        const delta = (now - start) * (invert ? -1 : 1)
        setter(clamp(current + delta, min, max))
      }
      function onUp(): void {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }

  return (
    <aside className="sidebar">
      <div
        className="sidebar-section sized"
        style={{ height: stagedHeight }}
      >
        <h2 className="sidebar-title">
          <span>
            Staged <span className="count">{staged.length}</span>
          </span>
          {staged.length > 0 && (
            <button className="stash-create" onClick={onUnstageAll}>
              Unstage all
            </button>
          )}
        </h2>
        <ul className="file-list">
          {staged.map((file) => {
            const badge = badgeFor(file.index)
            return (
              <li
                key={`s-${file.path}`}
                className="file"
                onClick={() => onShowDiff(file.path, true)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openFileMenu(event.clientX, event.clientY, file.path, true, false)
                }}
                title={file.path}
              >
                <span className={`badge ${badge.cls}`}>{badge.text}</span>
                <span className="file-path">{file.path}</span>
                <button
                  className="file-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    onUnstage(file.path)
                  }}
                >
                  −
                </button>
              </li>
            )
          })}
          {staged.length === 0 && <li className="empty">Nothing staged</li>}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag('y', stagedHeight, setStagedHeight, 60, 600)}
      />

      <div
        className="sidebar-section sized"
        style={{ height: changesHeight }}
      >
        <h2 className="sidebar-title">
          <span>
            Changes <span className="count">{unstaged.length}</span>
          </span>
          {unstaged.length > 0 && (
            <button className="stash-create" onClick={onStageAll}>
              Stage all
            </button>
          )}
        </h2>
        <ul className="file-list">
          {unstaged.map((file) => {
            const badge = badgeFor(file.worktree)
            return (
              <li
                key={`u-${file.path}`}
                className="file"
                onClick={() => onShowDiff(file.path, false)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openFileMenu(
                    event.clientX,
                    event.clientY,
                    file.path,
                    false,
                    file.worktree === '?'
                  )
                }}
                title={file.path}
              >
                <span className={`badge ${badge.cls}`}>{badge.text}</span>
                <span className="file-path">{file.path}</span>
                <button
                  className="file-action"
                  title="Discard changes"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDiscard(file.path, file.worktree === '?')
                  }}
                >
                  ⟲
                </button>
                <button
                  className="file-action"
                  title="Stage"
                  onClick={(event) => {
                    event.stopPropagation()
                    onStage(file.path)
                  }}
                >
                  +
                </button>
              </li>
            )
          })}
          {unstaged.length === 0 && <li className="empty">No changes</li>}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag('y', changesHeight, setChangesHeight, 60, 600)}
      />

      <div className="sidebar-section stash-section">
        <h2 className="sidebar-title">
          <span>
            Stashes <span className="count">{stashes.length}</span>
          </span>
          <button
            className="stash-create"
            disabled={!hasChanges}
            title={hasChanges ? 'Stash all changes' : 'Nothing to stash'}
            onClick={onStash}
          >
            Stash
          </button>
        </h2>
        <ul className="file-list">
          {stashes.map((stash) => (
            <li key={stash.ref} className="stash" title={stash.ref}>
              <span className="stash-message">{stash.message}</span>
              <button
                className="file-action"
                title="Pop (apply and remove)"
                onClick={() => onPopStash(stash.ref)}
              >
                ↥
              </button>
              <button
                className="file-action"
                title="Drop (delete)"
                onClick={() => onDropStash(stash.ref)}
              >
                ×
              </button>
            </li>
          ))}
          {stashes.length === 0 && <li className="empty">No stashes</li>}
        </ul>
      </div>

      <div className="commit-box">
        <textarea
          className="commit-message"
          placeholder="Commit message"
          value={commitMessage}
          onChange={(event) => onCommitMessageChange(event.target.value)}
        />
        <button className="commit-button" disabled={!canCommit} onClick={onCommit}>
          Commit {staged.length > 0 ? `(${staged.length})` : ''}
        </button>
      </div>
    </aside>
  )
}

export default ChangesPanel
