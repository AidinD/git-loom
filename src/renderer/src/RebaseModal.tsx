import { useState } from 'react'

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface RebaseRow {
  hash: string
  subject: string
  action: RebaseAction
  /** New message for `reword` rows. */
  message?: string
}

interface Props {
  baseHash: string
  rows: RebaseRow[]
  onCancel: () => void
  onStart: (rows: RebaseRow[]) => void
}

const ACTIONS: { value: RebaseAction; label: string; hint: string }[] = [
  { value: 'pick', label: 'Pick', hint: 'Keep this commit' },
  { value: 'reword', label: 'Reword', hint: 'Keep the commit, edit its message' },
  { value: 'squash', label: 'Squash', hint: 'Merge into the commit above (keep both messages)' },
  { value: 'fixup', label: 'Fixup', hint: 'Merge into the commit above (discard this message)' },
  { value: 'drop', label: 'Drop', hint: 'Remove this commit' }
]

/**
 * Interactive rebase editor: reorder commits by dragging, pick an action per
 * commit, then start. Rows are shown oldest-first (the order git replays them).
 */
function RebaseModal({ baseHash, rows, onCancel, onStart }: Props) {
  const [items, setItems] = useState<RebaseRow[]>(rows)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function move(from: number, to: number): void {
    if (from === to) {
      return
    }
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
  }

  function setAction(index: number, action: RebaseAction): void {
    setItems((current) =>
      current.map((row, i) => {
        if (i !== index) {
          return row
        }
        // Seed the reword message with the current subject the first time.
        const message =
          action === 'reword' && row.message === undefined ? row.subject : row.message
        return { ...row, action, message }
      })
    )
  }

  function setMessage(index: number, message: string): void {
    setItems((current) =>
      current.map((row, i) => (i === index ? { ...row, message } : row))
    )
  }

  const kept = items.filter((row) => row.action !== 'drop').length
  // The first kept commit can't squash/fixup — there is nothing above it.
  const firstKept = items.findIndex((row) => row.action !== 'drop')

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal rebase-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="conflict-title">Interactive rebase</h3>
        <p className="conflict-sub">
          {items.length} commit{items.length === 1 ? '' : 's'} onto{' '}
          {baseHash.slice(0, 7)} · drag to reorder · oldest first
        </p>

        <div className="rebase-list">
          {items.map((row, index) => (
            <div
              key={row.hash}
              className={`rebase-row${row.action === 'drop' ? ' dropped' : ''}${
                dropIndex === index ? ' drop-before' : ''
              }${dragIndex === index ? ' dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDropIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null) {
                  move(dragIndex, index)
                }
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <span
                className="rebase-grip"
                title="Drag to reorder"
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDropIndex(null)
                }}
              >
                ⠿
              </span>
              <select
                className="rebase-action"
                value={row.action}
                onChange={(event) => setAction(index, event.target.value as RebaseAction)}
              >
                {ACTIONS.map((action) => (
                  <option
                    key={action.value}
                    value={action.value}
                    disabled={
                      (action.value === 'squash' || action.value === 'fixup') &&
                      index === firstKept
                    }
                  >
                    {action.label}
                  </option>
                ))}
              </select>
              <code className="rebase-hash">{row.hash.slice(0, 7)}</code>
              {row.action === 'reword' ? (
                <input
                  className="rebase-message"
                  value={row.message ?? ''}
                  placeholder="New commit message"
                  onChange={(event) => setMessage(index, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <span className="rebase-subject">{row.subject}</span>
              )}
            </div>
          ))}
        </div>

        <p className="modal-hint">
          {kept === 0
            ? 'Every commit is dropped — that will remove them all.'
            : `Result: ${kept} commit${kept === 1 ? '' : 's'}.`}
        </p>

        <div className="modal-actions">
          <button onClick={() => onStart(items)}>Start rebase</button>
          <button className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default RebaseModal
