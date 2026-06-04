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
- **Clone browser**: list all repos the user has access to (like GitHub Desktop's
  clone tab) — needs GitHub auth (PAT/OAuth) + API to enumerate user + org
  (northwindsweden) repos, with search, instead of pasting a URL.

## Graph rendering

- **Virtualize the canvas** (windowing + devicePixelRatio scaling). Phase-2 graph
  renders a single non-virtualized canvas; to avoid the browser canvas height limit
  it drops to DPR=1 on very tall graphs (>~16k physical px) and is capped at
  `--max-count=1000` commits. Windowing removes both limits and restores crispness.

## Changes panel polish (phase 6 follow-ups, requested)

- **Stage all / unstage all** button per section (and/or checkboxes per file).
- **Multi-select** files with Ctrl/Shift, then bulk stage/unstage.
- **Right-click context menu** on files (stage, unstage, ignore, etc.) — a reusable
  `ContextMenu` exists (used on branch chips); extend it to file rows.
- [done] Discard changes / restore file (⟲ button + confirm).
- [done] Branch ops: create (toolbar), rename/delete (right-click branch chip).
  Follow-ups: force-delete unmerged branch; create branch from a specific commit.

## Phase 7 / polish — user feedback (2026-06-04)

- [doing] Replace the error/info bar with a less intrusive presentation (bottom status bar / toast).
- [doing] Pull / fetch / push buttons in the toolbar.
- [doing] Accent color away from blue (dark theme stays).
- [doing] On startup, auto-select the last-used repo.
- [doing] Declutter the repo list (long paths look noisy).
- [doing] Fix Clone modal alignment.
- [doing] Stash section barely visible — give it room.
- [done] **Resizable / dockable panels** — integrated dockview: History + Changes
  panels are draggable, dockable, resizable, with persisted layout + "Reset layout"
  button. Changes panel keeps internal vertical resizers for its sections.
  Follow-ups: refine dockview theme to match amber; make Diff a dockable panel
  instead of a modal; add a "View" menu to re-open closed panels.
- [backlog] **Left-most panel listing all repos we have access to** — overlaps the
  GitHub clone-browser item (needs GitHub auth + API). A persistent left rail of
  accessible repos, not just the ones opened locally.

## Later phases (from the plan)

- Phase 3: double-click checkout, branch labels, hover/selection.
- Phase 4: drag-to-merge with preview + confirm (modifier = rebase).
- Phase 5: multiple named stashes panel.
- Phase 6: stage/commit/diff panel.
- Phase 7: rebase-drag, conflict resolver, perf, submodules, LFS.
