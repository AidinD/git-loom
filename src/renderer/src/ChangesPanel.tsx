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
  commitCoauthors: string
  onCommitCoauthorsChange: (value: string) => void
  onStage: (file: string) => void
  onUnstage: (file: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onStageMany: (files: string[]) => void
  onUnstageMany: (files: string[]) => void
  onDiscardMany: (files: string[]) => void
  onAddToGitignore: (files: string[]) => void
  onStashMany: (files: string[]) => void
  onCommit: () => void
  commitSign: boolean
  onToggleSign: (value: boolean) => void
  onShowDiff: (file: string, staged: boolean) => void
  onFileHistory: (file: string) => void
  onBlame: (file: string) => void
  onStash: () => void
  onPopStash: (ref: string) => void
  onDropStash: (ref: string) => void
  onDiscard: (file: string, untracked: boolean) => void
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
}

interface Badge {
  text: string
  cls: string
  label: string
}

function badgeFor(char: string): Badge {
  switch (char) {
    case 'M':
      return { text: 'M', cls: 'mod', label: 'Modified' }
    case 'A':
      return { text: 'A', cls: 'add', label: 'Added' }
    case 'D':
      return { text: 'D', cls: 'del', label: 'Deleted' }
    case 'R':
      return { text: 'R', cls: 'mod', label: 'Renamed' }
    case 'C':
      return { text: 'C', cls: 'mod', label: 'Copied' }
    case 'T':
      return { text: 'T', cls: 'mod', label: 'Type changed' }
    case 'U':
      return { text: '!', cls: 'cfl', label: 'Conflict' }
    case '?':
      return { text: 'N', cls: 'new', label: 'New (untracked)' }
    default:
      return { text: char, cls: 'mod', label: 'Changed' }
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
  commitCoauthors,
  onCommitCoauthorsChange,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onStageMany,
  onUnstageMany,
  onDiscardMany,
  onAddToGitignore,
  onStashMany,
  onCommit,
  commitSign,
  onToggleSign,
  onShowDiff,
  onFileHistory,
  onBlame,
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
  const [showCoauthors, setShowCoauthors] = useState(false)
  const [dragFiles, setDragFiles] = useState<string[]>([])
  const [dragFrom, setDragFrom] = useState<Section | null>(null)
  const [dragStashRef, setDragStashRef] = useState<string | null>(null)
  const [dragZone, setDragZone] = useState<'staged' | 'unstaged' | 'stash' | null>(null)
  // Marquee (rubber-band) selection, started in a list's empty area.
  const [marqueeStart, setMarqueeStart] = useState<{
    section: Section
    x0: number
    y0: number
    ul: HTMLUListElement
  } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    if (!marqueeStart) {
      return
    }
    function onMove(event: MouseEvent): void {
      const start = marqueeStart!
      const top = Math.min(start.y0, event.clientY)
      const bottom = Math.max(start.y0, event.clientY)
      setMarqueeRect({
        left: Math.min(start.x0, event.clientX),
        top,
        width: Math.abs(event.clientX - start.x0),
        height: bottom - top
      })
      const paths: string[] = []
      start.ul.querySelectorAll('[data-path]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom >= top && r.top <= bottom) {
          const path = el.getAttribute('data-path')
          if (path) {
            paths.push(path)
          }
        }
      })
      setSelected(paths)
      setSection(start.section)
      setAnchor(null)
    }
    function onUp(): void {
      setMarqueeStart(null)
      setMarqueeRect(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [marqueeStart])

  function startMarquee(
    event: ReactMouseEvent<HTMLUListElement>,
    sectionName: Section
  ): void {
    // Only when pressing the empty list area, not a row, with the left button.
    if (event.target !== event.currentTarget || event.button !== 0) {
      return
    }
    event.preventDefault()
    setMarqueeStart({
      section: sectionName,
      x0: event.clientX,
      y0: event.clientY,
      ul: event.currentTarget
    })
    setSelected([])
    setSection(sectionName)
  }

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

  function handleSectionMenu(
    event: ReactMouseEvent,
    sectionName: 'staged' | 'unstaged' | 'stash'
  ): void {
    event.preventDefault()
    const items: ContextMenuItem[] = []
    if (sectionName === 'staged') {
      if (staged.length > 0) {
        items.push({ label: 'Unstage all', onClick: onUnstageAll })
      }
    } else if (sectionName === 'unstaged') {
      if (unstaged.length > 0) {
        items.push({ label: 'Stage all', onClick: onStageAll })
      }
    }
    if (hasChanges) {
      items.push({ label: 'Stash all changes', onClick: onStash })
    }
    if (sectionName === 'unstaged' && unstaged.length > 0) {
      items.push({
        label: 'Discard all',
        danger: true,
        onClick: () => onDiscardMany(unstaged.map((file) => file.path))
      })
    }
    if (items.length > 0) {
      openContextMenu(event.clientX, event.clientY, items)
    }
  }

  function handleRowMenu(
    event: ReactMouseEvent,
    sectionName: Section,
    path: string
  ): void {
    event.preventDefault()
    event.stopPropagation()
    const inSelection =
      section === sectionName && selected.includes(path) && selected.length > 1
    const targets = inSelection ? selected : [path]
    const count = targets.length
    const staged = sectionName === 'staged'
    const items: ContextMenuItem[] = []
    if (count === 1) {
      items.push({ label: 'Show diff', onClick: () => onShowDiff(path, staged) })
      items.push({ label: 'File history', onClick: () => onFileHistory(path) })
      items.push({ label: 'Blame', onClick: () => onBlame(path) })
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
      label: count > 1 ? `Stash ${count} files` : 'Stash file',
      onClick: () => onStashMany(targets)
    })
    items.push({
      label: count > 1 ? `Add ${count} files to .gitignore` : 'Add to .gitignore',
      onClick: () => onAddToGitignore(targets)
    })
    items.push({
      label: count > 1 ? `Discard ${count} files` : 'Discard',
      danger: true,
      onClick: () => onDiscardMany(targets)
    })
    openContextMenu(event.clientX, event.clientY, items)
  }

  function canDropZone(zone: 'staged' | 'unstaged' | 'stash'): boolean {
    if (dragStashRef) {
      // A stash can be applied by dropping it back onto the working tree.
      return zone === 'staged' || zone === 'unstaged'
    }
    return dragFiles.length > 0 && (zone === 'stash' || dragFrom !== zone)
  }

  function handleZoneDrop(zone: 'staged' | 'unstaged' | 'stash'): void {
    if (canDropZone(zone)) {
      if (dragStashRef) {
        onPopStash(dragStashRef)
      } else if (zone === 'staged') {
        onStageMany(dragFiles)
      } else if (zone === 'unstaged') {
        onUnstageMany(dragFiles)
      } else {
        onStashMany(dragFiles)
      }
    }
    setDragZone(null)
    setDragFiles([])
    setDragFrom(null)
    setDragStashRef(null)
  }

  function zoneProps(zone: 'staged' | 'unstaged' | 'stash') {
    return {
      onDragOver: (event: ReactMouseEvent) => {
        if (canDropZone(zone)) {
          event.preventDefault()
          setDragZone(zone)
        }
      },
      onDragLeave: () => {
        setDragZone((current) => (current === zone ? null : current))
      },
      onDrop: (event: ReactMouseEvent) => {
        event.preventDefault()
        handleZoneDrop(zone)
      }
    }
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
        data-path={file.path}
        className={`file${isSelected(sectionName, file.path) ? ' selected' : ''}`}
        draggable
        onDragStart={(event) => {
          const payload =
            isSelected(sectionName, file.path) && selected.length > 1
              ? selected
              : [file.path]
          setDragFiles(payload)
          setDragFrom(sectionName)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setDragFiles([])
          setDragFrom(null)
          setDragZone(null)
        }}
        onClick={(event) => handleRowClick(event, sectionName, index, list)}
        onDoubleClick={() => {
          if (staged) {
            onUnstage(file.path)
          } else {
            onStage(file.path)
          }
        }}
        onContextMenu={(event) => handleRowMenu(event, sectionName, file.path)}
        title={`${file.path} — double-click to ${staged ? 'unstage' : 'stage'}`}
      >
        <span className={`badge ${badge.cls}`} title={badge.label}>
          {badge.text}
        </span>
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
      {marqueeRect && (
        <div
          className="marquee"
          style={{
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height
          }}
        />
      )}
      <div
        className={`sidebar-section sized${dragZone === 'staged' ? ' drag-zone' : ''}`}
        style={{ height: stagedHeight }}
        onContextMenu={(event) => handleSectionMenu(event, 'staged')}
        {...zoneProps('staged')}
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
        <ul
          className="file-list"
          onMouseDown={(event) => startMarquee(event, 'staged')}
        >
          {staged.map((file, index) => renderRow(file, 'staged', index, staged))}
          {staged.length === 0 && <li className="empty">Nothing staged</li>}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag(stagedHeight, setStagedHeight, 60, 600)}
      />

      <div
        className={`sidebar-section sized${dragZone === 'unstaged' ? ' drag-zone' : ''}`}
        style={{ height: changesHeight }}
        onContextMenu={(event) => handleSectionMenu(event, 'unstaged')}
        {...zoneProps('unstaged')}
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
        <ul
          className="file-list"
          onMouseDown={(event) => startMarquee(event, 'unstaged')}
        >
          {unstaged.map((file, index) => renderRow(file, 'unstaged', index, unstaged))}
          {unstaged.length === 0 && staged.length === 0 && (
            <li className="empty empty-clean">
              ✓ No local changes — working tree clean.
              <br />
              Edit files, or use the ⋯ menu to open the repo.
            </li>
          )}
          {unstaged.length === 0 && staged.length > 0 && (
            <li className="empty">No unstaged changes</li>
          )}
        </ul>
      </div>

      <div
        className="resize-y"
        onMouseDown={startDrag(changesHeight, setChangesHeight, 60, 600)}
      />

      <div
        className={`sidebar-section stash-section${dragZone === 'stash' ? ' drag-zone' : ''}`}
        onContextMenu={(event) => handleSectionMenu(event, 'stash')}
        {...zoneProps('stash')}
      >
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
            <li
              key={stash.ref}
              className="stash"
              title={`${stash.ref} — drag onto Changes to apply`}
              draggable
              onDragStart={(event) => {
                setDragStashRef(stash.ref)
                setDragFiles([])
                setDragFrom(null)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                setDragStashRef(null)
                setDragZone(null)
              }}
            >
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
          placeholder="Summary (required) — Enter to commit"
          value={commitSummary}
          onChange={(event) => onCommitSummaryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (canCommit) {
                onCommit()
              }
            }
          }}
        />
        <textarea
          className="commit-message"
          placeholder="Description — Ctrl+Enter to commit"
          value={commitDescription}
          onChange={(event) => onCommitDescriptionChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              if (canCommit) {
                onCommit()
              }
            }
          }}
        />
        <button
          className="coauthor-toggle"
          onClick={() => setShowCoauthors((value) => !value)}
        >
          {showCoauthors ? '− Co-authors' : '+ Co-authors'}
        </button>
        {showCoauthors && (
          <textarea
            className="commit-message coauthor-field"
            placeholder="Co-authors — one per line, e.g. Name &lt;email&gt;"
            value={commitCoauthors}
            onChange={(event) => onCommitCoauthorsChange(event.target.value)}
          />
        )}
        <label className="sign-toggle" title="Sign commits with your SSH key">
          <input
            type="checkbox"
            checked={commitSign}
            onChange={(event) => onToggleSign(event.target.checked)}
          />
          Sign commits
        </label>
        <button className="commit-button" disabled={!canCommit} onClick={onCommit}>
          Commit {staged.length > 0 ? `(${staged.length})` : ''}
        </button>
      </div>
    </aside>
  )
}

export default ChangesPanel
