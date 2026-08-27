import { watch, readFileSync, statSync, type FSWatcher } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { RepoChange, RepoChangeKind } from '../shared/types'

/**
 * Watches the current repo so the renderer never shows a stale working tree.
 * Without this, nothing outside Loom's own commands refreshed the view: editing
 * a file in another editor only showed up once something happened to call
 * `loadLog` (fetch, checkout, pull...).
 *
 * One recursive `fs.watch` per repo - a single kernel subscription on Windows
 * (ReadDirectoryChangesW) and macOS (FSEvents), so the cost doesn't grow with
 * the size of the tree. Events are classified and coalesced here rather than in
 * the renderer, so a save storm turns into one refresh instead of hundreds.
 */

/** Trailing debounce: a burst of writes becomes a single refresh. */
const DEBOUNCE_MS = 250
/**
 * ...but never starve. Continuous churn (an `npm install`, a big checkout) would
 * otherwise keep pushing the trailing timer out forever, so force a refresh at
 * least this often while events keep arriving.
 */
const MAX_WAIT_MS = 2000

/** `.git` entries worth a full log/branch refresh when they change. */
const REF_ENTRIES = new Set([
  'HEAD',
  'ORIG_HEAD',
  'packed-refs',
  'refs',
  'MERGE_HEAD',
  'MERGE_MSG',
  'REBASE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'BISECT_LOG',
  'rebase-merge',
  'rebase-apply',
  'sequencer'
])

let watchers: FSWatcher[] = []
let watchedRepo: string | null = null
let send: ((change: RepoChange) => void) | null = null

let timer: NodeJS.Timeout | null = null
let pendingKind: RepoChangeKind | null = null
let firstEventAt = 0

/**
 * Decides what a changed path means, or `null` for noise we don't care about
 * (git's object database, reflogs, lock files, dependency directories).
 * `relative` is the path fs.watch reported, relative to the watched root.
 */
function classify(relative: string, insideGitDir: boolean): RepoChangeKind | null {
  const segments = relative.split(/[\\/]/).filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return null
  }
  const last = segments[segments.length - 1]
  // index.lock and friends appear and vanish around every git command,
  // including Loom's own - refreshing on them is pure churn.
  if (last.endsWith('.lock')) {
    return null
  }
  if (segments.includes('node_modules')) {
    return null
  }
  const gitRelative = insideGitDir
    ? segments
    : segments[0] === '.git'
      ? segments.slice(1)
      : null
  if (gitRelative === null) {
    return 'status'
  }
  if (gitRelative.length === 0) {
    return null
  }
  const entry = gitRelative[0]
  if (REF_ENTRIES.has(entry)) {
    return 'refs'
  }
  // The index moving means files were staged or unstaged behind our back.
  if (entry === 'index') {
    return 'status'
  }
  return null
}

function flush(): void {
  timer = null
  firstEventAt = 0
  const kind = pendingKind
  pendingKind = null
  const repoPath = watchedRepo
  if (kind === null || repoPath === null || send === null) {
    return
  }
  send({ repoPath, kind })
}

function schedule(kind: RepoChangeKind): void {
  // 'refs' implies a status refresh too, so it wins when both are pending.
  pendingKind = pendingKind === 'refs' ? 'refs' : kind
  if (firstEventAt === 0) {
    firstEventAt = Date.now()
  }
  if (timer !== null) {
    clearTimeout(timer)
  }
  const waited = Date.now() - firstEventAt
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited))
  timer = setTimeout(flush, delay)
}

/**
 * Resolves the real git directory when `.git` is a file - the linked-worktree
 * and submodule layout, where refs live outside the tree we're watching.
 * Returns null when `.git` is an ordinary directory (already covered).
 */
function linkedGitDir(repoPath: string): string | null {
  const dotGit = join(repoPath, '.git')
  try {
    if (statSync(dotGit).isDirectory()) {
      return null
    }
    const match = readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)
    if (!match) {
      return null
    }
    const target = match[1].trim()
    return isAbsolute(target) ? target : resolve(repoPath, target)
  } catch {
    return null
  }
}

function open(root: string, insideGitDir: boolean): void {
  try {
    // persistent: false - a watcher should never be the reason the process
    // stays alive at quit.
    const watcher = watch(
      root,
      { recursive: true, persistent: false },
      (_event, filename) => {
        // A null filename means the platform couldn't say what moved; assume
        // the expensive case rather than miss a checkout.
        const kind =
          typeof filename === 'string' ? classify(filename, insideGitDir) : 'refs'
        if (kind !== null) {
          schedule(kind)
        }
      }
    )
    watcher.on('error', () => {
      // Watching is best-effort: an unwatchable path (a network share, a
      // deleted repo) must not take the app down. The renderer also refreshes
      // on window focus, which covers us here.
    })
    watchers.push(watcher)
  } catch {
    // same as above - best-effort
  }
}

/**
 * Points the watcher at `repoPath`, replacing whatever it watched before.
 * Idempotent: called on every repo refresh, so re-watching the same path is a
 * no-op rather than a teardown/rebuild.
 */
export function watchRepo(repoPath: string, emit: (change: RepoChange) => void): void {
  send = emit
  if (watchedRepo === repoPath && watchers.length > 0) {
    return
  }
  unwatchRepo()
  watchedRepo = repoPath
  open(repoPath, false)
  const linked = linkedGitDir(repoPath)
  if (linked !== null) {
    open(linked, true)
  }
}

/** Stops watching and drops any pending refresh. */
export function unwatchRepo(): void {
  for (const watcher of watchers) {
    try {
      watcher.close()
    } catch {
      // already closed
    }
  }
  watchers = []
  watchedRepo = null
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pendingKind = null
  firstEventAt = 0
}
