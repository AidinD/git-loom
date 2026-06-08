import { useState } from 'react'
import type { RepoEntry } from '../../shared/types'
import RepoList from './RepoList'

interface Props {
  repos: RepoEntry[]
  currentPath: string | null
  onSwitch: (path: string) => void
  onAddExisting: () => void
  onClone: () => void
  onRemove: (path: string) => void
  onSetGroup: (repo: RepoEntry) => void
  onRenameGroup: (oldName: string) => void
  onReorder: (items: { path: string; group: string }[]) => void
}

function RepoSwitcher({
  repos,
  currentPath,
  onSwitch,
  onAddExisting,
  onClone,
  onRemove,
  onSetGroup,
  onRenameGroup,
  onReorder
}: Props) {
  const [open, setOpen] = useState(false)

  const current = repos.find((repo) => repo.path === currentPath)
  const label = current ? current.name : 'Open repository…'

  return (
    <div className="repo-switcher">
      <button className="repo-current" onClick={() => setOpen((value) => !value)}>
        <span className="repo-current-name">{label}</span>
        <span className="chevron">▾</span>
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="repo-popover">
            <RepoList
              repos={repos}
              currentPath={currentPath}
              onSwitch={onSwitch}
              onAddExisting={onAddExisting}
              onClone={onClone}
              onRemove={onRemove}
              onSetGroup={onSetGroup}
              onRenameGroup={onRenameGroup}
              onReorder={onReorder}
              onActivate={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default RepoSwitcher
