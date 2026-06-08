import { useCallback, useEffect, useState } from 'react'
import type { LocalBranchInfo } from '../../shared/types'

interface Props {
  repoPath: string
  onClose: () => void
  onDone: (message: string) => void
}

// Never offer these for bulk deletion even if they lack a remote.
const PROTECTED = new Set(['main', 'master'])

/**
 * Lists local branches that have no remote counterpart (no upstream, or an
 * upstream that is gone) and lets the user delete a chosen subset. Offers both
 * a safe delete (refuses unmerged branches) and a force delete.
 */
function CleanupBranchesModal({ repoPath, onClose, onDone }: Props) {
  const [branches, setBranches] = useState<LocalBranchInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const result = await window.api.listLocalBranches(repoPath)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const candidates = result.branches.filter(
      (branch) =>
        !branch.current &&
        !PROTECTED.has(branch.name) &&
        (branch.upstream === null || branch.gone)
    )
    setBranches(candidates)
    setSelected(new Set(candidates.map((branch) => branch.name)))
  }, [repoPath])

  useEffect(() => {
    void load()
  }, [load])

  async function fetchPrune(): Promise<void> {
    setBusy(true)
    setError(null)
    setNote(null)
    const result = await window.api.fetch(repoPath)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNote('Fetched and pruned remotes.')
    await load()
  }

  function toggle(name: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  function setAll(value: boolean): void {
    if (value) {
      setSelected(new Set(branches.map((branch) => branch.name)))
      return
    }
    setSelected(new Set())
  }

  async function doDelete(force: boolean): Promise<void> {
    const names = branches
      .map((branch) => branch.name)
      .filter((name) => selected.has(name))
    if (names.length === 0) {
      return
    }
    setBusy(true)
    setError(null)
    setNote(null)
    const result = await window.api.deleteBranches(repoPath, names, force)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const deleted = result.outcomes.filter((outcome) => outcome.ok)
    const failed = result.outcomes.filter((outcome) => !outcome.ok)
    const summary =
      `${deleted.length} branch${deleted.length === 1 ? '' : 'es'} deleted` +
      (failed.length > 0 ? `, ${failed.length} skipped` : '')
    if (failed.length === 0) {
      onDone(summary)
      return
    }
    // Keep the modal open so the user can force-delete what was refused.
    await load()
    setNote(`${summary}. Skipped branches are not fully merged — use Force delete.`)
    setError(failed.map((outcome) => `${outcome.name}: ${outcome.error}`).join('\n'))
    setSelected(new Set(failed.map((outcome) => outcome.name)))
  }

  const selectedCount = branches.filter((branch) => selected.has(branch.name)).length
  const allSelected = branches.length > 0 && selectedCount === branches.length

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cleanup-modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="conflict-title">Clean up local branches</h3>
        <p className="conflict-sub">
          Local branches with no remote counterpart — either never pushed (no
          upstream) or whose remote branch was deleted (gone).
        </p>

        <div className="cleanup-bar">
          <button className="secondary" disabled={busy} onClick={() => void fetchPrune()}>
            Fetch &amp; prune
          </button>
          <span className="cleanup-spacer" />
          <button
            className="secondary"
            disabled={branches.length === 0}
            onClick={() => setAll(!allSelected)}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="cleanup-count">
            {selectedCount}/{branches.length} selected
          </span>
        </div>

        <div className="cleanup-list">
          {loading && <div className="empty">Loading…</div>}
          {!loading && branches.length === 0 && (
            <div className="empty">No local branches without a remote. 🎉</div>
          )}
          {!loading &&
            branches.map((branch) => (
              <label key={branch.name} className="cleanup-row" title={branch.name}>
                <input
                  type="checkbox"
                  checked={selected.has(branch.name)}
                  onChange={() => toggle(branch.name)}
                />
                <span className="cleanup-name">{branch.name}</span>
                <span className={`cleanup-tag ${branch.gone ? 'gone' : 'no-upstream'}`}>
                  {branch.gone ? `gone · ${branch.upstream}` : 'no upstream'}
                </span>
              </label>
            ))}
        </div>

        {note && <div className="cleanup-note">{note}</div>}
        {error && <div className="error cleanup-error">{error}</div>}

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="danger"
            disabled={busy || selectedCount === 0}
            title="Delete selected branches (refuses branches with unmerged commits)"
            onClick={() => void doDelete(false)}
          >
            Delete selected ({selectedCount})
          </button>
          <button
            className="danger"
            disabled={busy || selectedCount === 0}
            title="Force-delete selected branches, including ones with unmerged commits"
            onClick={() => void doDelete(true)}
          >
            Force delete ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  )
}

export default CleanupBranchesModal
