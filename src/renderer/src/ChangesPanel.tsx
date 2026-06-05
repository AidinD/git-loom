import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { FileChange, StashEntry } from '../../shared/types'
import type { ContextMenuItem } from './ContextMenu'

type Section = 'staged' | 'unstaged'

interface Props {
  files: FileChange[]
  stashes: StashEntry[]
  commitSummary: string
  onCommitSummaryChange: (value: string) => void
  commitDescription: string
  onCommitDescriptionChange: (value: string) => void
  onStage: (file: string) => void
  onUnstage: (file: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onStageMany: (files: string[]) => void
  onUnstageMany: (files: string[]) => void
  onDiscardMany: (files: string[]) => void
  onCommit: () => void
  onShowDiff: (file: string, staged: boolean) => void
  onStash: () => void
  onPopStash: (ref: string) => void
  onDropStash: (ref: string) => void
  onDiscard: (file: string, untracked: boolean) => void
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
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
  commitSummary,
  onCommitSummaryChange,
  commitDescription,
  onCommitDescriptionChange,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onStageMany,
  onUnstageMany,
  onDiscardMany,
  onCommit,
  onShowDiff,
  onStash,
  onPopStash,
  onDropStash,
  onDiscard,
  openContextMenu
}: Props) {
  const [stagedHeight, setStagedHeight] = useState(() =>
    stored('loom.stagedHeight', 150)
  )
  const [changesHeight, setChangesHeight] = useState(() =>
    stored('loom.changesHeight', 190)
  )
  const [selected, setSelected] = useState<string[]>([])
  const [section, setSection] = useState<Section | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem('loom.stagedHeight', String(stagedHeight))
  }, [stagedHeight])
  useEffect(() => {
    localStorage.setItem('loom.changesHeight', String(changesHeight))
  }, [changesHeight])

  const staged = files.filter(isStaged)
  const unstaged = files.filter(isUnstaged)
  const canCommit = staged.length > 0 && commitSummary.trim().length > 0
  const hasChanges = files.length > 0

  function isSelected(sectionName: Section, path: string): boolean {
    return section === sectionName && selected.includes(path)
  }

  function handleRowClick(
    event: ReactMouseEvent,
    sectionName: Section,
    index: number,
    list: FileChange[]
  ): void {
    const path = list[index].path
    if (event.shiftKey && anchor !== null && section === sectionName) {
      const lo = Math.min(anchor, index)
      const hi = Math.max(anchor, index)
      setSelected(list.slice(lo, hi + 1).map((file) => file.path))
      return
    }
    if (event.ctrlKey || event.metaKey) {
      if (section !== sectionName) {
        setSelected([path])
        setSection(sectionName)
        setAnchor(index)
        return
      }
      setSelected((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
      )
      setAnchor(index)
      return
    }
    setSelected([path])
    setSection(sectionName)
    setAnchor(index)
    onShowDiff(path, sectionName === 'staged')
  }

  function handleRowMenu(
    event: ReactMouseEvent,
    sectionName: Section,
    path: string
  ): void {
    event.preventDefault()
    const inSelection =
      section === sectionName && selected.includes(path) && selected.length > 1
    const targets = inSelection ? selected : [path]
    const count = targets.length
    const staged = sectionName === 'staged'
    const items: ContextMenuItem[] = []
    if (count === 1) {
      items.push({ label: 'Show diff', onClick: () => onShowDiff(path, staged) })
    }
    if (staged) {
      items.push({
        label: count > 1 ? `Unstage ${count} files` : 'Unstage',
        onClick: () => onUnstageMany(targets)
      })
    } else {
      items.push({
        label: count > 1 ? `Stage ${count} files` : 'Stage',
        onClick: () => onStageMany(targets)
      })
    }
    items.push({
      label: count > 1 ? `Discard ${count} files` : 'Discard',
      danger: true,
      onClick: () => onDiscardMany(targets)
    })
    openContextMenu(event.clientX, event.clientY, items)
  }

  function renderRow(
    file: FileChange,
    sectionName: Section,
    index: number,
    list: FileChange[]
  ): JSX.Element {
    const staged = sectionName === 'staged'
    const badge = badgeFor(staged ? file.index : file.worktree)
    return (
      <li
        key={`${sectionName}-${file.path}`}
        className={`file${isSelected(sectionName, file.path) ? ' selected' : ''}`}
        onClick={(event) => handleRowClick(event, sectionName, index, list)}
        onContextMenu={(event) => handleRowMenu(event, sectionName, file.path)}
        title={file.path}
      >
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
        <span className="file-path">{file.path}</span>
        {!staged && (
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
        )}
        <button
          className="file-action"
          title={staged ? 'Unstage' : 'Stage'}
          onClick={(event) => {
            event.stopPropagation()
            if (staged) {
              onUnstage(file.path)
            } else {
              onStage(file.path)
            }
          }}
        >
          {staged ? '−' : '+'}
        </button>
      </li>
    )
  }

  function startDrag(
    current: number,
    setter: (value: number) => void,
    min: number,
    max: number
  ) {
    return (event: ReactMouseEvent) => {
      event.preventDefault()
      const start = event.clientY
      function onMove(moveEvent: MouseEvent): void {
        setter(clamp(current + moveEvent.clientY - start, min, max))
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
      <div className="sidebar-section sized" style={{ height: stagedHeight }}>
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
          {staged.map((file, index) => renderRow(file, 'staged', index, staged))}
          {staged.length === 0 && <li className="empty">Nothing staged</li>}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag(stagedHeight, setStagedHeight, 60, 600)}
      />

      <div className="sidebar-section sized" style={{ height: changesHeight }}>
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
          {unstaged.map((file, index) => renderRow(file, 'unstaged', index, unstaged))}
          {unstaged.length === 0 && <li className="empty">No changes</li>}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag(changesHeight, setChangesHeight, 60, 600)}
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
        <input
          className="commit-message commit-summary"
          placeholder="Summary (required)"
          value={commitSummary}
          onChange={(event) => onCommitSummaryChange(event.target.value)}
        />
        <textarea
          className="commit-message"
          placeholder="Description"
          value={commitDescription}
          onChange={(event) => onCommitDescriptionChange(event.target.value)}
        />
        <button className="commit-button" disabled={!canCommit} onClick={onCommit}>
          Commit {staged.length > 0 ? `(${staged.length})` : ''}
        </button>
      </div>
    </aside>
  )
}

export default ChangesPanel
