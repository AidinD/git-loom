# Loom

Personal GitKraken-like desktop git client (Electron). Public repo `AidinD/git-loom` (MIT).

See `DECISIONS.md` for the key decisions and their rationale - the *why*, plus
alternatives considered and rejected. Read it before architectural changes so a
fresh session inherits the reasoning instead of re-deriving it.

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
