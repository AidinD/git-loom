import { contextBridge, ipcRenderer } from 'electron'
import type {
  LogResult,
  CheckoutResult,
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
  BlameResult
} from '../shared/types'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openRepo: (): Promise<string | null> => ipcRenderer.invoke('repo:open'),
  getLog: (repoPath: string, limit?: number, skip?: number): Promise<LogResult> =>
    ipcRenderer.invoke('git:log', repoPath, limit, skip),
  checkout: (repoPath: string, target: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:checkout', repoPath, target),
  merge: (repoPath: string, source: string, target: string): Promise<MergeResult> =>
    ipcRenderer.invoke('git:merge', repoPath, source, target),
  mergeAbort: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:mergeAbort', repoPath),
  rebase: (repoPath: string, source: string, target: string): Promise<MergeResult> =>
    ipcRenderer.invoke('git:rebase', repoPath, source, target),
  rebaseAbort: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:rebaseAbort', repoPath),
  interactiveRebase: (
    repoPath: string,
    baseHash: string,
    rows: { action: string; hash: string; message?: string }[]
  ): Promise<MergeResult> =>
    ipcRenderer.invoke('git:interactiveRebase', repoPath, baseHash, rows),
  revert: (
    repoPath: string,
    hash: string,
    noCommit: boolean
  ): Promise<MergeResult> => ipcRenderer.invoke('git:revert', repoPath, hash, noCommit),
  revertAbort: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:revertAbort', repoPath),
  cherryPick: (repoPath: string, hash: string): Promise<MergeResult> =>
    ipcRenderer.invoke('git:cherryPick', repoPath, hash),
  cherryPickAbort: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:cherryPickAbort', repoPath),
  resetTo: (
    repoPath: string,
    hash: string,
    mode: 'soft' | 'mixed' | 'hard'
  ): Promise<CheckoutResult> => ipcRenderer.invoke('git:resetTo', repoPath, hash, mode),
  undoLastCommit: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:undoLastCommit', repoPath),
  conflictState: (
    repoPath: string
  ): Promise<'merge' | 'rebase' | 'revert' | 'cherry-pick' | null> =>
    ipcRenderer.invoke('git:conflictState', repoPath),
  listConflicts: (repoPath: string): Promise<ConflictsResult> =>
    ipcRenderer.invoke('git:listConflicts', repoPath),
  useOurs: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:useOurs', repoPath, file),
  useTheirs: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:useTheirs', repoPath, file),
  markResolved: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:markResolved', repoPath, file),
  continueConflict: (
    repoPath: string,
    kind: 'merge' | 'rebase' | 'revert' | 'cherry-pick'
  ): Promise<MergeResult> =>
    ipcRenderer.invoke('git:continueConflict', repoPath, kind),
  readConflictFile: (repoPath: string, file: string): Promise<ConflictFileResult> =>
    ipcRenderer.invoke('git:readConflictFile', repoPath, file),
  resolveConflictFile: (
    repoPath: string,
    file: string,
    content: string
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:resolveConflictFile', repoPath, file, content),
  status: (repoPath: string): Promise<StatusResult> =>
    ipcRenderer.invoke('git:status', repoPath),
  diff: (repoPath: string, file: string, staged: boolean): Promise<DiffResult> =>
    ipcRenderer.invoke('git:diff', repoPath, file, staged),
  showCommit: (repoPath: string, hash: string): Promise<DiffResult> =>
    ipcRenderer.invoke('git:showCommit', repoPath, hash),
  stage: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stage', repoPath, file),
  stageAll: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stageAll', repoPath),
  unstageAll: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:unstageAll', repoPath),
  stageFiles: (repoPath: string, files: string[]): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stageFiles', repoPath, files),
  unstageFiles: (repoPath: string, files: string[]): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:unstageFiles', repoPath, files),
  unstage: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:unstage', repoPath, file),
  applyPatch: (
    repoPath: string,
    patch: string,
    reverse: boolean
  ): Promise<CheckoutResult> => ipcRenderer.invoke('git:applyPatch', repoPath, patch, reverse),
  fileHistory: (repoPath: string, file: string): Promise<FileHistoryResult> =>
    ipcRenderer.invoke('git:fileHistory', repoPath, file),
  blame: (repoPath: string, file: string): Promise<BlameResult> =>
    ipcRenderer.invoke('git:blame', repoPath, file),
  commit: (repoPath: string, message: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:commit', repoPath, message),
  clone: (url: string, parentDir: string): Promise<CloneResult> =>
    ipcRenderer.invoke('git:clone', url, parentDir),
  listGithubRepos: (): Promise<GithubReposResult> =>
    ipcRenderer.invoke('github:listRepos'),
  listPullRequests: (repoPath: string): Promise<PullRequestsResult> =>
    ipcRenderer.invoke('github:listPrs', repoPath),
  checkoutPullRequest: (repoPath: string, num: number): Promise<CheckoutResult> =>
    ipcRenderer.invoke('github:checkoutPr', repoPath, num),
  revealRepo: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke('repo:reveal', repoPath),
  repoExists: (repoPath: string): Promise<boolean> =>
    ipcRenderer.invoke('repo:exists', repoPath),
  openInEditor: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke('repo:openInEditor', repoPath),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),
  openRepoOnGitHub: (repoPath: string): Promise<string | null> =>
    ipcRenderer.invoke('repo:openOnGitHub', repoPath),
  listRepos: (): Promise<RepoEntry[]> => ipcRenderer.invoke('repos:list'),
  addRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:add', repoPath),
  removeRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:remove', repoPath),
  setRepoGroup: (repoPath: string, group: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:setGroup', repoPath, group),
  setReposLayout: (items: { path: string; group: string }[]): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:setLayout', items),
  renameRepoGroup: (oldName: string, newName: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:renameGroup', oldName, newName),
  stashList: (repoPath: string): Promise<StashListResult> =>
    ipcRenderer.invoke('git:stashList', repoPath),
  stashPush: (repoPath: string, message: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashPush', repoPath, message),
  stashFiles: (
    repoPath: string,
    files: string[],
    message: string
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashFiles', repoPath, files, message),
  stashPop: (repoPath: string, ref: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashPop', repoPath, ref),
  stashDrop: (repoPath: string, ref: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashDrop', repoPath, ref),
  fetch: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:fetch', repoPath),
  pull: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:push', repoPath),
  getCurrentRepo: (): Promise<string | null> =>
    ipcRenderer.invoke('repos:getCurrent'),
  setCurrentRepo: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke('repos:setCurrent', repoPath),
  listBranches: (repoPath: string): Promise<BranchesResult> =>
    ipcRenderer.invoke('git:branches', repoPath),
  aheadBehind: (repoPath: string): Promise<AheadBehind> =>
    ipcRenderer.invoke('git:aheadBehind', repoPath),
  createBranch: (
    repoPath: string,
    name: string,
    startPoint?: string
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:createBranch', repoPath, name, startPoint),
  deleteBranch: (
    repoPath: string,
    name: string,
    force: boolean
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:deleteBranch', repoPath, name, force),
  renameBranch: (
    repoPath: string,
    oldName: string,
    newName: string
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:renameBranch', repoPath, oldName, newName),
  discardFile: (
    repoPath: string,
    file: string,
    untracked: boolean
  ): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:discardFile', repoPath, file, untracked)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore - fallback when context isolation is disabled
  window.api = api
}
