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
  BranchesResult
} from '../shared/types'

const api = {
  openRepo: (): Promise<string | null> => ipcRenderer.invoke('repo:open'),
  getLog: (repoPath: string): Promise<LogResult> =>
    ipcRenderer.invoke('git:log', repoPath),
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
  openRepoOnGitHub: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke('repo:openOnGitHub', repoPath),
  listRepos: (): Promise<RepoEntry[]> => ipcRenderer.invoke('repos:list'),
  addRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:add', repoPath),
  removeRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:remove', repoPath),
  setRepoGroup: (repoPath: string, group: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:setGroup', repoPath, group),
  stashList: (repoPath: string): Promise<StashListResult> =>
    ipcRenderer.invoke('git:stashList', repoPath),
  stashPush: (repoPath: string, message: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashPush', repoPath, message),
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
