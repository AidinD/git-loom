import { useState } from 'react'
import type { RepoEntry } from '../../shared/types'

interface Props {
  repos: RepoEntry[]
  currentPath: string | null
  onSwitch: (path: string) => void
  onAddExisting: () => void
  onClone: () => void
  onRemove: (path: string) => void
  onSetGroup: (repo: RepoEntry) => void
  onReorder: (items: { path: string; group: string }[]) => void
  /** Called after a switch/add/clone — used by the dropdown to close itself. */
  onActivate?: () => void
}

const UNGROUPED = 'Ungrouped'
const COLLAPSED_KEY = 'loom.collapsedGroups'

/** Shows the containing folder (last two segments), not the full path. */
function shortParent(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  const parent = parts.slice(0, -1)
  if (parent.length <= 2) {
    return parent.join('/')
  }
  return `…/${parent.slice(-2).join('/')}`
}

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw) {
      return new Set(JSON.parse(raw) as string[])
    }
  } catch {
    // ignore corrupt value
  }
  return new Set()
}

interface Group {
  name: string
  repos: RepoEntry[]
}

/**
 * The repository list with grouping, drag-and-drop reordering, and collapsible
 * groups. Shared by the toolbar dropdown (RepoSwitcher) and the docked panel.
 */
function RepoList({
  repos,
  currentPath,
  onSwitch,
  onAddExisting,
  onClone,
  onRemove,
  onSetGroup,
  onReorder,
  onActivate
}: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [dragPath, setDragPath] = useState<string | null>(null)
  const [dragGroup, setDragGroup] = useState<string | null>(null)
  const [dropRow, setDropRow] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<string | null>(null)

  const needle = filter.trim().toLowerCase()
  const dragEnabled = needle.length === 0
  const filtered = repos.filter(
    (repo) =>
      needle.length === 0 ||
      repo.name.toLowerCase().includes(needle) ||
      repo.path.toLowerCase().includes(needle)
  )

  // Group order follows first appearance in the array; Ungrouped sinks last.
  const groups: Group[] = []
  const byName = new Map<string, Group>()
  for (const repo of filtered) {
    const key = repo.group || UNGROUPED
    let group = byName.get(key)
    if (!group) {
      group = { name: key, repos: [] }
      byName.set(key, group)
      groups.push(group)
    }
    group.repos.push(repo)
  }
  groups.sort((a, b) => (a.name === UNGROUPED ? 1 : 0) - (b.name === UNGROUPED ? 1 : 0))

  function activate(action: () => void): void {
    setFilter('')
    clearDrag()
    if (onActivate) {
      onActivate()
    }
    action()
  }

  function persistCollapsed(next: Set<string>): void {
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
    } catch {
      // ignore quota/serialization errors
    }
  }

  function toggleGroup(name: string): void {
    const next = new Set(collapsed)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    persistCollapsed(next)
  }

  function clearDrag(): void {
    setDragPath(null)
    setDragGroup(null)
    setDropRow(null)
    setDropZone(null)
  }

  /** Drops the dragged repo just before `targetPath`, adopting its group. */
  function dropOnRow(targetPath: string): void {
    if (!dragPath || dragPath === targetPath) {
      clearDrag()
      return
    }
    const target = repos.find((repo) => repo.path === targetPath)
    if (!target) {
      clearDrag()
      return
    }
    const rest = repos
      .filter((repo) => repo.path !== dragPath)
      .map((repo) => ({ path: repo.path, group: repo.group }))
    const index = rest.findIndex((repo) => repo.path === targetPath)
    rest.splice(index, 0, { path: dragPath, group: target.group })
    onReorder(rest)
    clearDrag()
  }

  /** Drops the dragged repo at the end of `groupName`. */
  function dropOnGroup(groupName: string): void {
    if (!dragPath) {
      clearDrag()
      return
    }
    const group = groupName === UNGROUPED ? '' : groupName
    const rest = repos
      .filter((repo) => repo.path !== dragPath)
      .map((repo) => ({ path: repo.path, group: repo.group }))
    let lastIndex = -1
    rest.forEach((repo, i) => {
      if ((repo.group || UNGROUPED) === groupName) {
        lastIndex = i
      }
    })
    const insertAt = lastIndex === -1 ? rest.length : lastIndex + 1
    rest.splice(insertAt, 0, { path: dragPath, group })
    onReorder(rest)
    clearDrag()
  }

  /** Drops the dragged group's block of repos just before `targetGroupName`. */
  function dropGroupBefore(targetGroupName: string): void {
    if (!dragGroup || dragGroup === targetGroupName) {
      clearDrag()
      return
    }
    const block = repos
      .filter((repo) => (repo.group || UNGROUPED) === dragGroup)
      .map((repo) => ({ path: repo.path, group: repo.group }))
    const rest = repos
      .filter((repo) => (repo.group || UNGROUPED) !== dragGroup)
      .map((repo) => ({ path: repo.path, group: repo.group }))
    let index = rest.findIndex((repo) => (repo.group || UNGROUPED) === targetGroupName)
    if (index === -1) {
      index = rest.length
    }
    rest.splice(index, 0, ...block)
    onReorder(rest)
    clearDrag()
  }

  return (
    <div className="repo-list">
      <input
        className="repo-filter"
        placeholder="Filter repositories"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

      <div className="repo-popover-actions">
        <button onClick={() => activate(onAddExisting)}>+ Add existing…</button>
        <button onClick={() => activate(onClone)}>⤓ Clone…</button>
      </div>

      <div className="repo-groups">
        {groups.length === 0 && <div className="empty">No repositories yet</div>}
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.name)
          return (
            <div className="repo-group" key={group.name}>
              <div
                className={`repo-group-title${
                  dropZone === group.name ? ' drop-target' : ''
                }${dragGroup === group.name ? ' dragging' : ''}`}
                draggable={dragEnabled && group.name !== UNGROUPED}
                onClick={() => toggleGroup(group.name)}
                onDragStart={(event) => {
                  event.stopPropagation()
                  setDragGroup(group.name)
                }}
                onDragEnd={clearDrag}
                onDragOver={(event) => {
                  if (dragEnabled && (dragPath || dragGroup)) {
                    event.preventDefault()
                    setDropZone(group.name)
                  }
                }}
                onDragLeave={() => setDropZone(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragGroup) {
                    dropGroupBefore(group.name)
                  } else {
                    dropOnGroup(group.name)
                  }
                }}
              >
                <span className="repo-group-chevron">{isCollapsed ? '▸' : '▾'}</span>
                <span>{group.name}</span>
                <span className="repo-group-count">{group.repos.length}</span>
              </div>

              {!isCollapsed &&
                group.repos.map((repo) => (
                  <div
                    key={repo.path}
                    className={`repo-item${repo.path === currentPath ? ' active' : ''}${
                      dragPath === repo.path ? ' dragging' : ''
                    }${dropRow === repo.path ? ' drop-before' : ''}`}
                    draggable={dragEnabled}
                    onClick={() => activate(() => onSwitch(repo.path))}
                    onDragStart={() => setDragPath(repo.path)}
                    onDragEnd={clearDrag}
                    onDragOver={(event) => {
                      if (dragEnabled && dragPath && dragPath !== repo.path) {
                        event.preventDefault()
                        setDropRow(repo.path)
                      }
                    }}
                    onDragLeave={() => setDropRow(null)}
                    onDrop={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      dropOnRow(repo.path)
                    }}
                    title={repo.path}
                  >
                    <span className="repo-item-name">{repo.name}</span>
                    <span className="repo-item-path">{shortParent(repo.path)}</span>
                    <button
                      className="repo-item-action"
                      title="Set group"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSetGroup(repo)
                      }}
                    >
                      ⋯
                    </button>
                    <button
                      className="repo-item-action"
                      title="Remove from list"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemove(repo.path)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          )
        })}

        {dragEnabled && dragPath && (
          <div
            className={`repo-newgroup${dropZone === '__new__' ? ' drop-target' : ''}`}
            onDragOver={(event) => {
              if (dragPath) {
                event.preventDefault()
                setDropZone('__new__')
              }
            }}
            onDragLeave={() => setDropZone(null)}
            onDrop={(event) => {
              event.preventDefault()
              const dragged = repos.find((repo) => repo.path === dragPath)
              clearDrag()
              if (dragged) {
                onSetGroup(dragged)
              }
            }}
          >
            + New group (drop here)
          </div>
        )}
      </div>
    </div>
  )
}

export default RepoList
