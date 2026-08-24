import { execFileSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { appMeta, nodeExec, preflight } from 'keel/release'

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
 * The guards come from `keel/release`, shared with the siblings. Loom's set is a
 * different one from theirs: because CI builds from the pushed tag rather than
 * from this working copy, what matters is that the tag is free and that the tree
 * CI will check out is the tree that was tested here.
 *
 * The version is whatever is in package.json. Don't hand-edit it: .githooks/
 * pre-commit bumps the patch on every commit, so the number is already the next
 * one by the time you get here.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const exec = nodeExec(root)
const { tag } = appMeta(root)

const failures = preflight(exec, {
  tag,
  checks: ['cleanTree', 'onBranch', 'nothingUnpushed', 'tagFree']
})
if (failures.length > 0) {
  console.error(failures.map((failure) => failure.message).join('\n\n'))
  process.exit(1)
}

console.log(`Tagging ${tag} and pushing it. CI builds and publishes from there.`)
execFileSync('git', ['tag', tag], { cwd: root, stdio: 'inherit' })
execFileSync('git', ['push', 'origin', tag], { cwd: root, stdio: 'inherit' })
console.log(`Pushed ${tag}. Watch it with:  gh run watch --repo AidinD/git-loom`)
