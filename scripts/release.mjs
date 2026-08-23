import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/*
 * Release Loom by pushing a version tag, which is what `.github/workflows/
 * release.yml` waits for. CI then builds the installer and publishes one release
 * with `gh release create`.
 *
 * This script exists because `npm run release` used to run
 * `electron-builder --publish always` locally, which fights the workflow rather
 * than using it: electron-builder creates the release *and* the tag, the tag push
 * starts CI, and CI then dies on "a release with the same tag name already
 * exists". That happened twice - v1.1.16 on 2026-08-09 and v1.2.3 on
 * 2026-08-23 - because nothing here said which of the two paths was the real one.
 *
 * Publishing from a laptop is also the path that hit electron-builder's
 * duplicate-draft race, which is the reason the workflow was written in the first
 * place (see its header comment).
 *
 * The version is whatever is in package.json. Don't hand-edit it: .githooks/
 * pre-commit bumps the patch on every commit, so the number is already the next
 * one by the time you get here.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()
}

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const tag = `v${version}`

// A dirty tree means the tag would point at something that is not what you
// built and tested. CI checks out the tag, so whatever is uncommitted is simply
// absent from the release.
const dirty = git('status', '--porcelain', '--untracked-files=no')
if (dirty.length > 0) {
  console.error(`Uncommitted changes - commit them first, or the release will not contain them:\n${dirty}`)
  process.exit(1)
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') {
  console.error(`On ${branch}, not main. Releasing from a side branch is almost never what you want.`)
  process.exit(1)
}

const existing = git('tag', '--list', tag)
if (existing.length > 0) {
  console.error(
    `${tag} already exists locally. The version bumps on every commit, so commit once more to move past it.`
  )
  process.exit(1)
}

const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
if (remoteTag.length > 0) {
  console.error(`${tag} is already on origin - that version is released. Commit once more to bump past it.`)
  process.exit(1)
}

// Unpushed commits would make the tag reachable only locally, and CI would build
// from an older tree than the tag claims.
const unpushed = git('log', '--oneline', 'origin/main..HEAD')
if (unpushed.length > 0) {
  console.error(`Unpushed commits - push main first:\n${unpushed}`)
  process.exit(1)
}

console.log(`Tagging ${tag} and pushing it. CI builds and publishes from there.`)
git('tag', tag)
git('push', 'origin', tag)
console.log(`Pushed ${tag}. Watch it with:  gh run watch --repo AidinD/git-loom`)
