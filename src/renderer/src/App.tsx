import { useCallback, useEffect, useRef, useState } from 'react'
import { DockviewReact, themeDark } from 'dockview'
import type { DockviewApi, DockviewReadyEvent } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import type {
  Commit,
  FileChange,
  RepoEntry,
  RepoChangeKind,
  StashEntry,
  GithubRepo,
  BlameLine
} from '../../shared/types'
import ChangesPanel from './ChangesPanel'
import DiffPanel from './DiffPanel'
import FilesPanel from './FilesPanel'
import PrPanel from './PrPanel'
import ReposPanel from './ReposPanel'
import RepoSwitcher from './RepoSwitcher'
import BranchSwitcher from './BranchSwitcher'
import GraphView from './GraphView'
import ConflictResolver from './ConflictResolver'
import CleanupBranchesModal from './CleanupBranchesModal'
import RebaseModal from './RebaseModal'
import type { RebaseRow } from './RebaseModal'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import LogPanel from './LogPanel'
import { LoomMark } from './LoomMark'
import { LoomContext, useLoom } from './loom-context'
import type { LoomContextValue, DiffView, ActivityEntry } from './loom-context'


interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

interface ConfirmState {
  message: string
  action: () => void
}

type SavedLayout = ReturnType<DockviewApi['toJSON']>

function readSavedLayouts(): Record<string, SavedLayout> {
  try {
    return JSON.parse(localStorage.getItem('loom.layouts') || '{}')
  } catch {
    return {}
  }
}

// Stable dockview panel components — they read live data from LoomContext.
function ChangesDockPanel() {
  const l = useLoom()
  return (
    <ChangesPanel
      files={l.changes}
      stashes={l.stashes}
      commitSummary={l.commitSummary}
      onCommitSummaryChange={l.setCommitSummary}
      commitDescription={l.commitDescription}
      onCommitDescriptionChange={l.setCommitDescription}
      commitCoauthors={l.commitCoauthors}
      onCommitCoauthorsChange={l.setCommitCoauthors}
      commitSign={l.commitSign}
      onToggleSign={l.setCommitSign}
      onStage={l.onStage}
      onUnstage={l.onUnstage}
      onStageAll={l.onStageAll}
      onUnstageAll={l.onUnstageAll}
      onStageMany={l.onStageMany}
      onUnstageMany={l.onUnstageMany}
      onDiscardMany={l.onDiscardMany}
      onAddToGitignore={l.onAddToGitignore}
      onStashMany={l.onStashMany}
      onCommit={l.onCommit}
      onShowDiff={l.onShowDiff}
      onFileHistory={l.onFileHistory}
      onBlame={l.onBlame}
      onStash={l.onStash}
      onPopStash={l.onPopStash}
      onDropStash={l.onDropStash}
      onDiscard={l.onDiscard}
      openContextMenu={l.openContextMenu}
    />
  )
}

function GraphDockPanel() {
  return <GraphView />
}

function DiffDockPanel() {
  return <DiffPanel />
}

function FilesDockPanel() {
  return <FilesPanel />
}

function PrDockPanel() {
  return <PrPanel />
}

function ReposDockPanel() {
  return <ReposPanel />
}

function LogDockPanel() {
  return <LogPanel />
}

const DOCK_COMPONENTS = {
  changes: ChangesDockPanel,
  graph: GraphDockPanel,
  diff: DiffDockPanel,
  files: FilesDockPanel,
  pr: PrDockPanel,
  repos: ReposDockPanel,
  log: LogDockPanel
}

function buildDefaultLayout(api: DockviewApi): void {
  // Layout: Repositories | [Changes / Pull requests] | History | Files | Diff
  api.addPanel({ id: 'graph', component: 'graph', title: 'History' })
  const repos = api.addPanel({
    id: 'repos',
    component: 'repos',
    title: 'Repositories',
    position: { referencePanel: 'graph', direction: 'left' }
  })
  const changes = api.addPanel({
    id: 'changes',
    component: 'changes',
    title: 'Changes',
    position: { referencePanel: 'graph', direction: 'left' }
  })
  api.addPanel({
    id: 'pr',
    component: 'pr',
    title: 'Pull requests',
    position: { referencePanel: 'changes' }
  })
  const files = api.addPanel({
    id: 'files',
    component: 'files',
    title: 'Files',
    position: { referencePanel: 'graph', direction: 'right' }
  })
  api.addPanel({
    id: 'diff',
    component: 'diff',
    title: 'Diff',
    position: { referencePanel: 'files', direction: 'right' }
  })

  // Keep Changes as the active tab (not Pull requests), and make side columns
  // reasonable widths (Files narrow, Diff wide). Guarded — sizing API is best-effort.
  changes.api.setActive()
  try {
    repos.group.api.setSize({ width: 240 })
    changes.group.api.setSize({ width: 300 })
    files.group.api.setSize({ width: 220 })
  } catch {
    // Older/newer dockview sizing API — fall back to default proportions.
  }
}

