# Loom — Backlog

Deferred work, captured so we don't forget. Ordered roughly, not strictly.

## Repo management (deferred from phase 2 by choice — risk-first)

A GitHub-Desktop-style repository switcher, but better:

- **Recent repos** list + quick switching (the "Current repository" dropdown).
- **Add** dropdown: clone from URL, add existing local folder, create new.
- **Filter** box to search repos by name.
- **Custom groupings** — user-defined groups, NOT just auto-grouping by owner.
  This is a gap in GitHub Desktop and a real differentiator for Loom.
- Per-repo sync/fetch indicators (ahead/behind, fetch arrow), like GitHub Desktop.
- Persist the repo list + groups locally (e.g. app userData JSON). [done — basic]
- **Halyard-style grouping with drag-and-drop**: upgrade the current group-by-text
  switcher to the same session-grouping UX used in Halyard (`nw-studio-app`) —
  drag repos between groups, reorder, collapsible groups. Mirror/reuse that component
  (shared Electron stack payoff).
- [done] **Clone browser**: the Clone dialog lists repos the user can access
  (owner + collaborator + org) via the `gh` CLI — searchable, click to clone. Uses
  the user's existing `gh auth` (no token stored in Loom). [done] paginates across
  all pages (JSONL). Follow-up: show the left-rail persistent version.

## Graph rendering

- **Virtualize the canvas** (windowing + devicePixelRatio scaling). Phase-2 graph
  renders a single non-virtualized canvas; to avoid the browser canvas height limit
  it drops to DPR=1 on very tall graphs (>~16k physical px) and is capped at
  `--max-count=1000` commits. Windowing removes both limits and restores crispness.

## Changes panel polish (phase 6 follow-ups, requested)

- [done] **Stage all / unstage all** buttons per section.
- [done] **Multi-select** files with Ctrl/Shift, then bulk stage/unstage/discard
  via the right-click menu.
- [done] **Drag-and-drop** files between Staged / Changes / Stashes sections
  (stage / unstage / stash). Multi-selection drags together.
- [done] **Name stashes** (dialog on stash) and **stash individual files**.
- [done] **Drag a stash out** onto Changes/Staged to apply (pop) it.
- [skipped] **Rename a stash** — git has no native stash-rename (message lives in the
  stash commit). The only route (drop + `git stash store`) reorders the stack to the
  top; not worth the side effect. Decided to skip 2026-06-05.
- [done] Commit via keyboard (Enter in Summary, Ctrl/Cmd+Enter in Description).
- [done] **Right-click context menu** on files (Show diff / Stage|Unstage / Discard).
- [done] Discard changes / restore file (⟲ button + confirm).
- [done] Branch ops: create (toolbar), rename/delete (right-click branch chip),
  [done] force-delete unmerged (offered on failure), [done] create branch from a
  specific commit (right-click commit row).

## Phase 7 / polish — user feedback (2026-06-04)

- [done] Replace the error/info bar with a less intrusive bottom status bar.
- [done] Pull / fetch / push buttons in the toolbar.
- [done] Accent color away from blue → amber (dark theme stays).
- [done] On startup, auto-select the last-used repo.
- [done] Declutter the repo list (shows containing folder, full path on hover).
- [done] Fix Clone modal alignment.
- [done] Stash section visible (three equal, resizable sidebar sections).
- [done] **Resizable / dockable panels** — integrated dockview: History + Changes
  panels are draggable, dockable, resizable, with persisted layout + "Reset layout"
  button. Changes panel keeps internal vertical resizers for its sections.
  Follow-ups: [done] dockview theme matched to dark + amber; [done] "View" menu to
  re-open closed panels; [done] Diff is now a dockable panel (updates live on file
  click) instead of a modal.
- [done] **Save / load named layouts** — "Layouts" toolbar button opens a dialog to
  save the current arrangement under a name, load, or delete saved layouts
  (`Record<name, layout>` in localStorage, dockview toJSON/fromJSON).
- [backlog] **Left-most panel listing all repos we have access to** — overlaps the
  GitHub clone-browser item (needs GitHub auth + API). A persistent left rail of
  accessible repos, not just the ones opened locally.

## Ideas from GitHub Desktop (reference, 2026-06-04)

Captured from GitHub Desktop screenshots — not yet scoped, just ideas.

**Repo list / switcher**
- Auto-group repos by owner (Recent / personal / org), alongside our custom groups.
- Graceful missing-repo handling: when a repo's folder is gone, show "Can't find X —
  last seen at <path>" with Locate… / Clone again / Remove.
- Per-repo state indicators in the list (behind ↓ / unread dot) — overlaps the
  sync/fetch indicators item above.
- Private-repo lock icon.

**Repo actions**
- [done] Show in file explorer (Explorer button), View on GitHub (GitHub button).
  Follow-up: open in external editor (needs editor config).
- [done] "Fetched <time>" timestamp shown after a fetch.

**Commit UX**
- [done] Split commit message into Summary (single line) + Description (combined
  with a blank line when committing).
- [done] Co-authors on a commit — "+ Co-authors" toggle reveals a field; lines are
  appended as `Co-authored-by:` trailers on commit.

**Branches**
- [done] Dedicated branch dropdown in the toolbar: shows the current branch, filter,
  New branch, click to check out (sorted by most-recent commit). Follow-up: last-commit
  time per branch, "merge into current".

**Pull requests**
- [done] Pull Requests panel (View → Pull requests): lists open PRs via `gh pr list`,
  Refresh, and Checkout a PR branch (`gh pr checkout`). Follow-up: filter, open in browser.

**Diff view**
- [done] Clean file headers (real paths, no diff --git/index/+++ noise), line-number
  gutters, +/- column, full-width tints.
- [done] Split (side-by-side before/after) view with a Unified/Split toggle.
- [done] Commit diffs are clean (`git show --patch --format=`, no stat/commit-header
  noise) with a clickable changed-files list at the top (jumps to each file).
- Follow-up: per-file +/- counts; intra-line (word-level) highlighting.

**History / commit detail**
- [done] Revert a commit — right-click → "Revert & commit" (`git revert --no-edit`)
  or "Revert without committing" (`--no-commit`, lands staged for review). Conflicts
  surface an "Abort revert" button.
- [done] Selecting a commit in History shows its **commit diff** (`git show --stat
  --patch`) in the Diff panel. Follow-up: a dedicated changed-files list per commit.
- Author avatars in the graph/history rows.

**Empty states**
- "No local changes" suggestions panel (open editor / explorer / GitHub), like GH Desktop.

## Later phases (from the plan)

- Phase 3: double-click checkout, branch labels, hover/selection.
- Phase 4: drag-to-merge with preview + confirm (modifier = rebase).
- Phase 5: multiple named stashes panel.
- Phase 6: stage/commit/diff panel.
- Phase 7: rebase-drag, conflict resolver, perf, submodules, LFS.
