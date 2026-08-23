# Loom — Decision Log

Key decisions and their rationale. The *why*, not every step (git history covers that).
Newest entries can go on top. Format: decision · alternatives · why.

---

## 2026-08-23 — Loom joins the family: its own mark, and the toolbar becomes the title bar

Jot, Nib and Helm share a drawing language, written down in Nib's icon
generator: one object, transparent background, thick strokes with round caps, a
warm colour, no container and no square. Loom was left out of that pass. Its
icon was a dark rounded-square containing a teal/blue/red node graph - the
opposite of every one of those rules - and every frame in its `.ico` was a
resample of that one detailed drawing, so 16px was a smear.

### The mark: the weft's path through the warp
- **Decision:** A warp thread top to bottom, with the weft looped around it -
  once right, once left. Madder red, its own point on the family's warm
  spectrum. Lives in `scripts/generate-icon.mjs` and, with the same geometry, in
  `src/renderer/src/LoomMark.tsx`.
- **Why this shape:** a whole loom is a frame, and a frame at 16px is a grey
  rectangle. So it draws the *interlacement* instead - which is simultaneously
  the thing the app is named after and the picture Loom already draws in its own
  commit graph: a branch leaving the trunk and merging back. Two readings, both
  true.
- **Alternatives, all rejected at 16px before anything else:** a plain weave of
  three warps and two wefts turned to stripes; two strands crossing read as a
  bare X, which on a git client says "close"; a shuttle read as an eye; a single
  branch-and-merge read as the letter thorn. Pulling the two loops apart so the
  warp shows between them is what stops the final one reading as a dollar sign.
- **On the colour:** deliberately *not* Loom's UI accent (`--accent`, a warm
  tan) - that sits too close to Nib's brass. Jot does the same thing, a coral
  mark over a blue UI: the mark's colour is a family decision, the accent is a
  UI one.

### The toolbar is now the title bar
- **Decision:** `frame: false`, and the toolbar row carries the drag region, the
  brand (mark, wordmark, version) and its own minimise/maximise/close buttons -
  the same introduction Jot and Nib give.
- The version moved out of the far right of the toolbar and into the brand
  cluster, so `.app-version` is gone.
- `.toolbar .window-controls button` is scoped under `.toolbar` on purpose:
  `.toolbar button` gives every toolbar button an amber fill at the same
  specificity and wins on source order, so the window buttons have to *outrank*
  it, not merely precede it.

### One icon.ico, generated, with a second drawing for the small sizes
- 16/20/24/32/48/64/128/256, all drawn rather than resampled. 20 and 24 are in
  there because the taskbar asks for them at 125% and 150% display scaling.
- The changeover to the heavier small drawing is at 32, the same threshold Jot
  uses; below it the true stroke thins under a pixel and the loops close up
  against the warp.

### A bug worth remembering: zero-width bounding boxes eat SVG gradients
The warp is a vertical line, so its bounding box has zero width - and an
`objectBoundingBox` gradient (the default) on a zero-width shape renders
*nothing at all*. The first version of `LoomMark` was therefore just the weft, a
red squiggle with no thread through it, and it looked plausible enough to miss.
`gradientUnits="userSpaceOnUse"` fixes it and also makes one ramp span the whole
mark instead of restarting inside every path. Nib's `NibMark` has the same
latent bug in its slit (`M50 52 V86`) - verified, its slit does not render.

---

## 2026-06-23 — Pull that offers rebase or merge on divergence

### Fall back from `--ff-only` instead of dead-ending
- **Decision:** Pull still tries `git pull --ff-only` first. When that fails *and* the
  fetch it implies shows both sides have commits (ahead > 0 and behind > 0), Loom shows a
  dialog offering **Rebase** (recommended, `pull --rebase --autostash`) or **Merge**
  (`pull --no-rebase --autostash`), instead of just surfacing git's error. Both routes
  push an undo-stack entry and route conflicts into the existing merge/rebase resolver.
- **Alternatives:** always rebase without asking; always merge without asking; leave the
  ff-only error as-is and make the user resolve it manually (old behavior).
