# Loom

Personal GitKraken-like desktop git client (Electron). Public repo `AidinD/git-loom` (MIT).

See `DECISIONS.md` for the key decisions and their rationale - the *why*, plus
alternatives considered and rejected. Read it before architectural changes so a
fresh session inherits the reasoning instead of re-deriving it.

## Loom depends on keel

**keel** (github.com/AidinD/keel) is the suite's shared layer, linked as
`file:../keel` — so it must be checked out at `D:\Repo\Tools\keel`. It is a
devDependency, used by `npm run icon` and `npm run release`; nothing from it
ships in the app.

`npm install` does **not** fail when it is missing — npm 11 links a missing
`file:` dependency to a dangling symlink and exits 0. The failure arrives later
and quieter, as `ERR_MODULE_NOT_FOUND` from `npm run icon`.

Editing keel changes Loom immediately, with no rebuild step — that is the point of
it having no build. It also means a change there can break other siblings, so run
`npm test` in keel and `npm run icon` here before assuming it is fine. The icon
output is committed, and regenerating it is supposed to leave `build/` with an
empty diff.

Loom is the one app in the suite that releases from **CI**, where keel is not
checked out and cannot be (it is a private repo). That is fine, and worth knowing
why: `npm ci` exits 0 with a *dangling* symlink for a missing `file:` dependency —
measured, not assumed — and `npm run dist` never imports keel, because the icon
output is committed. So CI is green today and would break the moment anything in
`.github/workflows/` ran `npm run icon` — or `npm run release`, which now takes
its guards from `keel/release`. Both of those are local commands by design: the
release script only tags and pushes, and CI does the building. Regenerate icons
locally, commit the result, and leave CI alone.

## Releasing

**A release is a pushed tag.** CI (`.github/workflows/release.yml`) builds the
installer and publishes it:

```
npm run release
```

That tags `v<package.json version>` and pushes it; nothing else. Watch it with
`gh run watch --repo AidinD/git-loom`, and check the result with `gh release
view` rather than trusting the log.

**Never publish from here.** `electron-builder --publish always` on a laptop
creates the release *and* the tag, the tag push then starts CI, and CI dies on
"a release with the same tag name already exists". That has happened twice -
v1.1.16 and v1.2.3 - both times because this file did not say which of the two
paths was the real one. Local publishing is also what hits electron-builder's
duplicate-draft race, which is why the workflow exists at all.

`npm run dist` is the local build: same steps, no publish.

**Don't hand-edit the version.** `.githooks/pre-commit` (via
`core.hooksPath`) bumps the patch on every commit on purpose, so the version
doubles as a build counter. Setting it by hand gives you that number plus one.
HEAD therefore normally sits a patch ahead of the last published release.
