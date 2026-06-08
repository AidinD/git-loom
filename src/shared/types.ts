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
  | { ok: true; root: string; commits: Commit[]; remotes: string[]; hasMore: boolean }
  | { ok: false; error: string }

export type CheckoutResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

export type UpstreamResult =
  | { ok: true; upstream: { remote: string; branch: string } | null }
  | { ok: false; error: string }

/** A local branch with its tracking state, used for branch cleanup. */
export interface LocalBranchInfo {
  name: string
  current: boolean
  /** The configured upstream (e.g. "origin/feature"), or null if none. */
  upstream: string | null
  /** True when an upstream is configured but its remote branch is gone. */
  gone: boolean
}

export type LocalBranchesResult =
  | { ok: true; branches: LocalBranchInfo[] }
  | { ok: false; error: string }

/** Per-branch result of a bulk delete. */
export interface BranchDeleteOutcome {
  name: string
  ok: boolean
  error?: string
}

export type DeleteBranchesResult =
  | { ok: true; outcomes: BranchDeleteOutcome[] }
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

/** A file with merge conflicts that the user must resolve. */
export interface ConflictFile {
  file: string
}

export type ConflictsResult =
  | { ok: true; files: ConflictFile[] }
  | { ok: false; error: string }

export type ConflictFileResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

export type FileHistoryResult =
  | { ok: true; commits: Commit[] }
  | { ok: false; error: string }

export interface BlameLine {
  hash: string
  author: string
  /** The source line's text. */
  text: string
}

export type BlameResult =
  | { ok: true; lines: BlameLine[] }
  | { ok: false; error: string }

export type ImageDiffResult =
  | { ok: true; before: string | null; after: string | null }
  | { ok: false; error: string }

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
