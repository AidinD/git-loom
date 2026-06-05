export interface Commit {
  hash: string
  parents: string[]
  authorName: string
  authorEmail: string
  timestamp: number
  refs: string[]
  subject: string
}

export type LogResult =
  | { ok: true; root: string; commits: Commit[]; remotes: string[] }
  | { ok: false; error: string }

export type CheckoutResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

export interface BranchInfo {
  name: string
  /** Relative time of the branch tip's last commit, e.g. "3 days ago". */
  lastCommit: string
}

export type BranchesResult =
  | { ok: true; branches: string[]; current: string; info: BranchInfo[] }
  | { ok: false; error: string }

export interface AheadBehind {
  ahead: number
  behind: number
}

export type MergeResult =
  | { ok: true; message: string }
  | { ok: false; error: string; conflict: boolean }

export interface FileChange {
  path: string
  /** Index (staged) status char from `git status --porcelain`, e.g. M, A, D. */
  index: string
  /** Worktree (unstaged) status char; "?" for untracked. */
  worktree: string
}

export type StatusResult =
  | { ok: true; files: FileChange[] }
  | { ok: false; error: string }

export type DiffResult = { ok: true; text: string } | { ok: false; error: string }

export interface RepoEntry {
  path: string
  name: string
  /** User-defined group, or "" for ungrouped. */
  group: string
}

export type CloneResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

export interface StashEntry {
  ref: string
  message: string
}

export type StashListResult =
  | { ok: true; stashes: StashEntry[] }
  | { ok: false; error: string }

export interface GithubRepo {
  fullName: string
  name: string
  owner: string
  description: string | null
  cloneUrl: string
  private: boolean
}

export type GithubReposResult =
  | { ok: true; repos: GithubRepo[] }
  | { ok: false; error: string }

export interface PullRequest {
  number: number
  title: string
  branch: string
  author: string
  url: string
}

export type PullRequestsResult =
  | { ok: true; prs: PullRequest[] }
  | { ok: false; error: string }
