import { useCallback, useEffect, useState } from 'react'
import type { ConflictFile } from '../../shared/types'

interface Props {
  repoPath: string
  kind: 'merge' | 'rebase' | 'revert'
  onResolved: () => void
  onAbort: () => void
}

/**
 * Practical conflict resolver: lists conflicted files and lets the user take
 * ours/theirs or mark a manually-edited file resolved, then continue or abort.
 */
function ConflictResolver({ repoPath, kind, onResolved, onAbort }: Props) {
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.api.listConflicts(repoPath)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const names = result.files.map((entry: ConflictFile) => entry.file)
    setUnresolved(names)
    setAllFiles((previous) => {
      const merged = new Set(previous)
      for (const name of names) {
        merged.add(name)
      }
      return [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [repoPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function act(
    op: (path: string, file: string) => Promise<{ ok: boolean; error?: string }>,
    file: string
  ): Promise<void> {
    setBusy(true)
    setError(null)
    const result = await op(repoPath, file)
    if (!result.ok && result.error) {
      setError(result.error)
    }
    await refresh()
    setBusy(false)
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

  const remaining = unresolved.length
  const canContinue = allFiles.length > 0 && remaining === 0

  return (
    <div className="modal-backdrop">
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

        <div className="conflict-list">
          {allFiles.length === 0 && (
            <div className="empty">No conflicted files.</div>
          )}
          {allFiles.map((file) => {
            const isResolved = !unresolved.includes(file)
            return (
              <div
                key={file}
                className={`conflict-item${isResolved ? ' resolved' : ''}`}
              >
                <span className="conflict-status">{isResolved ? '✓' : '⚠'}</span>
                <span className="conflict-file" title={file}>
                  {file}
                </span>
                <div className="conflict-actions">
                  <button
                    className="secondary"
                    disabled={busy || isResolved}
                    onClick={() => void act(window.api.useOurs, file)}
                  >
                    Use ours
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || isResolved}
                    onClick={() => void act(window.api.useTheirs, file)}
                  >
                    Use theirs
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || isResolved}
                    title="Stage the file as manually resolved"
                    onClick={() => void act(window.api.markResolved, file)}
                  >
                    Mark resolved
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {error && <div className="error conflict-error">{error}</div>}

        <div className="modal-actions">
          <button disabled={busy || !canContinue} onClick={() => void doContinue()}>
            Continue {kind}
          </button>
          <button className="danger" disabled={busy} onClick={onAbort}>
            Abort {kind}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConflictResolver
