# Loom — Backlog

Deferred work, captured so we don't forget. Ordered roughly, not strictly.

## Repo management (deferred from phase 2 by choice — risk-first)

A GitHub-Desktop-style repository switcher, but better:

- **Recent repos** list + quick switching (the "Current repository" dropdown).
- **Add** dropdown: clone from URL, add existing local folder, create new.
- **Filter** box to search repos by name.
- **Custom groupings** — user-defined groups, NOT just auto-grouping by owner.
  This is a gap in GitHub Desktop and a real differentiator for Loom.
- [done] Ahead/behind badges on Pull (behind) and Push (ahead), with a quiet
  auto-fetch every ~3 min that refreshes them. Follow-up: per-repo indicators in
  the switcher list too.
- Persist the repo list + groups locally (e.g. app userData JSON). [done — basic]
- [done] GitKraken-style **left branch/tag column** — refs now live in their own
  column left of the graph (not inline in the commit row); chips stay interactive
  (checkout, rename/delete, drag-merge). Selected row highlights across all columns.
- [done] **Drag-and-drop repo grouping** (2026-06-05): drag a repo onto another to
  reorder + adopt its group; onto a group header to move to that group's end; onto a
  "+ New group" drop zone to name a new group. Group order follows the drag (a group
  sits where its first repo is; Ungrouped last) — no separate ordering store. Groups
  are collapsible (state in localStorage) with a per-group count. Backend
  `setReposLayout` rewrites order + groups in one op. Built fresh in loom (didn't
  reuse the Halyard component — different repo/stack ownership). [done] drag whole
  groups to reorder (group headers draggable, Ungrouped pinned last). [done] also
  available as a dockable **Repositories** left panel (shared RepoList component;
  default layout + View menu; toolbar dropdown kept). Follow-up: multi-select drag.
- [done] **Clone browser**: the Clone dialog lists repos the user can access
  (owner + collaborator + org) via the `gh` CLI — searchable, click to clone. Uses
  the user's existing `gh auth` (no token stored in Loom). [done] paginates across
  all pages (JSONL). Follow-up: show the left-rail persistent version.

## Graph rendering

- [done] Adaptive lane width — lane spacing shrinks (down to 5px) when there are
  many concurrent branches so the graph gutter stays bounded (~200px) instead of
  growing very wide; node radius scales with it. History panel scrolls internally.
- [done] **Virtualized graph canvas** (2026-06-05). The canvas is sticky to the
  viewport and repaints only the visible row range per scroll frame (full DPR, no
  max-canvas-height limit), driven by a direct scroll listener so it tracks tightly.
  The refs + commit lists render in full (their natural height always matches the
  canvas — windowing them separately caused length-mismatch bugs, so it was dropped).
  History cap set to 2000 to keep the full DOM lists snappy.

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
- [done] **Hunk- and line-level staging** (2026-06-05, web-research inspired). Diff
  view shows a Stage/Unstage button per hunk; in unified view each add/del line has a
  checkbox for line-level staging. Reconstructs a one-hunk (or partial-line) patch and
  applies it via `git apply --cached [--reverse] --recount`. Verified end-to-end.
  Follow-up: line selection in split view; range-select with shift-click.
- [done] **Double-click a file** in the Changes panel to stage/unstage it.
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
- [partly done] **Left rail of repos** — a dockable **Repositories** panel now lists
  the *local* repos (grouped, drag-and-drop) on the left. Still backlog: a rail of
  *all GitHub-accessible* repos (needs GitHub auth + API), overlapping the clone
  browser — i.e. repos you can access but haven't opened locally.

## Ideas from GitHub Desktop (reference, 2026-06-04)

Captured from GitHub Desktop screenshots — not yet scoped, just ideas.

**Repo list / switcher**
- [deferred] Auto-group repos by owner (Recent / personal / org) — needs GitHub
  owner metadata per local repo, which we don't store cheaply. Custom groups work.
- [done] Graceful missing-repo handling: switching to a repo whose folder is gone
  shows a dialog with Locate… (repoint the entry) / Remove from list / Cancel.
  (Clone-again omitted — needs the stored remote URL.)
- [deferred] Per-repo state indicators in the list (behind ↓ / unread dot) — needs
  per-repo fetch/metadata; overlaps the sync/fetch indicators item above.
- [deferred] Private-repo lock icon — needs GitHub visibility metadata per repo.

**Repo actions**
- [done] Show in file explorer, View on GitHub — moved into a toolbar **⋯ menu**
  (decluttered the toolbar; also Refresh, Layouts, Reset layout live there now).
  "View on GitHub" now reports when there is no origin remote. [done] Open in
  external editor — ⋯ menu spawns the `code` CLI for the active repo.
- [done] "Fetched <time>" timestamp shown after a fetch.

**Commit UX**
- [done] Split commit message into Summary (single line) + Description (combined
  with a blank line when committing).
- [done] Co-authors on a commit — "+ Co-authors" toggle reveals a field; lines are
  appended as `Co-authored-by:` trailers on commit.

**Branches**
- [done] Dedicated branch dropdown in the toolbar: shows the current branch, filter,
  New branch, click to check out (sorted by most-recent commit). [done] last-commit
  time per branch shown in the list; [done] "Merge" button on hover merges that
  branch into the current one.

**Pull requests**
- [done] Pull Requests panel (View → Pull requests): lists open PRs via `gh pr list`,
  Refresh, and Checkout a PR branch (`gh pr checkout`). [done] filter input
  (title/number/branch); [done] click a PR title to open it on GitHub.

**Diff view**
- [done] Clean file headers (real paths, no diff --git/index/+++ noise), line-number
  gutters, +/- column, full-width tints.
- [done] Split (side-by-side before/after) view with a Unified/Split toggle.
- [done] Commit diffs are clean (`git show --patch --format=`, no stat/commit-header
  noise).
- [done] Pick one file at a time — the file list is now its **own dockable "Files"
  panel** (separate from the Diff panel); selecting a file shows only its diff
  (default Split). Commit clicks open both Files + Diff; arrange them freely.
- [done] per-file +/- counts in the Files panel. [done] intra-line (word-level)
  highlighting — token-LCS, in both Split and Unified views.

**History power features (web-research sweep, 2026-06-05)**
- [done] **Cherry-pick** a commit onto the current branch (commit context menu);
  conflicts flow through the conflict resolver.
- [done] **Reset** current branch to a commit — soft / mixed / hard (context menu,
  confirmed; hard warns about lost changes).
- [done] **Undo last commit** (More menu) — soft reset HEAD~1, keeps changes staged.
- [done] **Search commits** — History search bar filters by message/author/hash,
  highlights matches, Enter / ↑↓ jump between them and scroll into view.
- [done] **Interactive rebase** (2026-06-05). Commit menu → "Interactive rebase from
  here" opens a drag-to-reorder editor (commits above the picked one, oldest first)
  with a per-commit action: pick / squash / fixup / drop. Drives `git rebase -i`
  non-interactively via GIT_SEQUENCE_EDITOR (writes our todo) + GIT_EDITOR=true.
  Conflicts use the rebase conflict resolver. Mechanism CLI-validated.
  [done] **reword** (editable message per commit; driven via a GIT_EDITOR queue
  helper, squash still takes the default — CLI-validated incl. mixed reword+squash).
  Follow-up: drag commits directly in the graph canvas (vs the modal).
- [done] **Single-file history** — right-click a file → File history (git log
  --follow); click a commit opens its diff. Shown as a modal.
- [done] **Blame** — right-click a file → Blame; per-line author/hash gutter via
  git blame --porcelain; click a hash opens that commit. Modal.
- [backlog] **Undo/redo stack** beyond last-commit (reflog-based, broader) —
  deferred: risky/ambiguous semantics.
- [backlog] **Drag commits in the graph canvas** to rebase (vs the modal).
- [backlog] **Commit signing** (GPG/SSH) — needs the user's key setup.
- [backlog] **Image diff** — binary blob handling.

**History / commit detail**
- [done] Revert a commit — right-click → "Revert & commit" (`git revert --no-edit`)
  or "Revert without committing" (`--no-commit`, lands staged for review). Conflicts
  surface an "Abort revert" button.
- [done] Selecting a commit in History shows its **commit diff** in the Diff panel,
  and the **Files panel lists that commit's changed files** with [done] per-file +/-
  counts and [done] A/M/D/R status badges (status inferred client-side from the git
  diff headers; works for both commit and working-tree diffs). Clicking a file shows
  its diff.
- [done] Author avatars in the graph/history rows (color-hashed initials).

**Empty states**
- [done] Clean-tree empty state in the Changes panel ("No local changes — working
  tree clean", points to the ⋯ menu). Lighter than GH Desktop's action panel since
  open-editor/explorer/GitHub already live in the ⋯ menu.

## Later phases (from the plan)

- Phase 3: double-click checkout, branch labels, hover/selection.
- Phase 4: drag-to-merge with preview + confirm (modifier = rebase).
- Phase 5: multiple named stashes panel.
- Phase 6: stage/commit/diff panel.
- Phase 7: rebase-drag, [done] conflict resolver, perf, submodules, LFS.

## Conflict resolver (done 2026-06-05)

- When merge/rebase/revert stops on conflicts, a resolver dialog lists the
  conflicted files with per-file **Use ours / Use theirs / Mark resolved**, then
  **Continue** (enabled once all are resolved) or **Abort**. Continue uses
  `commit --no-edit` (merge) or `-c core.editor=true … --continue` (rebase/revert)
  so it completes non-interactively. Verified end-to-end against real merge and
  rebase conflicts in throwaway repos.
- Follow-ups: inline 3-way conflict editor (show ours/theirs hunks in the diff
  panel and edit in place); conflict count badge in the toolbar.
