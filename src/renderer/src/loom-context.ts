import { createContext, useContext } from 'react'
import type { Commit, FileChange, StashEntry } from '../../shared/types'

/**
 * Everything the dockable panels need. App owns the state and handlers; panels
 * read them from here so dockview can manage layout independently of data flow.
 */
export interface LoomContextValue {
  // History / graph panel
  commits: Commit[]
  remotes: string[]
  repoPath: string | null
  selected: string | null
  setSelected: (hash: string | null) => void
  onCheckout: (target: string | null) => void
  dragSource: string | null
  setDragSource: (value: string | null) => void
  dragOver: string | null
  setDragOver: (value: string | null) => void
  requestMerge: (source: string, target: string, targetLabel: string) => void

  // Changes panel
  changes: FileChange[]
  stashes: StashEntry[]
  commitMessage: string
  setCommitMessage: (value: string) => void
  onStage: (file: string) => void
  onUnstage: (file: string) => void
  onCommit: () => void
  onShowDiff: (file: string, staged: boolean) => void
  onStash: () => void
  onPopStash: (ref: string) => void
  onDropStash: (ref: string) => void
}

export const LoomContext = createContext<LoomContextValue | null>(null)

export function useLoom(): LoomContextValue {
  const value = useContext(LoomContext)
  if (!value) {
    throw new Error('useLoom must be used within a LoomContext provider')
  }
  return value
}
