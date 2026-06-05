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

export interface LoomApi {
  openRepo: () => Promise<string | null>
  getLog: (repoPath: string) => Promise<LogResult>
  checkout: (repoPath: string, target: string) => Promise<CheckoutResult>
  merge: (repoPath: string, source: string, target: string) => Promise<MergeResult>
  mergeAbort: (repoPath: string) => Promise<CheckoutResult>
  rebase: (repoPath: string, source: string, target: string) => Promise<MergeResult>
  rebaseAbort: (repoPath: string) => Promise<CheckoutResult>
  status: (repoPath: string) => Promise<StatusResult>
  diff: (repoPath: string, file: string, staged: boolean) => Promise<DiffResult>
  showCommit: (repoPath: string, hash: string) => Promise<DiffResult>
  stage: (repoPath: string, file: string) => Promise<CheckoutResult>
  stageAll: (repoPath: string) => Promise<CheckoutResult>
  unstageAll: (repoPath: string) => Promise<CheckoutResult>
  stageFiles: (repoPath: string, files: string[]) => Promise<CheckoutResult>
  unstageFiles: (repoPath: string, files: string[]) => Promise<CheckoutResult>
  unstage: (repoPath: string, file: string) => Promise<CheckoutResult>
  commit: (repoPath: string, message: string) => Promise<CheckoutResult>
  clone: (url: string, parentDir: string) => Promise<CloneResult>
  listGithubRepos: () => Promise<GithubReposResult>
  listPullRequests: (repoPath: string) => Promise<PullRequestsResult>
  checkoutPullRequest: (repoPath: string, num: number) => Promise<CheckoutResult>
  revealRepo: (repoPath: string) => Promise<void>
  openRepoOnGitHub: (repoPath: string) => Promise<void>
  listRepos: () => Promise<RepoEntry[]>
  addRepo: (repoPath: string) => Promise<RepoEntry[]>
  removeRepo: (repoPath: string) => Promise<RepoEntry[]>
  setRepoGroup: (repoPath: string, group: string) => Promise<RepoEntry[]>
  stashList: (repoPath: string) => Promise<StashListResult>
  stashPush: (repoPath: string, message: string) => Promise<CheckoutResult>
  stashPop: (repoPath: string, ref: string) => Promise<CheckoutResult>
  stashDrop: (repoPath: string, ref: string) => Promise<CheckoutResult>
  fetch: (repoPath: string) => Promise<CheckoutResult>
  pull: (repoPath: string) => Promise<CheckoutResult>
  push: (repoPath: string) => Promise<CheckoutResult>
  getCurrentRepo: () => Promise<string | null>
  setCurrentRepo: (repoPath: string) => Promise<void>
  listBranches: (repoPath: string) => Promise<BranchesResult>
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
}

declare global {
  interface Window {
    api: LoomApi
  }
}
