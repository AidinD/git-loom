import { createContext, useContext } from 'react'
import type { Commit, FileChange, StashEntry, RepoEntry } from '../../shared/types'
import type { ContextMenuItem } from './ContextMenu'

export interface DiffView {
  title: string
  subtitle: string
  text: string
  /** Set for working-tree diffs that support hunk staging. */
  file?: string
  staged?: boolean
}

/**
 * Everything the dockable panels need. App owns the state and handlers; panels
 * read them from here so dockview can manage layout independently of data flow.
 */
export interface LoomContextValue {
  // History / graph panel
  commits: Commit[]
  onLoadMore: () => void
  remotes: string[]
  repoPath: string | null
  selected: string | null
  setSelected: (hash: string | null) => void
  onCheckout: (target: string | null) => void
  onShowCommit: (hash: string, subject: string) => void
  onRevert: (hash: string, noCommit: boolean) => void
  onCherryPick: (hash: string) => void
  onResetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void
  onCheckoutPr: (number: number) => void
  dragSource: string | null
  setDragSource: (value: string | null) => void
  dragOver: string | null
  setDragOver: (value: string | null) => void
  onMerge: (source: string, target: string, targetLabel: string) => void
  onRebase: (source: string, target: string, targetLabel: string) => void
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  onRenameBranch: (name: string) => void
  onDeleteBranch: (name: string) => void
  onNewBranchFrom: (startPoint: string) => void

  // Changes panel
  changes: FileChange[]
  stashes: StashEntry[]
  commitSummary: string
  setCommitSummary: (value: string) => void
  commitDescription: string
  setCommitDescription: (value: string) => void
  commitCoauthors: string
  setCommitCoauthors: (value: string) => void
  onStage: (file: string) => void
  onUnstage: (file: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onStageMany: (files: string[]) => void
  onUnstageMany: (files: string[]) => void
  onDiscardMany: (files: string[]) => void
  onStashMany: (files: string[]) => void
  onCommit: () => void
  onShowDiff: (file: string, staged: boolean) => void
  onStageHunk: (file: string, staged: boolean, patch: string) => void
  onStash: () => void
  onPopStash: (ref: string) => void
  onDropStash: (ref: string) => void
  onDiscard: (file: string, untracked: boolean) => void
  diffView: DiffView | null
  selectedDiffFile: string | null
  setSelectedDiffFile: (file: string | null) => void

  // Repositories panel (mirrors the toolbar dropdown)
  repos: RepoEntry[]
  onSwitchRepo: (path: string) => void
  onAddExistingRepo: () => void
  onCloneRepo: () => void
  onRemoveRepo: (path: string) => void
  onSetRepoGroup: (repo: RepoEntry) => void
  onRenameRepoGroup: (oldName: string) => void
  onReorderRepos: (items: { path: string; group: string }[]) => void
}

export const LoomContext = createContext<LoomContextValue | null>(null)

export function useLoom(): LoomContextValue {
  const value = useContext(LoomContext)
  if (!value) {
    throw new Error('useLoom must be used within a LoomContext provider')
  }
  return value
}
