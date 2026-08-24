# Loom

[![Release](https://img.shields.io/github/v/release/AidinD/git-loom)](https://github.com/AidinD/git-loom/releases)
[![License](https://img.shields.io/github/license/AidinD/git-loom)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](#install)

A visual, direct-manipulation Git client — drag a branch onto another to merge or
rebase, drag commits to reorder them, stage by the hunk or line, and resolve conflicts
in-app. Built because GitKraken felt intuitive but the alternatives didn't.

> Personal project, 100% AI-coded. Windows desktop app (Electron).

## Install

Download the latest **`Loom-x.y.z-setup.exe`** from
[Releases](https://github.com/AidinD/git-loom/releases) and run it. The app
**auto-updates** itself from future releases.

The installer is unsigned, so Windows SmartScreen shows an "unknown publisher"
warning — click **More info → Run anyway**.

## Features

**Visual commit graph**
- Direct-manipulation commit graph with GitKraken-style lanes, rendered on a
  virtualized canvas (stays crisp at any history size)
- Incremental history loading (loads more as you scroll)
- Branch & tag chips in a dedicated column; author avatars; per-commit changed-files
  list with A/M/D/R status
- Commit search — highlight and jump between matches by message, author, or hash

**Direct manipulation**
- Drag a branch onto another to **merge** or **rebase** (labelled choice)
- Drag commits to **reorder** them (interactive rebase by drag)
- Double-click a branch, tag, or commit to check it out

**Staging & committing**
- Stage/unstage files (click, double-click, multi-select, or marquee drag-select)
- **Hunk- and line-level staging** straight in the diff
- Commit with summary + description + co-authors
- **SSH commit signing** toggle

**Diff viewer**
- Side-by-side (split) or unified diff with **word-level intra-line highlighting**
- **Image before/after** preview for binary image files
- Per-file +/- line counts and status

**History rewriting**
- **Interactive rebase** (reorder / squash / fixup / drop / reword) — visual editor and
  drag-to-reorder
- Cherry-pick, revert, reset (soft/mixed/hard), undo last commit
- **Undo/redo** for branch-moving operations

**Conflict resolution**
- In-app **per-block conflict resolver**: Current vs Incoming (+ base in diff3), accept
  ours/theirs/both, plus an editable merged result
- Handles merge, rebase, revert, and cherry-pick — with autostash, skip-empty-commit,
  continue/abort, a toolbar badge, and jump-to-next-conflict

**Branches, remotes & repos**
- Create / rename / delete (and force-delete) branches; delete a branch on the remote,
  or delete it everywhere (local + upstream) in one step; branch picker with last-commit
  time and one-click merge
- **Clean up local branches** that have no remote counterpart (never pushed, or upstream
  gone after a merged PR) — a checkbox preview with safe and force delete
- Fetch / pull / push with ahead/behind badges and quiet auto-fetch
- Multi-repo switcher + dockable **Repositories** panel with drag-and-drop grouping
  (reorder, collapse, rename groups)
- Clone browser (lists your accessible GitHub repos via `gh`); graceful missing-repo
  handling

**Stashes**
- Multiple named stashes; stash individual files; drag a stash back onto the working
  tree to apply

**Workspace & UX**
- Dockable, resizable panels (dockview) with save/load **named layouts**
- **Command history** panel + floating toast notifications
- Dark theme with amber accent; Enter-to-confirm / Esc-to-close everywhere
- Open repo in editor / file explorer / on GitHub

## Stack

- **Electron** (app shell) + **Vite** (`electron-vite`) for fast HMR
- **React + TypeScript** in the renderer
- Real `git` binary spawned from the main process (no library linking — correct on
  real-world repos)
- Commit graph rendered on `<canvas>` (kept as a shell-independent component)
- Packaged with **electron-builder**, auto-update via **electron-updater**

## Development

Loom depends on [**keel**](https://github.com/AidinD/keel), the shared layer under
the suite, linked from the filesystem — so it has to be checked out **next to**
this repo before `npm install` will work:

```
Tools/
├── loom/
└── keel/
```

```bash
git clone https://github.com/AidinD/keel ../keel
```

Without the sibling checkout `npm install` still **exits 0** — npm links
`file:../keel` to a dangling symlink and says nothing. What fails is the first
import: `npm run icon` and `npm run release` die with `ERR_MODULE_NOT_FOUND`. keel
is a devDependency, used only by those two — nothing from it ships inside the app.

```bash
npm install      # install dependencies
npm run dev      # launch with hot reload
npm run build    # production build
npm run typecheck
npm run dist     # build the installer locally (no publish)
npm run icon     # regenerate build/icon.png and icon.ico
```

## Releasing

Tag a version and push it — GitHub Actions builds the Windows installer and publishes
it to GitHub Releases:

```bash
git tag v1.2.3
git push origin v1.2.3
```