function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [hasMoreCommits, setHasMoreCommits] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [remotes, setRemotes] = useState<string[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [branchInfo, setBranchInfo] = useState<Record<string, string>>({})
  const [currentBranch, setCurrentBranch] = useState('')
  const [ahead, setAhead] = useState(0)
  const [behind, setBehind] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [conflictKind, setConflictKind] = useState<
    'merge' | 'rebase' | 'revert' | 'cherry-pick' | null
  >(null)
  const [showConflict, setShowConflict] = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [divergePull, setDivergePull] = useState<{ ahead: number; behind: number } | null>(
    null
  )
  const [conflictCount, setConflictCount] = useState(0)
  const [rebaseBase, setRebaseBase] = useState<string | null>(null)
  const [rebaseRows, setRebaseRows] = useState<RebaseRow[]>([])
  const [undoStack, setUndoStack] = useState<{ label: string; sha: string }[]>([])
  const [redoStack, setRedoStack] = useState<{ label: string; sha: string }[]>([])
  const [fileHistoryView, setFileHistoryView] = useState<{
    file: string
    commits: Commit[]
  } | null>(null)
  const [blameView, setBlameView] = useState<{
    file: string
    lines: BlameLine[]
  } | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const activityId = useRef(0)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [commitSummary, setCommitSummary] = useState('')
  const [commitSign, setCommitSign] = useState(
    () => localStorage.getItem('loom.signCommits') === 'true'
  )
  const [commitDescription, setCommitDescription] = useState('')
  const [commitCoauthors, setCommitCoauthors] = useState('')
  const [diffView, setDiffView] = useState<DiffView | null>(null)
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [groupModalRepo, setGroupModalRepo] = useState<RepoEntry | null>(null)
  const [groupInput, setGroupInput] = useState('')
  const [groupRenameOld, setGroupRenameOld] = useState<string | null>(null)
  const [groupRenameInput, setGroupRenameInput] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneFilter, setCloneFilter] = useState('')
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [stashRequest, setStashRequest] = useState<{ files: string[] | null } | null>(
    null
  )
  const [stashName, setStashName] = useState('')
  const [layoutsOpen, setLayoutsOpen] = useState(false)
  const [layoutName, setLayoutName] = useState('')
  const [savedLayouts, setSavedLayouts] = useState<Record<string, SavedLayout>>(
    readSavedLayouts
  )
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchStart, setNewBranchStart] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [missingRepo, setMissingRepo] = useState<string | null>(null)

  useEffect(() => {
    return window.api.onUpdateReady((version) => setUpdateVersion(version))
  }, [])

  // The undo/redo history is per-repo; clear it when switching repos.
  useEffect(() => {
    setUndoStack([])
    setRedoStack([])
  }, [repoPath])

  // Mirror info/error messages into the command-history log.
  useEffect(() => {
    if (info) {
      const id = (activityId.current += 1)
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      setActivity((list) =>
        [{ id, time, message: info, kind: 'info' as const }, ...list].slice(0, 200)
      )
    }
  }, [info])

  useEffect(() => {
    if (error) {
      const id = (activityId.current += 1)
      const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      setActivity((list) =>
        [{ id, time, message: error, kind: 'error' as const }, ...list].slice(0, 200)
      )
    }
  }, [error])

  useEffect(() => {
    window.api.getVersion().then(setAppVersion)
    window.api.listRepos().then(setRepos)
    window.api.getCurrentRepo().then((path) => {
      if (path) {
        loadLog(path)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Info toasts auto-dismiss; errors stay until the user closes them.
  useEffect(() => {
    if (info && !error) {
      const id = setTimeout(() => setInfo(null), 4500)
      return () => clearTimeout(id)
    }
    return undefined
  }, [info, error])

  // Escape closes the topmost open modal/overlay.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return
      }
      if (contextMenu) {
        setContextMenu(null)
        return
      }
      if (confirm) {
        setConfirm(null)
        return
      }
      if (stashRequest) {
        setStashRequest(null)
        return
      }
      if (groupModalRepo) {
        setGroupModalRepo(null)
        return
      }
      if (groupRenameOld !== null) {
        setGroupRenameOld(null)
        return
      }
      if (rebaseBase) {
        setRebaseBase(null)
        return
      }
      if (fileHistoryView) {
        setFileHistoryView(null)
        return
      }
      if (blameView) {
        setBlameView(null)
        return
      }
      if (cloneOpen) {
        setCloneOpen(false)
        return
      }
      if (newBranchOpen) {
        setNewBranchOpen(false)
        return
      }
      if (renameTarget) {
        setRenameTarget(null)
        return
      }
      if (missingRepo) {
        setMissingRepo(null)
        return
      }
      if (layoutsOpen) {
        setLayoutsOpen(false)
        return
      }
      if (showConflict) {
        setShowConflict(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [
    contextMenu,
    confirm,
    stashRequest,
    groupModalRepo,
    groupRenameOld,
    rebaseBase,
    fileHistoryView,
    blameView,
    cloneOpen,
    newBranchOpen,
    renameTarget,
    missingRepo,
    layoutsOpen,
    showConflict
  ])

  // Quietly auto-fetch every few minutes and refresh the ahead/behind badge.
  useEffect(() => {
    if (!repoPath) {
      return
    }
    const id = setInterval(() => {
      window.api
        .fetch(repoPath)
        .then(() => window.api.aheadBehind(repoPath))
        .then((ab) => {
          setAhead(ab.ahead)
          setBehind(ab.behind)
        })
        .catch(() => {})
    }, 180000)
    return () => clearInterval(id)
  }, [repoPath])

  // The main process watches the repo on disk and tells us what moved, so an
  // edit or a commit made outside Loom shows up on its own. 'refs' (HEAD, a
  // branch, an in-progress rebase) needs the full log refresh; anything else is
  // just the working tree or the index, where status alone is enough.
  useEffect(() => {
    if (!repoPath) {
      return
    }
    return window.api.onRepoChanged((change) => {
      if (change.repoPath !== repoPath) {
        return
      }
      void refreshFromDisk(change.kind)
    })
  }, [repoPath])

  // Belt and braces: fs.watch can miss events (network shares, buffer
  // overflows during a huge checkout), and coming back to the window is exactly
  // when a stale list is most visible. Status only — cheap enough to be free.
  useEffect(() => {
    if (!repoPath) {
      return
    }
    function onFocus(): void {
      void refreshFromDisk('status')
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [repoPath])

  const dockApi = useRef<DockviewApi | null>(null)

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api
    dockApi.current = api
    const saved = localStorage.getItem('loom.layout')
    let restored = false
    if (saved) {
      try {
        api.fromJSON(JSON.parse(saved))
        restored = true
      } catch {
        restored = false
      }
    }
    if (!restored) {
      buildDefaultLayout(api)
    }
    api.onDidLayoutChange(() => {
      localStorage.setItem('loom.layout', JSON.stringify(api.toJSON()))
    })
  }, [])

  function resetLayout(): void {
    const api = dockApi.current
    if (!api) {
      return
    }
    localStorage.removeItem('loom.layout')
    api.clear()
    buildDefaultLayout(api)
  }

  function showPanel(
    id: 'graph' | 'changes' | 'diff' | 'files' | 'pr' | 'repos' | 'log',
    title: string
  ): void {
    const api = dockApi.current
    if (!api) {
      return
    }
    const existing = api.getPanel(id)
    if (existing) {
      existing.api.setActive()
    } else {
      api.addPanel({ id, component: id, title })
    }
  }

  function persistLayouts(next: Record<string, SavedLayout>): void {
    setSavedLayouts(next)
    localStorage.setItem('loom.layouts', JSON.stringify(next))
  }

  function saveCurrentLayout(): void {
    const api = dockApi.current
    const name = layoutName.trim()
    if (!api || name.length === 0) {
      return
    }
    persistLayouts({ ...savedLayouts, [name]: api.toJSON() })
    setLayoutName('')
  }

  function loadLayout(name: string): void {
    const api = dockApi.current
    const layout = savedLayouts[name]
    if (api && layout) {
      api.fromJSON(layout)
    }
    setLayoutsOpen(false)
  }

  function deleteLayout(name: string): void {
    const next = { ...savedLayouts }
    delete next[name]
    persistLayouts(next)
  }

  async function loadStatus(path: string): Promise<FileChange[]> {
    // status and stashList are independent reads — run them concurrently.
    const [result, stashResult] = await Promise.all([
      window.api.status(path),
      window.api.stashList(path)
    ])
    const files = result.ok ? result.files : []
    setChanges(files)
    setStashes(stashResult.ok ? stashResult.stashes : [])
    return files
  }

  /**
   * The diff on screen, mirrored into a ref so an automatic refresh can re-read
   * it without the watcher subscription having to resubscribe on every render.
   */
  const diffViewRef = useRef<DiffView | null>(null)
  useEffect(() => {
    diffViewRef.current = diffView
  }, [diffView])

  /**
   * Re-reads the working-tree diff already on screen. Unlike `handleShowDiff`
   * this doesn't activate the panel, reset the selection, or raise an error
   * toast — it runs unprompted, and the file may well have just been deleted.
   */
  async function reloadShownDiff(): Promise<void> {
    const view = diffViewRef.current
    if (!repoPath || !view || view.file === undefined) {
      return
    }
    const result = await window.api.diff(
      repoPath,
      view.file,
      view.staged === true,
      view.untracked === true
    )
    if (!result.ok) {
      return
    }
    setDiffView((current) =>
      current && current.file === view.file ? { ...current, text: result.text } : current
    )
  }

  // One refresh at a time: a burst of disk changes must not fan out into
  // overlapping git spawns, so a change arriving mid-refresh is remembered and
  // replayed once (coalesced, 'refs' winning) instead of queueing up.
  const refreshBusy = useRef(false)
  const refreshQueued = useRef<RepoChangeKind | null>(null)

  /** Reloads whatever a disk change invalidated. */
  async function refreshFromDisk(kind: RepoChangeKind): Promise<void> {
    if (!repoPath) {
      return
    }
    if (refreshBusy.current) {
      refreshQueued.current = refreshQueued.current === 'refs' ? 'refs' : kind
      return
    }
    refreshBusy.current = true
    try {
      if (kind === 'refs') {
        await loadLog(repoPath)
      } else {
        await loadStatus(repoPath)
      }
      await reloadShownDiff()
    } finally {
      refreshBusy.current = false
    }
    const queued = refreshQueued.current
    refreshQueued.current = null
    if (queued !== null) {
      await refreshFromDisk(queued)
    }
  }

  async function loadLog(path: string): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getLog(path)
      if (result.ok) {
        setRepoPath(result.root)
        setCommits(result.commits)
        setHasMoreCommits(result.hasMore)
        setRemotes(result.remotes)
        // These reads are independent of each other — run them concurrently so
        // a refresh (e.g. after fetch/pull) isn't a chain of sequential git
        // spawns.
        const [, branchResult, ab, state, repos] = await Promise.all([
          loadStatus(result.root),
          window.api.listBranches(result.root),
          window.api.aheadBehind(result.root),
          window.api.conflictState(result.root),
          window.api.addRepo(result.root)
        ])
        if (branchResult.ok) {
          setBranches(branchResult.branches)
          setCurrentBranch(branchResult.current)
          const map: Record<string, string> = {}
          for (const entry of branchResult.info) {
            map[entry.name] = entry.lastCommit
          }
          setBranchInfo(map)
        }
        setAhead(ab.ahead)
        setBehind(ab.behind)
        // Detect a repo left mid-merge/rebase/revert so the badge shows up
        // even when we didn't start the operation this session.
        setConflictKind(state)
        if (state) {
          const conflicts = await window.api.listConflicts(result.root)
          setConflictCount(conflicts.ok ? conflicts.files.length : 0)
        } else {
          setShowConflict(false)
          setConflictCount(0)
        }
        setRepos(repos)
        window.api.setCurrentRepo(result.root)
      } else {
        setError(result.error)
        setCommits([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCommits([])
    } finally {
      setLoading(false)
    }
  }

  /** Appends the next page of commits when scrolling near the bottom. */
  async function loadMoreCommits(): Promise<void> {
    if (!repoPath || !hasMoreCommits || loadingMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await window.api.getLog(repoPath, 150, commits.length)
      if (result.ok) {
        // Guard against races (e.g. a repo switch mid-flight).
        setCommits((current) =>
          current.length === commits.length ? [...current, ...result.commits] : current
        )
        setHasMoreCommits(result.hasMore)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleOpen(): Promise<void> {
    const path = await window.api.openRepo()
    if (!path) {
      return
    }
    setRepoPath(path)
    await loadLog(path)
  }

  async function handleCheckout(target: string | null): Promise<void> {
    if (!repoPath || !target) {
      return
    }
    setError(null)
    setInfo(null)
    // Checkout is deliberately NOT on the undo stack: undo uses reset, which
    // would rewrite the now-current branch instead of switching back.
    const result = await window.api.checkout(repoPath, target)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
  }

  async function refreshConflictCount(): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.listConflicts(repoPath)
    setConflictCount(result.ok ? result.files.length : 0)
  }

  /** Enters conflict mode: records the kind, counts files, opens the resolver. */
  async function enterConflict(
    kind: 'merge' | 'rebase' | 'revert' | 'cherry-pick'
  ): Promise<void> {
    setConflictKind(kind)
    setShowConflict(true)
    await refreshConflictCount()
  }

  async function doMerge(source: string, target: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.merge(repoPath, source, target)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('merge', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('merge')
      }
    }
  }

  async function doRebase(source: string, target: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.rebase(repoPath, source, target)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('rebase', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('rebase')
      }
    }
  }

  /** Opens the interactive-rebase editor for the commits above `baseHash`. */
  function openInteractiveRebase(baseHash: string): void {
    const byHash = new Map(commits.map((commit) => [commit.hash, commit]))
    const head = commits.find((commit) =>
      commit.refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD ->'))
    )
    if (!head) {
      setError('Interactive rebase needs a checked-out branch (HEAD).')
      return
    }
    const chain: Commit[] = []
    let cur: Commit | undefined = head
    while (cur && cur.hash !== baseHash) {
      chain.push(cur)
      const parent: string | undefined = cur.parents[0]
      cur = parent ? byHash.get(parent) : undefined
    }
    if (!cur || cur.hash !== baseHash) {
      setError('That commit is not an ancestor of HEAD on the current branch.')
      return
    }
    if (chain.length === 0) {
      setError('No commits above that one to rebase.')
      return
    }
    chain.reverse()
    setRebaseRows(
      chain.map((commit) => ({
        hash: commit.hash,
        subject: commit.subject,
        action: 'pick' as const
      }))
    )
    setRebaseBase(baseHash)
  }

  async function doInteractiveRebase(rows: RebaseRow[]): Promise<void> {
    const base = rebaseBase
    setRebaseBase(null)
    if (!repoPath || !base) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.interactiveRebase(
      repoPath,
      base,
      rows.map((row) => ({ action: row.action, hash: row.hash, message: row.message }))
    )
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('interactive rebase', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('rebase')
      }
    }
  }

  /** Drag-to-reorder in the graph: move `draggedHash` to `targetHash`'s slot. */
  function handleReorderCommit(draggedHash: string, targetHash: string): void {
    if (draggedHash === targetHash) {
      return
    }
    const byHash = new Map(commits.map((commit) => [commit.hash, commit]))
    const head = commits.find((commit) =>
      commit.refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD ->'))
    )
    if (!head) {
      setError('Reordering needs a checked-out branch (HEAD).')
      return
    }
    // Walk the first-parent chain from HEAD until both commits are found.
    const chain: Commit[] = []
    let cur: Commit | undefined = head
    let foundDragged = false
    let foundTarget = false
    while (cur) {
      if (cur.parents.length > 1 && !(foundDragged && foundTarget)) {
        setError('Cannot reorder across a merge commit.')
        return
      }
      chain.push(cur)
      if (cur.hash === draggedHash) {
        foundDragged = true
      }
      if (cur.hash === targetHash) {
        foundTarget = true
      }
      if (foundDragged && foundTarget) {
        break
      }
      const parent: string | undefined = cur.parents[0]
      cur = parent ? byHash.get(parent) : undefined
    }
    if (!foundDragged || !foundTarget) {
      setError('Can only reorder commits on the current branch.')
      return
    }
    const deepest = chain[chain.length - 1]
    const base = deepest.parents[0]
    if (!base) {
      setError('Cannot reorder the root commit.')
      return
    }
    // Reorder in display order (chain is newest-first) so the drop matches what
    // the user sees, then reverse to the oldest-first rebase todo.
    const reordered = [...chain]
    const draggedIndex = reordered.findIndex((commit) => commit.hash === draggedHash)
    const [moved] = reordered.splice(draggedIndex, 1)
    const targetIndex = reordered.findIndex((commit) => commit.hash === targetHash)
    reordered.splice(targetIndex, 0, moved)
    const rows: RebaseRow[] = [...reordered].reverse().map((commit) => ({
      hash: commit.hash,
      subject: commit.subject,
      action: 'pick' as const
    }))
    setConfirm({
      message: `Reorder ${rows.length} commit(s): move ${draggedHash.slice(0, 7)} to ${targetHash.slice(0, 7)}'s position? This rewrites history (undoable).`,
      action: () => {
        void runReorder(base, rows)
      }
    })
  }

  async function runReorder(base: string, rows: RebaseRow[]): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.interactiveRebase(
      repoPath,
      base,
      rows.map((row) => ({ action: row.action, hash: row.hash }))
    )
    await loadLog(repoPath)
    if (result.ok) {
      setInfo('Reordered commits')
      setConflictKind(null)
      pushUndo('reorder', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('rebase')
      }
    }
  }

  /** HEAD before a history-moving op, so undo can restore it. */
  async function captureHead(): Promise<string | null> {
    if (!repoPath) {
      return null
    }
    return window.api.getHead(repoPath)
  }

  function pushUndo(label: string, sha: string | null): void {
    if (!sha) {
      return
    }
    setUndoStack((stack) => [...stack, { label, sha }])
    setRedoStack([])
  }

  async function doUndo(): Promise<void> {
    if (!repoPath || undoStack.length === 0) {
      return
    }
    const entry = undoStack[undoStack.length - 1]
    const current = await window.api.getHead(repoPath)
    // --mixed: move HEAD + index but never touch the working tree, so undoing
    // a commit surfaces its changes back in Changes and no edits are lost.
    const result = await window.api.resetTo(repoPath, entry.sha, 'mixed')
    if (!result.ok) {
      setError(result.error)
      return
    }
    setUndoStack((stack) => stack.slice(0, -1))
    if (current) {
      setRedoStack((stack) => [...stack, { label: entry.label, sha: current }])
    }
    setError(null)
    setInfo(`Undid ${entry.label}`)
    await loadLog(repoPath)
  }

  async function doRedo(): Promise<void> {
    if (!repoPath || redoStack.length === 0) {
      return
    }
    const entry = redoStack[redoStack.length - 1]
    const current = await window.api.getHead(repoPath)
    const result = await window.api.resetTo(repoPath, entry.sha, 'mixed')
    if (!result.ok) {
      setError(result.error)
      return
    }
    setRedoStack((stack) => stack.slice(0, -1))
    if (current) {
      setUndoStack((stack) => [...stack, { label: entry.label, sha: current }])
    }
    setError(null)
    setInfo(`Redid ${entry.label}`)
    await loadLog(repoPath)
  }

  async function openFileHistory(file: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    const result = await window.api.fileHistory(repoPath, file)
    if (result.ok) {
      setFileHistoryView({ file, commits: result.commits })
    } else {
      setError(result.error)
    }
  }

  async function openBlame(file: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    const result = await window.api.blame(repoPath, file)
    if (result.ok) {
      setBlameView({ file, lines: result.lines })
    } else {
      setError(result.error)
    }
  }

  async function doRevert(hash: string, noCommit: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.revert(repoPath, hash, noCommit)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      if (!noCommit) {
        pushUndo('revert', before)
      }
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('revert')
      }
    }
  }

  async function doCherryPick(hash: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.cherryPick(repoPath, hash)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('cherry-pick', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('cherry-pick')
      }
    }
  }

  async function doReset(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.resetTo(repoPath, hash, mode)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    pushUndo('reset', before)
    await loadLog(repoPath)
  }

  async function doUndoLastCommit(): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.undoLastCommit(repoPath)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    pushUndo('undo last commit', before)
    await loadLog(repoPath)
  }

  function requestReset(hash: string, mode: 'soft' | 'mixed' | 'hard'): void {
    setConfirm({
      message: `Reset current branch to ${hash.slice(0, 7)} (${mode})?${
        mode === 'hard' ? ' Uncommitted changes will be lost.' : ''
      }`,
      action: () => {
        void doReset(hash, mode)
      }
    })
  }

  async function handleAbort(): Promise<void> {
    if (!repoPath) {
      return
    }
    let result
    if (conflictKind === 'rebase') {
      result = await window.api.rebaseAbort(repoPath)
    } else if (conflictKind === 'revert') {
      result = await window.api.revertAbort(repoPath)
    } else if (conflictKind === 'cherry-pick') {
      result = await window.api.cherryPickAbort(repoPath)
    } else {
      result = await window.api.mergeAbort(repoPath)
    }
    if (result.ok) {
      setInfo(result.message)
      setError(null)
      setConflictKind(null)
      setShowConflict(false)
      setConflictCount(0)
    } else {
      setError(result.error)
    }
    await loadLog(repoPath)
  }

  async function handleConflictResolved(): Promise<void> {
    if (!repoPath) {
      return
    }
    setConflictKind(null)
    setShowConflict(false)
    setConflictCount(0)
    setError(null)
    setInfo('Conflicts resolved')
    await loadLog(repoPath)
  }

  async function runRemoteOp(
    op: (
      path: string
    ) => Promise<{ ok: boolean } & ({ message: string } | { error: string })>
  ): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await op(repoPath)
    await loadLog(repoPath)
    if (result.ok && 'message' in result) {
      setInfo(result.message)
    } else if (!result.ok && 'error' in result) {
      setError(result.error)
    }
  }

  async function handleFetch(): Promise<void> {
    await runRemoteOp((path) => window.api.fetch(path))
    setLastFetched(new Date())
  }

  async function handlePull(): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.pull(repoPath)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      return
    }
    // A fast-forward pull fails when local history has diverged from the
    // upstream. The fetch still ran, so ahead/behind is now accurate — if both
    // sides have commits, offer to rebase or merge instead of a dead end.
    const ab = await window.api.aheadBehind(repoPath)
    if (ab.ahead > 0 && ab.behind > 0) {
      setDivergePull(ab)
      return
    }
    setError(result.error)
  }

  async function doPullRebase(): Promise<void> {
    if (!repoPath) {
      return
    }
    setDivergePull(null)
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.pullRebase(repoPath)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('pull --rebase', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('rebase')
      }
    }
  }

  async function doPullMerge(): Promise<void> {
    if (!repoPath) {
      return
    }
    setDivergePull(null)
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.pullMerge(repoPath)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
      pushUndo('pull --merge', before)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('merge')
      }
    }
  }

  function handlePush(): Promise<void> {
    return runRemoteOp((path) => window.api.push(path))
  }

  function requestStash(files: string[] | null): void {
    setStashRequest({ files })
    setStashName('')
  }

  function handleStash(): void {
    requestStash(null)
  }

  async function confirmStash(): Promise<void> {
    if (!repoPath || !stashRequest) {
      return
    }
    const request = stashRequest
    const name = stashName.trim()
    setStashRequest(null)
    setError(null)
    setInfo(null)
    const result = request.files
      ? await window.api.stashFiles(repoPath, request.files, name)
      : await window.api.stashPush(repoPath, name)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    if (!request.files) {
      setCommitSummary('')
      setCommitDescription('')
    }
    await loadLog(repoPath)
  }

  async function handlePopStash(ref: string): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    const result = await window.api.stashPop(repoPath, ref)
    await loadLog(repoPath)
    if (!result.ok) {
      setError(result.error)
    } else {
      setInfo(result.message)
    }
  }

  async function handleDropStash(ref: string): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.stashDrop(repoPath, ref)
    await loadLog(repoPath)
    if (!result.ok) {
      setError(result.error)
    } else {
      setInfo(result.message)
    }
  }

  async function handleStage(file: string): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.stage(repoPath, file)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff([file], true)
  }

  async function handleUnstage(file: string): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.unstage(repoPath, file)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff([file], false)
  }

  async function handleStageAll(): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.stageAll(repoPath)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff(null, true)
  }

  async function handleUnstageAll(): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.unstageAll(repoPath)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff(null, false)
  }

  async function handleStageMany(files: string[]): Promise<void> {
    if (!repoPath || files.length === 0) {
      return
    }
    const result = await window.api.stageFiles(repoPath, files)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff(files, true)
  }

  async function handleUnstageMany(files: string[]): Promise<void> {
    if (!repoPath || files.length === 0) {
      return
    }
    const result = await window.api.unstageFiles(repoPath, files)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    await refreshShownDiff(files, false)
  }

  /**
   * Re-fetches the diff currently shown in the Diff panel after a staging
   * change, so it follows the file to its new (staged/unstaged) scope instead
   * of showing a stale diff with the wrong Stage/Unstage buttons. `files = null`
   * means "any shown working-tree file" (used by stage-all / unstage-all).
   */
  async function refreshShownDiff(
    files: string[] | null,
    nowStaged: boolean
  ): Promise<void> {
    const shown = diffView?.file
    if (!shown) {
      return
    }
    if (files !== null && !files.includes(shown)) {
      return
    }
    await handleShowDiff(shown, nowStaged)
  }

  function handleStashMany(files: string[]): void {
    if (files.length === 0) {
      return
    }
    requestStash(files)
  }

  function handleDiscardMany(files: string[]): void {
    if (!repoPath || files.length === 0) {
      return
    }
    setConfirm({
      message: `Discard changes in ${files.length} files? This cannot be undone.`,
      action: () => {
        void (async () => {
          const tracked: string[] = []
          const untracked: string[] = []
          for (const file of files) {
            const change = changes.find((entry) => entry.path === file)
            if (change && change.worktree === '?') {
              untracked.push(file)
            } else {
              tracked.push(file)
            }
          }
          setError(null)
          setInfo(null)
          const result = await window.api.discardFiles(repoPath, tracked, untracked)
          if (!result.ok) {
            setError(result.error)
          } else {
            setInfo(result.message)
          }
          await loadStatus(repoPath)
        })()
      }
    })
  }

  function handleAddToGitignore(files: string[]): void {
    if (!repoPath || files.length === 0) {
      return
    }
    void (async () => {
      const tracked: string[] = []
      const untracked: string[] = []
      for (const file of files) {
        const change = changes.find((entry) => entry.path === file)
        if (change && change.worktree === '?') {
          untracked.push(file)
        } else {
          tracked.push(file)
        }
      }
      setError(null)
      setInfo(null)
      const result = await window.api.addToGitignore(repoPath, tracked, untracked)
      if (!result.ok) {
        setError(result.error)
      } else {
        setInfo(result.message)
      }
      await loadStatus(repoPath)
    })()
  }

  async function handleCommit(): Promise<void> {
    const summary = commitSummary.trim()
    if (!repoPath || summary.length === 0) {
      return
    }
    const description = commitDescription.trim()
    const trailers = commitCoauthors
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `Co-authored-by: ${line}`)
      .join('\n')
    let message = summary
    if (description.length > 0) {
      message += `\n\n${description}`
    }
    if (trailers.length > 0) {
      message += `\n\n${trailers}`
    }
    setError(null)
    setInfo(null)
    const before = await captureHead()
    const result = await window.api.commit(repoPath, message, commitSign)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    setCommitSummary('')
    setCommitDescription('')
    setCommitCoauthors('')
    pushUndo('commit', before)
    await loadLog(repoPath)
  }

  async function handleShowDiff(file: string, staged: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    const change = changes.find((entry) => entry.path === file)
    const untracked = change ? change.worktree === '?' : false
    const result = await window.api.diff(repoPath, file, staged, untracked)
    if (result.ok) {
      setDiffView({
        title: file,
        subtitle: staged ? 'staged' : untracked ? 'untracked (new file)' : 'unstaged',
        text: result.text,
        file,
        staged,
        untracked
      })
      setSelectedDiffFile(null)
      showPanel('diff', 'Diff')
    } else {
      setError(result.error)
    }
  }

  /** Stages or unstages a single hunk by applying its reconstructed patch. */
  async function handleStageHunk(
    file: string,
    staged: boolean,
    patch: string
  ): Promise<void> {
    if (!repoPath) {
      return
    }
    // Staged diffs are unstaged (reverse); unstaged diffs are staged.
    const result = await window.api.applyPatch(repoPath, patch, staged)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
    // Refresh the same diff so the applied hunk disappears from the view.
    await handleShowDiff(file, staged)
  }

  async function handleCheckoutPr(number: number): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.checkoutPullRequest(repoPath, number)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
  }

  async function handleShowCommit(hash: string, subject: string): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.showCommit(repoPath, hash)
    if (result.ok) {
      setDiffView({
        title: `${hash.slice(0, 7)} ${subject}`,
        subtitle: 'commit',
        text: result.text
      })
      setSelectedDiffFile(null)
      showPanel('files', 'Files')
      showPanel('diff', 'Diff')
    } else {
      setError(result.error)
    }
  }

  async function handleRemoveRepo(path: string): Promise<void> {
    setRepos(await window.api.removeRepo(path))
  }

  async function handleReorderRepos(
    items: { path: string; group: string }[]
  ): Promise<void> {
    setRepos(await window.api.setReposLayout(items))
  }

  /** Switches to a repo, but first verifies the folder still exists on disk. */
  async function handleSwitchRepo(path: string): Promise<void> {
    const exists = await window.api.repoExists(path)
    if (!exists) {
      setMissingRepo(path)
      return
    }
    await loadLog(path)
  }

  /** Lets the user point a missing repo entry at its new location on disk. */
  async function relocateMissingRepo(): Promise<void> {
    const oldPath = missingRepo
    if (!oldPath) {
      return
    }
    const newPath = await window.api.openRepo()
    if (!newPath) {
      return
    }
    await window.api.removeRepo(oldPath)
    setRepos(await window.api.addRepo(newPath))
    setMissingRepo(null)
    await loadLog(newPath)
  }

  async function removeMissingRepo(): Promise<void> {
    if (!missingRepo) {
      return
    }
    setRepos(await window.api.removeRepo(missingRepo))
    setMissingRepo(null)
  }

  function openGroupModal(repo: RepoEntry): void {
    setGroupModalRepo(repo)
    setGroupInput(repo.group)
  }

  async function saveGroup(): Promise<void> {
    if (!groupModalRepo) {
      return
    }
    setRepos(await window.api.setRepoGroup(groupModalRepo.path, groupInput))
    setGroupModalRepo(null)
  }

  function openRenameGroup(oldName: string): void {
    setGroupRenameOld(oldName)
    setGroupRenameInput(oldName)
  }

  async function saveGroupRename(): Promise<void> {
    if (groupRenameOld === null) {
      return
    }
    setRepos(await window.api.renameRepoGroup(groupRenameOld, groupRenameInput))
    setGroupRenameOld(null)
  }

  function openCloneModal(): void {
    setCloneOpen(true)
    setCloneUrl('')
    setCloneFilter('')
    setGithubError(null)
    setGithubLoading(true)
    window.api.listGithubRepos().then((result) => {
      if (result.ok) {
        setGithubRepos(result.repos)
      } else {
        setGithubRepos([])
        setGithubError(result.error)
      }
      setGithubLoading(false)
    })
  }

  async function cloneFrom(url: string): Promise<void> {
    const trimmed = url.trim()
    if (trimmed.length === 0) {
      return
    }
    const parentDir = await window.api.openRepo()
    if (!parentDir) {
      return
    }
    setCloneOpen(false)
    setCloneUrl('')
    setError(null)
    setInfo(null)
    const result = await window.api.clone(trimmed, parentDir)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(`Cloned into ${result.path}`)
    await loadLog(result.path)
  }

  function openNewBranchModal(startPoint: string | null): void {
    setNewBranchStart(startPoint)
    setNewBranchName('')
    setNewBranchOpen(true)
  }

  async function handleCreateBranch(): Promise<void> {
    const name = newBranchName.trim()
    if (!repoPath || name.length === 0) {
      return
    }
    const startPoint = newBranchStart
    setNewBranchOpen(false)
    setNewBranchName('')
    setNewBranchStart(null)
    setError(null)
    setInfo(null)
    const result = await window.api.createBranch(repoPath, name, startPoint ?? undefined)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
  }

  function openRenameModal(name: string): void {
    setRenameTarget(name)
    setRenameInput(name)
  }

  async function saveRename(): Promise<void> {
    const newName = renameInput.trim()
    if (!repoPath || !renameTarget || newName.length === 0) {
      return
    }
    const oldName = renameTarget
    setRenameTarget(null)
    setError(null)
    setInfo(null)
    const result = await window.api.renameBranch(repoPath, oldName, newName)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
  }

  function requestDeleteBranch(name: string): void {
    setConfirm({
      message: `Delete branch "${name}"?`,
      action: () => {
        void doDeleteBranch(name)
      }
    })
  }

  async function doDeleteBranch(
    name: string,
    force = false,
    alsoRemote: { remote: string; branch: string } | null = null
  ): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.deleteBranch(repoPath, name, force)
    if (!result.ok) {
      // Offer a force delete when the branch is not fully merged.
      if (!force && /not fully merged/i.test(result.error)) {
        setConfirm({
          message: `Branch "${name}" is not fully merged. Force delete? Unmerged commits will be lost.`,
          action: () => {
            void doDeleteBranch(name, true, alsoRemote)
          }
        })
        return
      }
      setError(result.error)
      return
    }
    if (alsoRemote) {
      // The user already confirmed deleting everywhere; chain the remote delete.
      await runDeleteRemoteBranch(alsoRemote.remote, alsoRemote.branch, result.message)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
  }

  async function runDeleteRemoteBranch(
    remote: string,
    branch: string,
    prefixMessage?: string
  ): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    const result = await window.api.deleteRemoteBranch(repoPath, remote, branch)
    if (!result.ok) {
      setError(result.error)
      await loadLog(repoPath)
      return
    }
    setInfo(prefixMessage ? `${prefixMessage} · ${result.message}` : result.message)
    await loadLog(repoPath)
  }

  function requestDeleteRemoteBranch(remote: string, branch: string): void {
    setConfirm({
      message: `Delete branch "${branch}" on remote "${remote}"? This affects everyone using that remote.`,
      action: () => {
        void runDeleteRemoteBranch(remote, branch)
      }
    })
  }

  async function requestDeleteBranchEverywhere(name: string): Promise<void> {
    if (!repoPath) {
      return
    }
    const upstreamResult = await window.api.getUpstream(repoPath, name)
    if (!upstreamResult.ok) {
      setError(upstreamResult.error)
      return
    }
    const upstream = upstreamResult.upstream
    if (!upstream) {
      setConfirm({
        message: `Branch "${name}" has no upstream on a remote. Delete the local branch only?`,
        action: () => {
          void doDeleteBranch(name)
        }
      })
      return
    }
    setConfirm({
      message: `Delete branch "${name}" locally and "${upstream.branch}" on remote "${upstream.remote}"?`,
      action: () => {
        void doDeleteBranch(name, false, upstream)
      }
    })
  }

  function requestDiscard(file: string, untracked: boolean): void {
    setConfirm({
      message: `Discard changes in "${file}"? This cannot be undone.`,
      action: () => {
        void doDiscard(file, untracked)
      }
    })
  }

  async function doDiscard(file: string, untracked: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    const result = await window.api.discardFile(repoPath, file, untracked)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await loadStatus(repoPath)
  }

  const loomValue: LoomContextValue = {
    commits,
    onLoadMore: () => void loadMoreCommits(),
    remotes,
    repoPath,
    selected,
    setSelected,
    onCheckout: handleCheckout,
    onShowCommit: handleShowCommit,
    onRevert: doRevert,
    onCherryPick: doCherryPick,
    onResetTo: requestReset,
    onInteractiveRebase: openInteractiveRebase,
    onReorderCommit: handleReorderCommit,
    onCheckoutPr: handleCheckoutPr,
    dragSource,
    setDragSource,
    dragOver,
    setDragOver,
    onMerge: doMerge,
    onRebase: doRebase,
    openContextMenu: (x, y, items) => setContextMenu({ x, y, items }),
    onRenameBranch: openRenameModal,
    onDeleteBranch: requestDeleteBranch,
    onDeleteRemoteBranch: requestDeleteRemoteBranch,
    onDeleteBranchEverywhere: requestDeleteBranchEverywhere,
    onNewBranchFrom: openNewBranchModal,
    changes,
    stashes,
    commitSummary,
    setCommitSummary,
    commitDescription,
    setCommitDescription,
    commitCoauthors,
    setCommitCoauthors,
    commitSign,
    setCommitSign: (value: boolean) => {
      setCommitSign(value)
      localStorage.setItem('loom.signCommits', String(value))
    },
    onStage: handleStage,
    onUnstage: handleUnstage,
    onStageAll: handleStageAll,
    onUnstageAll: handleUnstageAll,
    onCommit: handleCommit,
    onShowDiff: handleShowDiff,
    onStageHunk: handleStageHunk,
    onFileHistory: (file) => void openFileHistory(file),
    onBlame: (file) => void openBlame(file),
    onStash: handleStash,
    onPopStash: handlePopStash,
    onDropStash: handleDropStash,
    onDiscard: requestDiscard,
    onStageMany: handleStageMany,
    onUnstageMany: handleUnstageMany,
    onDiscardMany: handleDiscardMany,
    onAddToGitignore: handleAddToGitignore,
    onStashMany: handleStashMany,
    diffView,
    selectedDiffFile,
    setSelectedDiffFile,
    repos,
    onSwitchRepo: (path) => void handleSwitchRepo(path),
    onAddExistingRepo: handleOpen,
    onCloneRepo: openCloneModal,
    onRemoveRepo: handleRemoveRepo,
    onSetRepoGroup: openGroupModal,
    onRenameRepoGroup: openRenameGroup,
    onReorderRepos: (items) => void handleReorderRepos(items),
    activity,
    onClearActivity: () => setActivity([])
  }

  return (
    <div className="app">
      <header className="toolbar">
        {/* Frameless window: this row is the title bar, so it introduces the app
            the way Jot and Nib do - mark, wordmark, version - and carries the
            window buttons at the far end. */}
        <div className="brand">
          <LoomMark />
          <span className="wordmark">Loom</span>
          {appVersion && <span className="version">v{appVersion}</span>}
        </div>
        <RepoSwitcher
          repos={repos}
          currentPath={repoPath}
          onSwitch={(path) => handleSwitchRepo(path)}
          onAddExisting={handleOpen}
          onClone={openCloneModal}
          onRemove={handleRemoveRepo}
          onSetGroup={openGroupModal}
          onRenameGroup={openRenameGroup}
          onReorder={(items) => void handleReorderRepos(items)}
          openContextMenu={(x, y, items) => setContextMenu({ x, y, items })}
        />
        {repoPath && (
          <>
            <BranchSwitcher
              current={currentBranch}
              branches={branches}
              info={branchInfo}
              onCheckout={(name) => handleCheckout(name)}
              onMerge={(name) => doMerge(name, currentBranch)}
              onNewBranch={() => openNewBranchModal(null)}
              onCleanup={() => setShowCleanup(true)}
            />
            <div className="toolbar-group">
              <button className="secondary" onClick={handleFetch}>
                Fetch
              </button>
              <button
                className="secondary"
                onClick={handlePull}
                title={behind > 0 ? `${behind} commit(s) behind` : 'Pull'}
              >
                Pull
                {behind > 0 && <span className="badge-count">{behind}</span>}
              </button>
              <button
                className="secondary"
                onClick={handlePush}
                title={ahead > 0 ? `${ahead} commit(s) ahead` : 'Push'}
              >
                Push
                {ahead > 0 && <span className="badge-count">{ahead}</span>}
              </button>
            </div>
            <div className="toolbar-group">
              <button
                className="secondary"
                disabled={undoStack.length === 0}
                title={
                  undoStack.length > 0
                    ? `Undo ${undoStack[undoStack.length - 1].label}`
                    : 'Nothing to undo'
                }
                onClick={() => void doUndo()}
              >
                ↶
              </button>
              <button
                className="secondary"
                disabled={redoStack.length === 0}
                title={
                  redoStack.length > 0
                    ? `Redo ${redoStack[redoStack.length - 1].label}`
                    : 'Nothing to redo'
                }
                onClick={() => void doRedo()}
              >
                ↷
              </button>
            </div>
          </>
        )}
        {conflictKind && (
          <button
            className="conflict-toolbar-btn"
            onClick={() => setShowConflict(true)}
            title={`Resolve ${conflictKind} conflicts`}
          >
            ⚠ Resolve conflicts
            {conflictCount > 0 && <span className="badge-count">{conflictCount}</span>}
          </button>
        )}

        <span className="toolbar-spacer" />

        {lastFetched && (
          <span className="repo-path">
            Fetched{' '}
            {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          className="secondary"
          title="Show / hide panels"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const isOpen = (id: string): boolean => !!dockApi.current?.getPanel(id)
            setContextMenu({
              x: rect.left,
              y: rect.bottom + 4,
              items: [
                {
                  label: 'Repositories',
                  checked: isOpen('repos'),
                  onClick: () => showPanel('repos', 'Repositories')
                },
                {
                  label: 'History',
                  checked: isOpen('graph'),
                  onClick: () => showPanel('graph', 'History')
                },
                {
                  label: 'Changes',
                  checked: isOpen('changes'),
                  onClick: () => showPanel('changes', 'Changes')
                },
                {
                  label: 'Files',
                  checked: isOpen('files'),
                  onClick: () => showPanel('files', 'Files')
                },
                {
                  label: 'Diff',
                  checked: isOpen('diff'),
                  onClick: () => showPanel('diff', 'Diff')
                },
                {
                  label: 'Pull requests',
                  checked: isOpen('pr'),
                  onClick: () => showPanel('pr', 'Pull requests')
                },
                {
                  label: 'Command history',
                  checked: isOpen('log'),
                  onClick: () => showPanel('log', 'Command history')
                }
              ]
            })
          }}
        >
          View
        </button>
        <button
          className="secondary"
          title="More"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const items: ContextMenuItem[] = []
            if (repoPath) {
              items.push({ label: 'Refresh', onClick: () => loadLog(repoPath) })
              items.push({
                label: 'Undo last commit (keep changes)',
                onClick: () => void doUndoLastCommit()
              })
              items.push({
                label: 'Open in file explorer',
                onClick: () => window.api.revealRepo(repoPath)
              })
              items.push({
                label: 'Open in VS Code',
                onClick: () => window.api.openInEditor(repoPath)
              })
              items.push({
                label: 'View on GitHub',
                onClick: () => {
                  window.api.openRepoOnGitHub(repoPath).then((url) => {
                    if (!url) {
                      setError("This repository has no 'origin' remote to open.")
                    }
                  })
                }
              })
            }
            items.push({ label: 'Layouts…', onClick: () => setLayoutsOpen(true) })
            items.push({ label: 'Reset layout', onClick: resetLayout })
            setContextMenu({ x: rect.right - 180, y: rect.bottom + 4, items })
          }}
        >
          ⋯
        </button>
        <div className="window-controls">
          <button type="button" onClick={() => window.api.minimizeWindow()} title="Minimise">
            –
          </button>
          <button
            type="button"
            onClick={() => window.api.toggleMaximizeWindow()}
            title="Maximise"
          >
            □
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => window.api.closeWindow()}
            title="Close"
          >
            ×
          </button>
        </div>
      </header>

      <LoomContext.Provider value={loomValue}>
        <div className="workspace">
          <DockviewReact
            className="dockview"
            theme={themeDark}
            components={DOCK_COMPONENTS}
            onReady={handleReady}
          />
        </div>
      </LoomContext.Provider>

      <div className="toast-stack">
      {updateVersion && (
        <div className="toast toast-update" role="alert">
          <span className="toast-icon">↑</span>
          <div className="toast-body">
            <div className="toast-title">Update ready</div>
            <div className="toast-message">
              Loom {updateVersion} has been downloaded.
            </div>
            <button
              className="toast-action"
              onClick={() => void window.api.installUpdate()}
            >
              Restart & update
            </button>
          </div>
          <button
            className="toast-close"
            title="Later"
            onClick={() => setUpdateVersion(null)}
          >
            ×
          </button>
        </div>
      )}

      {(error || info) && (
        <div className={`toast ${error ? 'toast-error' : 'toast-info'}`} role="alert">
          <span className="toast-icon">{error ? '⚠' : '✓'}</span>
          <div className="toast-body">
            <div className="toast-title">{error ? 'Something went wrong' : 'Done'}</div>
            <div className="toast-message">{error || info}</div>
          </div>
          <button
            className="toast-close"
            title="Dismiss"
            onClick={() => {
              setError(null)
              setInfo(null)
            }}
          >
            ×
          </button>
        </div>
      )}
      </div>

      {loading && <div className="loading-tag">Loading…</div>}

      {groupModalRepo && (
        <div className="modal-backdrop" onClick={() => setGroupModalRepo(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Group for <strong>{groupModalRepo.name}</strong>
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="Group name (empty = ungrouped)"
              value={groupInput}
              autoFocus
              onChange={(event) => setGroupInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveGroup()
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={saveGroup}>Save</button>
              <button className="secondary" onClick={() => setGroupModalRepo(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {groupRenameOld !== null && (
        <div className="modal-backdrop" onClick={() => setGroupRenameOld(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Rename group <strong>{groupRenameOld}</strong>
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="New group name (empty = ungroup)"
              value={groupRenameInput}
              autoFocus
              onChange={(event) => setGroupRenameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveGroupRename()
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={saveGroupRename}>Rename</button>
              <button className="secondary" onClick={() => setGroupRenameOld(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {cloneOpen && (
        <div className="modal-backdrop" onClick={() => setCloneOpen(false)}>
          <div className="modal clone-modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">Clone a repository</p>

            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="Filter your GitHub repositories"
              value={cloneFilter}
              autoFocus
              onChange={(event) => setCloneFilter(event.target.value)}
            />

            <div className="clone-list">
              {githubLoading && <div className="empty">Loading from GitHub…</div>}
              {githubError && <div className="error">{githubError}</div>}
              {!githubLoading &&
                !githubError &&
                githubRepos
                  .filter((repo) => {
                    const needle = cloneFilter.trim().toLowerCase()
                    return (
                      needle.length === 0 ||
                      repo.fullName.toLowerCase().includes(needle)
                    )
                  })
                  .slice(0, 200)
                  .map((repo) => (
                    <div
                      key={repo.fullName}
                      className="clone-item"
                      title={`Clone ${repo.fullName}`}
                      onClick={() => cloneFrom(repo.cloneUrl)}
                    >
                      <div className="clone-row1">
                        <span className="clone-name">
                          <span className="clone-owner">{repo.owner}/</span>
                          {repo.name}
                        </span>
                        {repo.private && <span className="clone-private">Private</span>}
                      </div>
                      {repo.description && (
                        <div className="clone-desc">{repo.description}</div>
                      )}
                    </div>
                  ))}
              {!githubLoading && !githubError && githubRepos.length === 0 && (
                <div className="empty">No repositories found.</div>
              )}
            </div>

            <p className="modal-hint">…or paste a URL:</p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="https://github.com/org/repo.git"
              value={cloneUrl}
              onChange={(event) => setCloneUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && cloneUrl.trim().length > 0) {
                  event.preventDefault()
                  cloneFrom(cloneUrl)
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={() => cloneFrom(cloneUrl)}>Choose folder & clone</button>
              <button className="secondary" onClick={() => setCloneOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {newBranchOpen && (
        <div className="modal-backdrop" onClick={() => setNewBranchOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">New branch</p>
            <p className="modal-hint">
              {newBranchStart
                ? `Created from ${newBranchStart.slice(0, 7)} and checked out.`
                : 'Created from the current HEAD and checked out.'}
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="branch-name"
              value={newBranchName}
              autoFocus
              onChange={(event) => setNewBranchName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleCreateBranch()
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={handleCreateBranch}>Create</button>
              <button className="secondary" onClick={() => setNewBranchOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Rename branch <strong>{renameTarget}</strong>
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="new-name"
              value={renameInput}
              autoFocus
              onChange={(event) => setRenameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveRename()
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={saveRename}>Rename</button>
              <button className="secondary" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">{confirm.message}</p>
            <div className="modal-actions">
              <button
                autoFocus
                onClick={() => {
                  confirm.action()
                  setConfirm(null)
                }}
              >
                Confirm
              </button>
              <button className="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {rebaseBase && (
        <RebaseModal
          baseHash={rebaseBase}
          rows={rebaseRows}
          onCancel={() => setRebaseBase(null)}
          onStart={(rows) => void doInteractiveRebase(rows)}
        />
      )}

      {fileHistoryView && (
        <div className="modal-backdrop" onClick={() => setFileHistoryView(null)}>
          <div
            className="modal conflict-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="conflict-title">File history</h3>
            <p className="conflict-sub">{fileHistoryView.file}</p>
            <div className="rebase-list">
              {fileHistoryView.commits.length === 0 && (
                <div className="empty">No history for this file.</div>
              )}
              {fileHistoryView.commits.map((commit) => (
                <div
                  key={commit.hash}
                  className="fh-row"
                  title={commit.subject}
                  onClick={() => {
                    handleShowCommit(commit.hash, commit.subject)
                    setFileHistoryView(null)
                  }}
                >
                  <code className="rebase-hash">{commit.hash.slice(0, 7)}</code>
                  <span className="fh-subject">{commit.subject}</span>
                  <span className="fh-author">{commit.authorName}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setFileHistoryView(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {blameView && (
        <div className="modal-backdrop" onClick={() => setBlameView(null)}>
          <div
            className="modal conflict-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="conflict-title">Blame</h3>
            <p className="conflict-sub">{blameView.file}</p>
            <div className="blame-view">
              {blameView.lines.map((line, index) => (
                <div key={index} className="blame-row">
                  <code
                    className="blame-hash"
                    title={`${line.hash.slice(0, 7)} · ${line.author}`}
                    onClick={() => {
                      handleShowCommit(line.hash, blameView.file)
                      setBlameView(null)
                    }}
                  >
                    {line.hash.slice(0, 7)}
                  </code>
                  <span className="blame-author">{line.author}</span>
                  <span className="blame-num">{index + 1}</span>
                  <span className="blame-text">{line.text || ' '}</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setBlameView(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {conflictKind && repoPath && showConflict && (
        <ConflictResolver
          repoPath={repoPath}
          kind={conflictKind}
          onResolved={() => void handleConflictResolved()}
          onAbort={() => void handleAbort()}
          onClose={() => {
            setShowConflict(false)
            void refreshConflictCount()
          }}
        />
      )}

      {divergePull && (
        <div className="modal-backdrop" onClick={() => setDivergePull(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Your branch and <code>origin/{currentBranch}</code> have diverged —
              you have {divergePull.ahead} local commit
              {divergePull.ahead === 1 ? '' : 's'} and the remote has{' '}
              {divergePull.behind} you don&apos;t. How do you want to integrate them?
            </p>
            <div className="modal-actions">
              <button
                title="Replay your commits on top of the remote (recommended)"
                onClick={() => void doPullRebase()}
              >
                Rebase
              </button>
              <button
                className="secondary"
                title="Merge the remote into your branch with a merge commit"
                onClick={() => void doPullMerge()}
              >
                Merge
              </button>
              <button className="secondary" onClick={() => setDivergePull(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCleanup && repoPath && (
        <CleanupBranchesModal
          repoPath={repoPath}
          onClose={() => setShowCleanup(false)}
          onDone={(message) => {
            setShowCleanup(false)
            setInfo(message)
            void loadLog(repoPath)
          }}
        />
      )}

      {missingRepo && (
        <div className="modal-backdrop" onClick={() => setMissingRepo(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Repository folder not found:
              <br />
              <code className="modal-path">{missingRepo}</code>
            </p>
            <div className="modal-actions">
              <button onClick={() => void relocateMissingRepo()}>Locate…</button>
              <button className="danger" onClick={() => void removeMissingRepo()}>
                Remove from list
              </button>
              <button className="secondary" onClick={() => setMissingRepo(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stashRequest && (
        <div className="modal-backdrop" onClick={() => setStashRequest(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Stash{' '}
              {stashRequest.files
                ? `${stashRequest.files.length} file${stashRequest.files.length === 1 ? '' : 's'}`
                : 'all changes'}
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="Stash name (optional)"
              value={stashName}
              autoFocus
              onChange={(event) => setStashName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmStash()
                }
              }}
            />
            <div className="modal-actions">
              <button onClick={confirmStash}>Stash</button>
              <button className="secondary" onClick={() => setStashRequest(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {layoutsOpen && (
        <div className="modal-backdrop" onClick={() => setLayoutsOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">Layouts</p>
            <p className="modal-hint">Save the current panel arrangement, or load a saved one.</p>

            <ul className="layout-list">
              {Object.keys(savedLayouts).map((name) => (
                <li key={name} className="layout-item">
                  <span className="layout-name">{name}</span>
                  <button className="secondary" onClick={() => loadLayout(name)}>
                    Load
                  </button>
                  <button
                    className="file-action"
                    title="Delete layout"
                    onClick={() => deleteLayout(name)}
                  >
                    ×
                  </button>
                </li>
              ))}
              {Object.keys(savedLayouts).length === 0 && (
                <li className="empty">No saved layouts yet</li>
              )}
            </ul>

            <div className="layout-save">
              <input
                className="commit-message"
                style={{ height: 'auto' }}
                placeholder="Layout name"
                value={layoutName}
                onChange={(event) => setLayoutName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && layoutName.trim().length > 0) {
                    event.preventDefault()
                    saveCurrentLayout()
                  }
                }}
              />
              <button onClick={saveCurrentLayout} disabled={layoutName.trim().length === 0}>
                Save current
              </button>
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={() => setLayoutsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default App
