# Loom — Decision Log

Key decisions and their rationale. The *why*, not every step (git history covers that).
Newest entries can go on top. Format: decision · alternatives · why.

---

## 2026-06-04 — Initial build (phases 1–7 + dockview)

### Product intent & priority
- **Decision:** Build as a personal daily-use git client first; internal distribution
  at Aidin is a possible second; public/commercial is a distant third.
- **Why:** The git-client market is crowded and hard to monetize (Fork, Sublime Merge,
  GitHub Desktop, lazygit, GitKraken). Building for self first avoids betting on a
  hypothesis — if it's good enough that I drop GitHub Desktop for it, *then* it's worth
  showing others.

### App shell: Electron (not Tauri)
- **Alternatives:** Tauri (Rust core, ~25× smaller bundle, faster start).
- **Why Electron:** The value is the graph UI (web tech either way) and git is spawned
  externally, so the backend language barely matters. Electron wins on a tighter HMR
  feedback loop, lower bug surface in a codebase that is 100% AI-coded and not read line
  by line, and stack-consistency with Halyard (`nw-studio-app`) for component reuse.
  Tauri's bundle/perf edge only matters in the public-sell scenario — revisit then; the
  graph renderer is kept shell-independent so a port is mostly the thin backend layer.

### Git backend: spawn the system `git` binary
- **Alternatives:** isomorphic-git (pure JS).
- **Why:** Correctness and speed on real-world repos; uses git's own commit-graph cache.
  GPL-safe because we invoke the binary as an external process (no linking), same as
  Fork/Tower/GitHub Desktop. Keep dependencies MIT/Apache/BSD to stay clean if ever public.

### Commit graph: roll our own lane layout + canvas
- **Alternatives:** gitgraph.js, d3-dag, dagre.
- **Why:** Those are built for static documentation rendering — no interaction,
  hit-testing, or drag zones. The lane-allocation algorithm is well understood, so a
  small custom pure function (`graph/layout.ts`) + a canvas renderer gives us control and
  performance. Kept shell-independent for reuse/porting.
- **Edge routing:** lines stay vertical in their lane and bend over a single row at the
  junction (branch bends near the parent, merge bends near the child). The first attempt
  (full-span beziers) looked cluttered; one-row bends give the GitKraken/Tower look.

### Scaffolding: manual, not `npm create @quick-start/electron`
- **Why:** The interactive scaffolder hangs on prompts in the non-interactive shell;
  hand-authoring electron-vite + React + TS is deterministic and fully controlled.

### Error handling: result objects, not thrown errors
- **Decision:** Git ops return `{ ok: true, ... } | { ok: false, error }`.
- **Why:** Throwing across Electron IPC wraps the message in `Error invoking remote
  method '…'`. Returning a discriminated result gives clean, user-facing messages.
- **Message tidying:** run git with `-c advice.detachedHead=false` and strip `hint:`
  lines, so the status bar shows concise messages instead of git's advice walls.

### Interaction model
- **Checkout:** double-click a branch/tag chip or a commit row. A remote chip
  (`origin/x`) checks out the **short name** so git creates/switches to a local tracking
  branch instead of landing in detached HEAD. The `HEAD → branch` chip is treated as a
  real (draggable/droppable) branch, since the current branch is the most common merge
  target. Local branches with `/` are distinguished from remotes by checking the actual
  `git remote` list.
- **Drag-to-merge:** drag a branch chip onto another = "merge source into target"
  (checkout target, then merge source). Gated by a **confirmation dialog**; conflicts are
  detected and surfaced with an **"Abort merge"** escape hatch (no in-UI resolver yet).

### Repo switcher
- **Decision:** Persist opened repos to JSON in Electron `userData`; toolbar dropdown with
  recent list, quick-switch, add-existing, clone-from-URL, filter, remove, and basic
  text-based groups. Auto-open the last-used repo on startup.
- **Deferred:** GitHub-auth-backed browser of all accessible repos; Halyard-style
  drag-and-drop grouping (see BACKLOG.md).

### Docking layout: dockview (v6)
- **Alternatives:** hand-roll a docking system (weeks, bug-prone); rc-dock; FlexLayout.
- **Why dockview:** modern, TS-native, serializable layouts, floating panels, MIT,
  actively maintained. History + Changes are dockable panels; panels read live data via
  a React context (`loom-context.ts`) while App owns state. Layout persists to
  localStorage with a "Reset layout" escape hatch (panels can be closed).
- **Follow-ups:** theme refinement to match amber; make Diff a dockable panel.

### Theme
- **Decision:** Dark theme, **amber** accent (`#f0a868`); tags violet to distinguish from
  amber branches; dockview `themeDark` with amber drag-sash.
- **Why:** User preference — likes dark, dislikes blue. Amber chosen first, with violet
  as the fallback if it doesn't sit well.

### Branch operations & discard (follow-up)
- **Decision:** Create branch (toolbar → modal, `checkout -b` from HEAD), and
  rename/delete via a **right-click context menu** on local branch chips. Discard via a
  ⟲ button on Changes rows, behind a confirm.
- **Why context menu:** branch rename/delete don't warrant permanent buttons, and the
  user wanted right-click menus anyway — so this also introduces a reusable `ContextMenu`
  primitive for later (file actions, etc.).
- **Discard semantics:** untracked → `git clean -f`; tracked → `git restore
  --staged --worktree --source=HEAD`. Always behind a confirm (loses uncommitted work).
  Edge case (discarding a staged brand-new file leaves it on disk untracked) deferred.
- **Delete:** `branch -d` (safe; refuses unmerged/current). Force-delete deferred.

### Process
- **Build order:** risk-first "walking skeleton" — attack the existential risk (does the
  graph + drag interaction feel good?) before breadth (stash, diff, switcher). Low-risk,
  well-understood features come later, depth-first.
- **Version control:** commit after each major change (user preference, this project).
