import { spawn } from 'child_process'
import type { GithubReposResult, GithubRepo } from '../shared/types'

interface GhOutput {
  code: number
  stdout: string
  stderr: string
}

/** Runs the GitHub CLI. We lean on the user's existing `gh auth` rather than
 * storing our own token. */
function runGh(args: string[]): Promise<GhOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args)
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
