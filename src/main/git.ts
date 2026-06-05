import { spawn } from 'child_process'
import { join } from 'path'
import type {
  Commit,
  LogResult,
  CheckoutResult,
  MergeResult,
  StatusResult,
  DiffResult,
  FileChange,
  CloneResult,
  StashListResult
} from '../shared/types'

const FIELD = '\x1f'
const RECORD = '\x1e'

const FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s'].join(FIELD) + RECORD

interface GitOutput {
  code: number
  stdout: string
  stderr: string
}

/** Strips git's hint/advice noise and blank lines for clean human messages. */
function tidy(output: string): string {
  return output
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('hint:'))
    .join('\n')
    .trim()
}

/**
 * Spawns the system git binary in the given directory and resolves with its
 * exit code and captured output. We spawn the real binary rather than linking
 * a library, which keeps us correct and fast on real-world repos.
 */
function runGit(args: string[], cwd: string): Promise<GitOutput> {
  return new Promise((resolve, reject) => {
    // Suppress git's verbose detached-HEAD advice block up front; remaining
    // "hint:" noise is filtered out of human-facing messages by tidy().
    const child = spawn('git', ['-c', 'advice.detachedHead=false', ...args], {
      cwd
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      reject(err)
    })
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/**
 * Resolves the repository root for a directory, or null when the directory is
 * not inside a git work tree. Lets us accept any subdirectory of a repo and
 * normalize it to the top level.
 */
async function resolveRepoRoot(dir: string): Promise<string | null> {
  const result = await runGit(['rev-parse', '--show-toplevel'], dir)
  if (result.code !== 0) {
    return null
  }
  return result.stdout.trim()
}

/**
 * Loads the commit graph across all refs for the repository containing the
 * given directory. Returns a discriminated result so the renderer can show a
 * clean message instead of a raw thrown error.
 */
export async function getLog(dir: string, limit = 1000): Promise<LogResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(
    [
      'log',
      '--all',
      '--topo-order',
      `--max-count=${limit}`,
      `--pretty=format:${FORMAT}`
    ],
    root
  )

  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  const remotesResult = await runGit(['remote'], root)
  const remotes =
    remotesResult.code === 0
      ? remotesResult.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : []

  return { ok: true, root, commits: parseLog(result.stdout), remotes }
}

/**
 * Checks out a branch, tag, or commit. `target` is a branch name, a remote ref
 * like `origin/main`, or a commit hash (which results in a detached HEAD).
 */
export async function checkout(
  dir: string,
  target: string
): Promise<CheckoutResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(['checkout', target], root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: tidy(result.stderr) || `git exited with code ${result.code}`
    }
  }

  // git reports "Switched to branch ...", "Already on ...", and detached-HEAD
  // notices on stderr even on success — surface it so the action feels alive.
  const message = tidy(result.stderr) || tidy(result.stdout) || `Checked out ${target}`
  return { ok: true, message }
}

/**
 * Merges `source` into `target` the way GitKraken does on a branch drag: check
 * out the target branch first, then merge the source ref into it. Conflicts are
 * reported (not resolved) so the renderer can offer an escape hatch.
 */
export async function merge(
  dir: string,
  source: string,
  target: string
): Promise<MergeResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!root) {
    return { ok: false, conflict: false, error: `Not a Git repository: ${dir}` }
  }

  const checkoutResult = await runGit(['checkout', target], root)
  if (checkoutResult.code !== 0) {
    return {
      ok: false,
      conflict: false,
      error: checkoutResult.stderr.trim() || `Could not check out ${target}`
    }
  }

  const mergeResult = await runGit(['merge', source], root)
  if (mergeResult.code !== 0) {
    const output = `${mergeResult.stdout}\n${mergeResult.stderr}`
    const conflict = /CONFLICT|Automatic merge failed/i.test(output)
    return {
      ok: false,
      conflict,
      error: tidy(mergeResult.stdout) || tidy(mergeResult.stderr) || 'Merge failed'
    }
  }

  const message =
    tidy(mergeResult.stdout) ||
    tidy(mergeResult.stderr) ||
    `Merged ${source} into ${target}`
  return { ok: true, message }
}

/**
 * Aborts an in-progress merge, restoring the working tree to its pre-merge
 * state. The escape hatch when a drag-to-merge hits conflicts.
 */
export async function mergeAbort(dir: string): Promise<CheckoutResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(['merge', '--abort'], root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  return { ok: true, message: 'Merge aborted' }
}

/**
 * Rebases `source` onto `target` (GitKraken-style drag): checks out the source
 * branch, then replays it on top of target. Conflicts are reported, not resolved.
 */
