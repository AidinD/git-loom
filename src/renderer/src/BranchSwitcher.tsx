import { useState } from 'react'

interface Props {
  current: string
  branches: string[]
  onCheckout: (name: string) => void
  onNewBranch: () => void
}

function BranchSwitcher({ current, branches, onCheckout, onNewBranch }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const needle = filter.trim().toLowerCase()
  const filtered = branches.filter(
    (branch) => needle.length === 0 || branch.toLowerCase().includes(needle)
  )

  function close(): void {
    setOpen(false)
    setFilter('')
  }

  return (
    <div className="repo-switcher">
      <button className="branch-current" onClick={() => setOpen((value) => !value)}>
        <span className="branch-glyph">⎇</span>
        <span className="repo-current-name">{current || 'detached HEAD'}</span>
        <span className="chevron">▾</span>
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={close} />
          <div className="repo-popover">
            <input
              className="repo-filter"
              placeholder="Filter branches"
              value={filter}
              autoFocus
              onChange={(event) => setFilter(event.target.value)}
            />
            <div className="repo-popover-actions">
              <button
                onClick={() => {
                  close()
                  onNewBranch()
                }}
              >
                + New branch
              </button>
            </div>
            <div className="repo-groups">
              {filtered.map((branch) => (
                <div
                  key={branch}
                  className={`repo-item${branch === current ? ' active' : ''}`}
                  onClick={() => {
                    close()
                    onCheckout(branch)
                  }}
                  title={branch}
                >
                  <span className="repo-item-name">{branch}</span>
                </div>
              ))}
              {filtered.length === 0 && <div className="empty">No branches</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default BranchSwitcher
