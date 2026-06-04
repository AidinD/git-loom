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
}

const UNGROUPED = 'Ungrouped'

/** Shows the containing folder (last two segments), not the full path. */
function shortParent(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  const parent = parts.slice(0, -1)
  if (parent.length <= 2) {
    return parent.join('/')
  }
  return `…/${parent.slice(-2).join('/')}`
}

function RepoSwitcher({
  repos,
  currentPath,
  onSwitch,
  onAddExisting,
  onClone,
  onRemove,
  onSetGroup
}: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const current = repos.find((repo) => repo.path === currentPath)
  const label = current ? current.name : 'Open repository…'

  const needle = filter.trim().toLowerCase()
  const filtered = repos.filter(
    (repo) =>
      needle.length === 0 ||
      repo.name.toLowerCase().includes(needle) ||
      repo.path.toLowerCase().includes(needle)
  )

  const groups = new Map<string, RepoEntry[]>()
  for (const repo of filtered) {
    const key = repo.group || UNGROUPED
    const list = groups.get(key) ?? []
    list.push(repo)
    groups.set(key, list)
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    if (a === UNGROUPED) {
      return 1
    }
    if (b === UNGROUPED) {
      return -1
    }
    return a.localeCompare(b)
  })

  function close(): void {
    setOpen(false)
    setFilter('')
  }

  return (
    <div className="repo-switcher">
      <button className="repo-current" onClick={() => setOpen((value) => !value)}>
        <span className="repo-current-name">{label}</span>
        <span className="chevron">▾</span>
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={close} />
          <div className="repo-popover">
            <input
              className="repo-filter"
              placeholder="Filter repositories"
              value={filter}
              autoFocus
              onChange={(event) => setFilter(event.target.value)}
            />

            <div className="repo-popover-actions">
              <button
                onClick={() => {
                  close()
                  onAddExisting()
                }}
              >
                + Add existing…
              </button>
              <button
                onClick={() => {
                  close()
                  onClone()
                }}
              >
                ⤓ Clone…
              </button>
            </div>

            <div className="repo-groups">
              {groupNames.length === 0 && (
                <div className="empty">No repositories yet</div>
              )}
              {groupNames.map((groupName) => (
                <div className="repo-group" key={groupName}>
                  <div className="repo-group-title">{groupName}</div>
                  {groups.get(groupName)!.map((repo) => (
                    <div
                      key={repo.path}
                      className={`repo-item${repo.path === currentPath ? ' active' : ''}`}
                      onClick={() => {
                        close()
                        onSwitch(repo.path)
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
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default RepoSwitcher