export async function rebase(
  dir: string,
  source: string,
  target: string
): Promise<MergeResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return {
      ok: false,
      conflict: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!root) {
    return { ok: false, conflict: false, error: `Not a Git repository: ${dir}` }
  }

  const checkoutResult = await runGit(['checkout', source], root)
  if (checkoutResult.code !== 0) {
    return {
      ok: false,
      conflict: false,
      error: tidy(checkoutResult.stderr) || `Could not check out ${source}`
    }
  }

  const rebaseResult = await runGit(['rebase', target], root)
  if (rebaseResult.code !== 0) {
    const output = `${rebaseResult.stdout}\n${rebaseResult.stderr}`
    const conflict = /CONFLICT|could not apply|Resolve all conflicts/i.test(output)
    return {
      ok: false,
      conflict,
      error: tidy(rebaseResult.stdout) || tidy(rebaseResult.stderr) || 'Rebase failed'
    }
  }

  const message =
    tidy(rebaseResult.stdout) ||
    tidy(rebaseResult.stderr) ||
    `Rebased ${source} onto ${target}`
  return { ok: true, message }
}

/** Aborts an in-progress rebase. */
export async function rebaseAbort(dir: string): Promise<CheckoutResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(['rebase', '--abort'], root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  return { ok: true, message: 'Rebase aborted' }
}

/** Returns the working-tree changes (staged + unstaged + untracked). */
export async function status(dir: string): Promise<StatusResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(['status', '--porcelain=v1', '-z'], root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  return { ok: true, files: parseStatus(result.stdout) }
}

function parseStatus(raw: string): FileChange[] {
  const tokens = raw.split('\0').filter((token) => token.length > 0)
  const files: FileChange[] = []

  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]
    const index = entry[0]
    const worktree = entry[1]
    const path = entry.slice(3)

    // Renames/copies emit the original path as the next NUL-separated token.
    if (index === 'R' || index === 'C') {
      i++
    }

    files.push({ path, index, worktree })
  }

  return files
}

/** Returns a unified diff for a single file, staged or unstaged. */
export async function diff(
  dir: string,
  file: string,
  staged: boolean
): Promise<DiffResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const args = staged
    ? ['diff', '--cached', '--', file]
    : ['diff', '--', file]
  const result = await runGit(args, root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  return { ok: true, text: result.stdout }
}

/** Returns the `origin` remote URL, or null if there is none. */
export async function remoteUrl(dir: string): Promise<string | null> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch {
    return null
  }
  if (!root) {
    return null
  }
  const result = await runGit(['remote', 'get-url', 'origin'], root)
  if (result.code !== 0) {
    return null
  }
  return result.stdout.trim() || null
}

/** Returns the full patch for a single commit (`git show`). */
export async function showCommit(dir: string, hash: string): Promise<DiffResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(['show', '--stat', '--patch', hash], root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  return { ok: true, text: result.stdout }
}

/** Stages a single file (`git add`). */
export async function stage(dir: string, file: string): Promise<CheckoutResult> {
  return runSimple(dir, ['add', '--', file], `Staged ${file}`)
}

/** Unstages a single file (`git restore --staged`). */
export async function unstage(dir: string, file: string): Promise<CheckoutResult> {
  return runSimple(dir, ['restore', '--staged', '--', file], `Unstaged ${file}`)
}

/** Stages every change (`git add -A`). */
export async function stageAll(dir: string): Promise<CheckoutResult> {
  return runSimple(dir, ['add', '-A'], 'Staged all changes')
}

/** Stages a specific set of files. */
export async function stageFiles(
  dir: string,
  files: string[]
): Promise<CheckoutResult> {
  return runSimple(dir, ['add', '--', ...files], `Staged ${files.length} files`)
}

/** Unstages a specific set of files. */
export async function unstageFiles(
  dir: string,
  files: string[]
): Promise<CheckoutResult> {
  return runSimple(
    dir,
    ['restore', '--staged', '--', ...files],
    `Unstaged ${files.length} files`
  )
}

/** Unstages everything (`git restore --staged .`). */
export async function unstageAll(dir: string): Promise<CheckoutResult> {
  return runSimple(dir, ['restore', '--staged', '.'], 'Unstaged all changes')
}

/** Commits the staged changes with the given message. */
export async function commit(dir: string, message: string): Promise<CheckoutResult> {
  return runSimple(dir, ['commit', '-m', message], 'Committed')
}

/** Clones `url` into `parentDir`, returning the path of the new repo. */
export async function clone(url: string, parentDir: string): Promise<CloneResult> {
  const result = await runGit(['clone', url], parentDir)
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || result.stdout.trim() || 'git clone failed'
    }
  }

  const name =
    url
      .replace(/\.git$/, '')
      .replace(/[/\\]$/, '')
      .split(/[/\\]/)
      .pop() || 'repo'
  return { ok: true, path: join(parentDir, name) }
}

