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
  Now has GitHub remote AidinD/git-loom — push after each commit too.

## 2026-06-04 — Autonomous backlog pass (user away)

Shipped self-contained items: force-delete + create-branch-from-commit, Diff as a
dockable panel (replaced the modal), multi-select in the Changes panel (Ctrl/Shift +
bulk stage/unstage/discard). Also moved the whole project out of Northwind/Internal to
`D:\Repo\Tools\` (personal project).

**Deliberately NOT done unattended (need the user / verification):**
- GitHub clone-browser — needs the user to authenticate (PAT/OAuth).
- Graph virtualization — needs pixel-exact scroll-alignment that must be eyeballed;
  low value while capped at 1000 commits.
- In-UI conflict resolver — a full 3-way editor, too large for an unattended pass.
- Halyard-style drag-n-drop grouping — user wants parity with Halyard's actual
  component; confirm against `nw-studio-app` rather than guess.

### Rebase-drag (with user, 2026-06-04)
- Dropping a branch chip on another opens a menu: **Merge X into Y** (checkout Y, merge
  X) or **Rebase X onto Y** (checkout X, rebase Y). The labeled menu choice *is* the
  confirmation — chosen over a hidden modifier key (more discoverable) and over the old
  separate confirm modal. Conflicts surface with a kind-aware "Abort merge/rebase"
  button (`mergeAbort` / `rebaseAbort`). Verify on the sandbox before relying on it.

## 2026-06-05 — Conflict resolver, DnD grouping, diff/staging, virtualization, history rewriting

### Conflict resolver (in-UI, replaces the abort-only escape hatch)
- **Decision:** Per-file, per-block resolver. Each conflict block shows Current (ours)
  vs Incoming (theirs) side by side (+ a dimmed Base column when `merge.conflictStyle=diff3`),
  with Accept Current/Incoming/Both, an All-Current/All-Incoming shortcut, and an
  **editable merged textarea**; Save writes the file + stages it, gated until no markers
  remain. Continue uses `commit --no-edit` (merge) or `-c core.editor=true … --continue`
  (rebase/revert/cherry-pick).
- **Alternatives:** open-in-external-editor (GitHub Desktop's punt); a full 3-way editor.
- **Why:** beats GitHub Desktop's "go fix it elsewhere"; the editable-merged view covers
  manual tweaks without building a full 3-way editor. Known tradeoff: pressing a block
  button rebuilds the textarea from block choices (clobbers manual edits in other blocks)
  — accepted for v1.
- **Detection:** `conflictState` reads `.git` flags (MERGE_HEAD / REVERT_HEAD /
  CHERRY_PICK_HEAD / rebase dirs) so a repo left mid-op shows a toolbar badge even if the
  op wasn't started this session. Resolver is dismissible (badge reopens it).
- **Help row:** spells out which side is which for the *current* op, and warns that
  **rebase inverts** Current/Incoming — the single most common point of confusion.

### Drag-and-drop repo grouping + Repositories panel
- **Decision:** Drag repos between groups / reorder; drag group headers to reorder whole
  groups; "+ New group" drop zone; collapsible groups; rename-group (pencil on header).
  Group order is **drag-driven** (a group sits where its first repo is; Ungrouped last) —
  **no separate ordering store**. Backend `setReposLayout` rewrites order+groups in one op.
- **Alternative rejected:** reuse Halyard's grouping component. Built fresh instead —
  different repo/stack ownership (Loom is personal), not worth the coupling.
- **Also:** exposed the same `RepoList` as a dockable **Repositories** left panel (default
  layout + View menu); kept the toolbar dropdown too. (Earlier this was deferred pending
  Halyard parity — decided parity wasn't worth it.)

### Diff & staging
- **Word-level diff:** token-LCS highlight of intra-line changes (Split + Unified),
  capped at 400 tokens/line (minified-line guard) → falls back to whole-line tint.
- **Per-file status (A/M/D/R):** inferred client-side from the git diff headers
  (`new file`/`deleted file`/`rename`/`/dev/null`) — no extra git calls; works for commit
  and working-tree diffs alike.
- **Hunk + line staging:** reconstruct a one-hunk (or partial-line) patch and apply with
  `git apply --cached [--reverse] --recount`. Line patch transform: unselected deletions →
  context, unselected additions → dropped; `--recount` lets git fix the `@@` counts so we
  don't compute them. Line selection lives in **Unified view only** (cleanest per-line).
  Mechanism CLI-validated before any UI. Double-click a Changes-panel file = stage/unstage.

### Graph performance: canvas-only virtualization + incremental load
- **Decision:** Virtualize **only the canvas** (sticky to viewport, repaints the visible
  row range via a **direct scroll listener**); the refs/commit lists render in full.
  History loads **150/page**, appending on scroll near bottom.
- **Alternatives rejected:** (1) windowing the DOM lists too — tried it, but the lists
  measured the viewport via React state while the canvas read it live, so they disagreed
  and the graph ran past the last commit. Full lists always match the canvas height. (2)
  routing canvas redraws through React state — caused the gutter to lag behind native
  scroll. (3) the old single tall canvas — hit the ~16k-px browser limit (DPR drop → blur).
- **Cap:** 2000 commits, to keep the full DOM lists snappy now that only the canvas is windowed.

### History-rewriting sweep (web-research inspired)
- **Cherry-pick / reset (soft/mixed/hard) / undo-last-commit** from the commit context
  menu (+ More menu). Reset is confirmed; hard warns. Undo = `reset --soft HEAD~1`.
  Cherry-pick conflicts flow through the resolver (new `cherry-pick` kind).
- **Commit search:** highlights matches and jumps between them (Enter / ↑↓) — does **not**
  filter the list, because filtering would break the graph's lane layout.
- **Interactive rebase:** commit menu → drag-to-reorder modal with per-commit
  pick/squash/fixup/drop. Driven by `git rebase -i` with **`GIT_SEQUENCE_EDITOR`** writing
  our todo file + **`GIT_EDITOR=true`** taking default squash messages.
  - **Alternatives rejected:** dragging commits directly in the canvas graph (much harder,
    needs gestures for squash; the modal still *has* drag and is testable); avoiding `-i`
    via cherry-pick sequences (can't express squash/reorder cleanly).
  - **Reword deferred** — needs a message-supplying editor, not just `true`.
  - Mechanism CLI-validated (reorder/squash/drop) before building the UI.

### Versioning, releases & auto-update (2026-06-08)
- **Auto-bump:** a tracked pre-commit hook (`.githooks/pre-commit`,
  `core.hooksPath=.githooks`) bumps the package.json patch on every commit and
  stages it. Since Loom is 100% AI-coded, the version doubles as a build counter.
  Bypass with `--no-verify`. Note: `core.hooksPath` is local config — a fresh clone
  must run `git config core.hooksPath .githooks` once.
- **Packaging:** electron-builder, Windows NSIS, **unsigned** (SmartScreen warning
  accepted for a personal tool; EV cert is the only way to fully avoid it — overkill).
- **Distribution:** publish to **GitHub Releases on the public `AidinD/git-loom`**.
  No separate release repo and **no embedded token** — unlike Halyard (whose release
  repo is private, so it embeds a read-only token); electron-updater reads public
  releases without auth.
- **CI over local publish:** a GitHub Actions workflow builds + publishes on a `v*`
  tag push (uses the default `GITHUB_TOKEN`). Repeatable, no local secrets. To cut a
  release: tag the current version `v<x.y.z>` and push the tag.
- **Auto-update UX:** electron-updater checks on launch (packaged only), downloads in
  the background, and the main process notifies the renderer → a persistent "Update
  ready — Restart & update" toast (`quitAndInstall`). In-app prompt chosen over the
  silent `checkForUpdatesAndNotify` native notification (more visible/controllable).
- **Error/info toasts:** replaced the cramped status bar with a floating, stacked
  toast (icon + title + wrapping message); info auto-dismisses, errors persist.

### UX calibration
- **Danger-red** reserved for actions that can lose work (hard reset, discard,
  force-delete) — un-flagged Revert (it's non-destructive; adds a commit).
- **Destructive last:** reset variants sit at the bottom of the commit menu, hard reset last.
- **Modals:** Enter confirms, Esc closes the topmost overlay. Modal backdrop `z-index`
  raised above dockview chrome (panels were painting over modals).
