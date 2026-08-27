import type {
  LogResult,
  CheckoutResult,
  UpstreamResult,
  LocalBranchesResult,
  DeleteBranchesResult,
  MergeResult,
  StatusResult,
  DiffResult,
  RepoEntry,
  CloneResult,
  StashListResult,
  GithubReposResult,
  PullRequestsResult,
  BranchesResult,
  AheadBehind,
  ConflictsResult,
  ConflictFileResult,
  FileHistoryResult,
  BlameResult,
  ImageDiffResult,
  RepoChange
} from '../shared/types'

export interface LoomApi {
  getVersion: () => Promise<string>
  minimizeWindow: () => void
  toggleMaximizeWindow: () => void
  closeWindow: () => void
  onUpdateReady: (callback: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  onRepoChanged: (callback: (change: RepoChange) => void) => () => void
  openRepo: () => Promise<string | null>
  getLog: (repoPath: string, limit?: number, skip?: number) => Promise<LogResult>
  checkout: (repoPath: string, target: string) => Promise<CheckoutResult>
  merge: (repoPath: string, source: string, target: string) => Promise<MergeResult>
  mergeAbort: (repoPath: string) => Promise<CheckoutResult>
  rebase: (repoPath: string, source: string, target: string) => Promise<MergeResult>
  rebaseAbort: (repoPath: string) => Promise<CheckoutResult>
  interactiveRebase: (
    repoPath: string,
    baseHash: string,
    rows: { action: string; hash: string; message?: string }[]
  ) => Promise<MergeResult>
  revert: (repoPath: string, hash: string, noCommit: boolean) => Promise<MergeResult>
  revertAbort: (repoPath: string) => Promise<CheckoutResult>
  cherryPick: (repoPath: string, hash: string) => Promise<MergeResult>
  cherryPickAbort: (repoPath: string) => Promise<CheckoutResult>
  resetTo: (
    repoPath: string,
    hash: string,
    mode: 'soft' | 'mixed' | 'hard' | 'keep'
  ) => Promise<CheckoutResult>
  getHead: (repoPath: string) => Promise<string | null>
  undoLastCommit: (repoPath: string) => Promise<CheckoutResult>
  listConflicts: (repoPath: string) => Promise<ConflictsResult>
  useOurs: (repoPath: string, file: string) => Promise<CheckoutResult>
  useTheirs: (repoPath: string, file: string) => Promise<CheckoutResult>
  markResolved: (repoPath: string, file: string) => Promise<CheckoutResult>
  continueConflict: (
    repoPath: string,
    kind: 'merge' | 'rebase' | 'revert' | 'cherry-pick'
  ) => Promise<MergeResult>
  skipConflict: (
    repoPath: string,
    kind: 'rebase' | 'cherry-pick' | 'revert'
  ) => Promise<MergeResult>
  conflictState: (
    repoPath: string
  ) => Promise<'merge' | 'rebase' | 'revert' | 'cherry-pick' | null>
  readConflictFile: (repoPath: string, file: string) => Promise<ConflictFileResult>
  resolveConflictFile: (
    repoPath: string,
    file: string,
    content: string
  ) => Promise<CheckoutResult>
  status: (repoPath: string) => Promise<StatusResult>
  diff: (
    repoPath: string,
    file: string,
    staged: boolean,
    untracked?: boolean
  ) => Promise<DiffResult>
  showCommit: (repoPath: string, hash: string) => Promise<DiffResult>
  stage: (repoPath: string, file: string) => Promise<CheckoutResult>
  stageAll: (repoPath: string) => Promise<CheckoutResult>
  unstageAll: (repoPath: string) => Promise<CheckoutResult>
  stageFiles: (repoPath: string, files: string[]) => Promise<CheckoutResult>
  unstageFiles: (repoPath: string, files: string[]) => Promise<CheckoutResult>
  unstage: (repoPath: string, file: string) => Promise<CheckoutResult>
  applyPatch: (
    repoPath: string,
    patch: string,
    reverse: boolean
  ) => Promise<CheckoutResult>
  fileHistory: (repoPath: string, file: string) => Promise<FileHistoryResult>
  blame: (repoPath: string, file: string) => Promise<BlameResult>
  imageDiff: (
    repoPath: string,
    file: string,
    staged: boolean
  ) => Promise<ImageDiffResult>
  commit: (repoPath: string, message: string, sign?: boolean) => Promise<CheckoutResult>
  clone: (url: string, parentDir: string) => Promise<CloneResult>
  listGithubRepos: () => Promise<GithubReposResult>
  listPullRequests: (repoPath: string) => Promise<PullRequestsResult>
  checkoutPullRequest: (repoPath: string, num: number) => Promise<CheckoutResult>
  revealRepo: (repoPath: string) => Promise<void>
  repoExists: (repoPath: string) => Promise<boolean>
  openInEditor: (repoPath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  openRepoOnGitHub: (repoPath: string) => Promise<string | null>
  listRepos: () => Promise<RepoEntry[]>
  addRepo: (repoPath: string) => Promise<RepoEntry[]>
  removeRepo: (repoPath: string) => Promise<RepoEntry[]>
  setRepoGroup: (repoPath: string, group: string) => Promise<RepoEntry[]>
  setReposLayout: (
    items: { path: string; group: string }[]
  ) => Promise<RepoEntry[]>
  renameRepoGroup: (oldName: string, newName: string) => Promise<RepoEntry[]>
  stashList: (repoPath: string) => Promise<StashListResult>
  stashPush: (repoPath: string, message: string) => Promise<CheckoutResult>
  stashFiles: (
    repoPath: string,
    files: string[],
    message: string
  ) => Promise<CheckoutResult>
  stashPop: (repoPath: string, ref: string) => Promise<CheckoutResult>
  stashDrop: (repoPath: string, ref: string) => Promise<CheckoutResult>
  fetch: (repoPath: string) => Promise<CheckoutResult>
  pull: (repoPath: string) => Promise<CheckoutResult>
  pullRebase: (repoPath: string) => Promise<MergeResult>
  pullMerge: (repoPath: string) => Promise<MergeResult>
  push: (repoPath: string) => Promise<CheckoutResult>
  getCurrentRepo: () => Promise<string | null>
  setCurrentRepo: (repoPath: string) => Promise<void>
  listBranches: (repoPath: string) => Promise<BranchesResult>
  aheadBehind: (repoPath: string) => Promise<AheadBehind>
  createBranch: (
    repoPath: string,
    name: string,
    startPoint?: string
  ) => Promise<CheckoutResult>
  deleteBranch: (
    repoPath: string,
    name: string,
    force: boolean
  ) => Promise<CheckoutResult>
  deleteRemoteBranch: (
    repoPath: string,
    remote: string,
    branch: string
  ) => Promise<CheckoutResult>
  getUpstream: (repoPath: string, name: string) => Promise<UpstreamResult>
  listLocalBranches: (repoPath: string) => Promise<LocalBranchesResult>
  deleteBranches: (
    repoPath: string,
    names: string[],
    force: boolean
  ) => Promise<DeleteBranchesResult>
  renameBranch: (
    repoPath: string,
    oldName: string,
    newName: string
  ) => Promise<CheckoutResult>
  discardFile: (
    repoPath: string,
    file: string,
    untracked: boolean
  ) => Promise<CheckoutResult>
  discardFiles: (
    repoPath: string,
    tracked: string[],
    untracked: string[]
  ) => Promise<CheckoutResult>
  addToGitignore: (
    repoPath: string,
    tracked: string[],
    untracked: string[]
  ) => Promise<CheckoutResult>
}

declare global {
  interface Window {
    api: LoomApi
  }
}