- **Why:** ff-only is the safe default (never rewrites/merges history unasked), but a
  silent dead-end on the common "local + remote both moved" case is bad UX. Asking rather
  than picking one strategy respects that rebase vs merge is a personal-history-shape
  preference, not something Loom should decide unilaterally. `--autostash` on both keeps
  a dirty working tree from blocking the operation.

### Parallelize repo-refresh reads
- **Decision:** `loadLog`'s independent reads (status, stash list, branches,
  ahead/behind, conflict state, repo list) now run via `Promise.all` instead of
  sequentially; `loadStatus` likewise runs status + stash list concurrently.
- **Why:** Each git spawn costs real process overhead on Windows (~320ms sequential vs
  ~95ms concurrent for the full refresh). No correctness reason for the ordering — they
  don't depend on each other.

## 2026-06-15 — Relative commit-date column

### Right-aligned relative time per row, not date section headers
- **Decision:** Each commit row shows a compact relative label (just now / 5m / 3h /
  Yesterday / N days ago / short date) right-aligned in its own column, full local
  timestamp on hover.
- **Alternatives:** grouping the history list under date section headers (GitHub
  Desktop-style).
- **Why:** the graph is a topologically-ordered DAG drawn 1:1 with canvas lanes; slicing
  it into date-header groups would break that alignment. A per-row label preserves it.
- **Bug note:** first shipped multiplying the already-millisecond timestamp by 1000
  again, so every commit showed as "just now" (fixed same day, a59ef34).

## 2026-06-29 — `git status` disables rename detection

### `--no-renames` so staged and unstaged views agree
- **Decision:** `status` passes `--no-renames` to `git status --porcelain`. A delete +
  a similarly-named new file now shows as separate D and A entries on both the staged
  and unstaged sides.
- **Why:** without it, staging the pair collapsed them into a single R (rename) entry
  once staged, while the unstaged view still showed them as two separate files — the two
  Changes-panel sections disagreed about what had happened. The working tree can't
  detect a rename anyway (it only exists once both sides are staged), so suppressing
  detection entirely keeps both views consistent rather than having one lag the other.

## 2026-06-09 — Working-tree status fixes (untracked files, discard, signing default)

### List untracked files individually; diff them via `--no-index` against empty
- **Decision:** `git status` now passes `--untracked-files=all` (previously a new
  untracked directory collapsed to one entry, hiding its files from Changes). Clicking an
  untracked file diffs it with `git diff --no-index -- /dev/null <file>` (tolerating its
  exit code 1) so it renders as all-added instead of an empty diff.
- **Why:** both were silent gaps — `git diff` has nothing to compare an untracked file
  against, and the collapsed-directory status entry gave no per-file staging.

### Batch discard-many into at most two git calls
- **Decision:** Discarding N selected files no longer loops one git invocation per file;
  untracked files are removed in one `git clean -f -- <files...>` and tracked files reset
  in one `git restore --staged --worktree --source=HEAD -- <files...>`.
- **Why:** bulk discard was one process spawn per file — slow for large selections with
  no benefit, since both underlying commands already accept a pathspec list.

### Commit signing defaults OFF
- **Decision:** `commitSign` now initializes from `localStorage.getItem('loom.signCommits')
  === 'true'` (opt-in), not `!== 'false'` (opt-out).
- **Supersedes:** the 2026-06-08 commit-signing entry below didn't specify a default;
  this sets it to off. Signing still requires the global SSH-signing git config to be set
  up regardless of this toggle's state — the toggle only controls whether *Loom* passes
  `-S` per commit.
- **Why:** a first-run user without SSH signing configured would otherwise have every
  commit fail (or need `--no-gpg-sign` silently threaded through) with no visible opt-in
  step. Defaulting off matches "off until you deliberately turn it on."

### View menu marks already-open panels
- **Decision:** `ContextMenuItem` gained an optional `checked` field, rendered as a
  checkmark column; the toolbar's panel-visibility menu now checks `dockApi.getPanel(id)`
  per entry so open panels show a ✓.