/** Fetches all remotes and prunes deleted remote branches. */
export async function fetch(dir: string): Promise<CheckoutResult> {
  return runSimple(dir, ['fetch', '--all', '--prune'], 'Fetched')
}

/** Pulls the current branch (fast-forward only, to avoid surprise merges). */
export async function pull(dir: string): Promise<CheckoutResult> {
  return runSimple(dir, ['pull', '--ff-only'], 'Pulled')
}

/** Pushes the current branch to its upstream. */
export async function push(dir: string): Promise<CheckoutResult> {
  return runSimple(dir, ['push'], 'Pushed')
}

/** Creates a new branch (optionally from a start point) and checks it out. */
export async function createBranch(
  dir: string,
  name: string,
  startPoint?: string
): Promise<CheckoutResult> {
  const args = ['checkout', '-b', name]
  if (startPoint) {
    args.push(startPoint)
  }
  return runSimple(dir, args, `Created ${name}`)
}

/** Deletes a local branch (safe: refuses if not fully merged). */
export async function deleteBranch(
  dir: string,
  name: string,
  force = false
): Promise<CheckoutResult> {
  return runSimple(dir, ['branch', force ? '-D' : '-d', name], `Deleted ${name}`)
}

/** Renames a local branch. */
export async function renameBranch(
  dir: string,
  oldName: string,
  newName: string
): Promise<CheckoutResult> {
  return runSimple(dir, ['branch', '-m', oldName, newName], `Renamed to ${newName}`)
}

/** Discards changes to a file: untracked files are removed, tracked files reset to HEAD. */
export async function discardFile(
  dir: string,
  file: string,
  untracked: boolean
): Promise<CheckoutResult> {
  if (untracked) {
    return runSimple(dir, ['clean', '-f', '--', file], `Discarded ${file}`)
  }
  return runSimple(
    dir,
    ['restore', '--staged', '--worktree', '--source=HEAD', '--', file],
    `Discarded changes in ${file}`
  )
}

const STASH_FIELD = '\x1f'

/** Lists the stash stack, newest first. */
export async function stashList(dir: string): Promise<StashListResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(
    ['stash', 'list', `--format=%gd${STASH_FIELD}%gs`, '-z'],
    root
  )
  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || `git exited with code ${result.code}`
    }
  }

  const stashes = result.stdout
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [ref, message] = entry.split(STASH_FIELD)
      return { ref, message: message ?? '' }
    })

  return { ok: true, stashes }
}

/** Stashes the current changes (including untracked) with an optional message. */
export async function stashPush(
  dir: string,
  message: string
): Promise<CheckoutResult> {
  const args = ['stash', 'push', '--include-untracked']
  if (message.trim().length > 0) {
    args.push('-m', message.trim())
  }
  return runSimple(dir, args, 'Stashed changes')
}

/** Applies a stash and removes it from the stack (`git stash pop`). */
export async function stashPop(dir: string, ref: string): Promise<CheckoutResult> {
  return runSimple(dir, ['stash', 'pop', ref], `Popped ${ref}`)
}

/** Deletes a stash without applying it (`git stash drop`). */
export async function stashDrop(dir: string, ref: string): Promise<CheckoutResult> {
  return runSimple(dir, ['stash', 'drop', ref], `Dropped ${ref}`)
}

/** Shared helper for mutating git commands that just need ok/error + a message. */
async function runSimple(
  dir: string,
  args: string[],
  successMessage: string
): Promise<CheckoutResult> {
  let root: string | null
  try {
    root = await resolveRepoRoot(dir)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!root) {
    return { ok: false, error: `Not a Git repository: ${dir}` }
  }

  const result = await runGit(args, root)
  if (result.code !== 0) {
    return {
      ok: false,
      error: tidy(result.stderr) || tidy(result.stdout) || `git exited with code ${result.code}`
    }
  }

  return { ok: true, message: tidy(result.stdout) || tidy(result.stderr) || successMessage }
}

function parseLog(raw: string): Commit[] {
  const records = raw
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.length > 0)

  return records.map((record) => {
    const [hash, parents, authorName, authorEmail, timestamp, refs, subject] =
      record.split(FIELD)

    return {
      hash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      authorName,
      authorEmail,
      timestamp: Number(timestamp) * 1000,
      refs: refs
        ? refs
            .split(', ')
            .map((ref) => ref.trim())
            .filter(Boolean)
        : [],
      subject
    }
  })
}
