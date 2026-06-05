import { spawn } from 'child_process'
import type {
  GithubReposResult,
  GithubRepo,
  PullRequestsResult,
  PullRequest,
  CheckoutResult
} from '../shared/types'

interface GhOutput {
  code: number
  stdout: string
  stderr: string
}

/** Runs the GitHub CLI. We lean on the user's existing `gh auth` rather than
 * storing our own token. */
function runGh(args: string[], cwd?: string): Promise<GhOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, cwd ? { cwd } : {})
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
 * Lists the repositories the authenticated gh user can access (owner +
 * collaborator + organisation member), most-recently-updated first. Paginates
 * across all pages; `--jq '.[] | …'` emits one compact JSON object per line so
 * the concatenated pages stay parseable (unlike concatenated JSON arrays).
 */
export async function listGithubRepos(): Promise<GithubReposResult> {
  let result: GhOutput
  try {
    result = await runGh([
      'api',
      '--paginate',
      '-X',
      'GET',
      'user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      '--jq',
      '.[] | {fullName: .full_name, name: .name, owner: .owner.login, description: .description, cloneUrl: .clone_url, private: .private}'
    ])
  } catch {
    return {
      ok: false,
      error: 'GitHub CLI (gh) not found. Install it and run `gh auth login`.'
    }
  }

  if (result.code !== 0) {
    return {
      ok: false,
      error:
        result.stderr.trim() ||
        'gh failed. Make sure you are logged in with `gh auth login`.'
    }
  }

  try {
    const repos = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as GithubRepo)
    return { ok: true, repos }
  } catch {
    return { ok: false, error: 'Could not parse the repository list from gh.' }
  }
}

/** Lists open pull requests for the repo at `dir` (uses gh's repo detection). */
export async function listPullRequests(dir: string): Promise<PullRequestsResult> {
  let result: GhOutput
  try {
    result = await runGh(
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '50',
        '--json',
        'number,title,headRefName,author,url',
        '--jq',
        '[.[] | {number, title, branch: .headRefName, author: .author.login, url}]'
      ],
      dir
    )
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found.' }
  }

  if (result.code !== 0) {
    return { ok: false, error: result.stderr.trim() || 'gh pr list failed.' }
  }

  try {
    const prs = JSON.parse(result.stdout || '[]') as PullRequest[]
    return { ok: true, prs }
  } catch {
    return { ok: false, error: 'Could not parse the pull request list.' }
  }
}

/** Checks out the branch for a pull request (`gh pr checkout`). */
export async function checkoutPullRequest(
  dir: string,
  number: number
): Promise<CheckoutResult> {
  let result: GhOutput
  try {
    result = await runGh(['pr', 'checkout', String(number)], dir)
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found.' }
  }
  if (result.code !== 0) {
    return { ok: false, error: result.stderr.trim() || 'gh pr checkout failed.' }
  }
  return { ok: true, message: result.stderr.trim() || `Checked out PR #${number}` }
}