- **Why:** cheap correctness/discoverability fix — the menu previously gave no
  indication an item was already open, so clicking it just refocused rather than opened.

---

## 2026-06-08 — Bulk cleanup of local branches without a remote

### Preview + checkboxes + two delete buttons, not a blind confirm
- **Decision:** "Clean up local branches" opens a modal listing every local branch that
  has no upstream OR whose upstream is gone, each tagged with which case it is, with a
  checkbox per branch (all pre-checked). Two actions: *Delete selected* (safe, `git
  branch -d`, refuses unmerged) and *Force delete* (`-D`). A "Fetch & prune" button
  refreshes gone-status. The current branch and `main`/`master` are never listed.
- **Alternatives:** A single "Delete N branches?" confirmation; only targeting "gone"
  branches; only targeting "no upstream" branches.
- **Why:** This is the most destructive action in the app, so visibility beats a count.
  Per-branch checkboxes let the user exclude anything they recognise; defaulting to the
  safe `-d` means even an over-broad selection can't drop unmerged work without an
  explicit second click on Force delete. Including both "no upstream" and "gone" matches
  the user's intent, and the per-branch tag keeps the distinction clear. Bulk delete runs
  one `git branch` per branch so partial failures (e.g. `-d` refusing an unmerged branch)
  are reported individually, and the refused ones stay selected for a one-click force.

---

## 2026-06-08 — Remote-branch deletion + "delete everywhere"

### Resolve the remote ref via upstream, not by name-matching
- **Decision:** "Delete branch everywhere" (local + remote) finds the remote ref through
  the branch's configured upstream (`git for-each-ref %(upstream:remotename/remoteref)`),
  and only offers the remote step when an upstream exists. Deleting a remote branch
  directly is done from the `origin/…` chip's context menu (`git push <remote> --delete`).
- **Alternatives:** Scan loaded commit refs for any `<remote>/<name>` match and delete
  that; or always assume `origin`.
- **Why:** Upstream is git's authoritative answer for "where does this branch push," and
  handles the case where the local and remote branch names differ. Name-matching is a
  guess that breaks on forks/renames and on multiple remotes. When there's no upstream,
  we fall back to a local-only delete (the user can still target the remote chip
  directly) rather than guessing. Remote delete returns a clean message because git
  reports `- [deleted]` on stderr, which we don't want leaking into command history.

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

### Commit signing (2026-06-08)
- **SSH signing, not GPG.** Much simpler — no keyring, no gpg-agent, no passphrase
  dance. Generated a dedicated passphraseless `~/.ssh/signing_ed25519` (cmd /c for a
  truly-empty passphrase — PowerShell quoting kept setting a literal one). git config:
  `gpg.format ssh`, `user.signingkey <pub>`, `commit.gpgsign true`, and
  `gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers` for local verification (verified
  end-to-end: %G? = G).
- **Loom toggle:** a persisted "Sign commits" checkbox passes `-S` / `--no-gpg-sign`,
  overriding the global config per preference.
- **GitHub registration is manual:** adding the key as a signing key needs gh's
  `admin:ssh_signing_key` scope (an interactive auth refresh), so the user pastes the
  pubkey into GitHub once for the Verified badge. Not automated to avoid a blind
  scope escalation.

### Dev-server process management (note)
- Killing stale electron-vite dev instances via `Get-CimInstance` (WMI) proved flaky
  ("Shutting down" errors), leaving duplicate instances that fought over the port and
  userData cache (GPU cache "Access is denied"). Reliable approach: kill by the port
  owner (`Get-NetTCPConnection -LocalPort 5173.. | Stop-Process -Id OwningProcess`) plus
  `Get-Process electron | Where Path -like '*Tools\loom*'`. No WMI.

### UX calibration
- **Danger-red** reserved for actions that can lose work (hard reset, discard,
  force-delete) — un-flagged Revert (it's non-destructive; adds a commit).
- **Destructive last:** reset variants sit at the bottom of the commit menu, hard reset last.
- **Modals:** Enter confirms, Esc closes the topmost overlay. Modal backdrop `z-index`
  raised above dockview chrome (panels were painting over modals).
