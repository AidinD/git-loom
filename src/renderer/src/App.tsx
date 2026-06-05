import { useCallback, useEffect, useRef, useState } from 'react'
import { DockviewReact, themeDark } from 'dockview'
import type { DockviewApi, DockviewReadyEvent } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import type {
  Commit,
  FileChange,
  RepoEntry,
  StashEntry,
  GithubRepo
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
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import { LoomContext, useLoom } from './loom-context'
import type { LoomContextValue, DiffView } from './loom-context'


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
      onStage={l.onStage}
      onUnstage={l.onUnstage}
      onStageAll={l.onStageAll}
      onUnstageAll={l.onUnstageAll}
      onStageMany={l.onStageMany}
      onUnstageMany={l.onUnstageMany}
      onDiscardMany={l.onDiscardMany}
      onStashMany={l.onStashMany}
      onCommit={l.onCommit}
      onShowDiff={l.onShowDiff}
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

const DOCK_COMPONENTS = {
  changes: ChangesDockPanel,
  graph: GraphDockPanel,
  diff: DiffDockPanel,
  files: FilesDockPanel,
  pr: PrDockPanel,
  repos: ReposDockPanel
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
    'merge' | 'rebase' | 'revert' | null
  >(null)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictCount, setConflictCount] = useState(0)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [commitSummary, setCommitSummary] = useState('')
  const [commitDescription, setCommitDescription] = useState('')
  const [commitCoauthors, setCommitCoauthors] = useState('')
  const [diffView, setDiffView] = useState<DiffView | null>(null)
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [groupModalRepo, setGroupModalRepo] = useState<RepoEntry | null>(null)
  const [groupInput, setGroupInput] = useState('')
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
    window.api.listRepos().then(setRepos)
    window.api.getCurrentRepo().then((path) => {
      if (path) {
        loadLog(path)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    id: 'graph' | 'changes' | 'diff' | 'files' | 'pr' | 'repos',
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

  async function loadStatus(path: string): Promise<void> {
    const result = await window.api.status(path)
    setChanges(result.ok ? result.files : [])
    const stashResult = await window.api.stashList(path)
    setStashes(stashResult.ok ? stashResult.stashes : [])
  }

  async function loadLog(path: string): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getLog(path)
      if (result.ok) {
        setRepoPath(result.root)
        setCommits(result.commits)
        setRemotes(result.remotes)
        await loadStatus(result.root)
        const branchResult = await window.api.listBranches(result.root)
        if (branchResult.ok) {
          setBranches(branchResult.branches)
          setCurrentBranch(branchResult.current)
          const map: Record<string, string> = {}
          for (const entry of branchResult.info) {
            map[entry.name] = entry.lastCommit
          }
          setBranchInfo(map)
        }
        const ab = await window.api.aheadBehind(result.root)
        setAhead(ab.ahead)
        setBehind(ab.behind)
        // Detect a repo left mid-merge/rebase/revert so the badge shows up
        // even when we didn't start the operation this session.
        const state = await window.api.conflictState(result.root)
        setConflictKind(state)
        if (state) {
          const conflicts = await window.api.listConflicts(result.root)
          setConflictCount(conflicts.ok ? conflicts.files.length : 0)
        } else {
          setShowConflict(false)
          setConflictCount(0)
        }
        setRepos(await window.api.addRepo(result.root))
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
  async function enterConflict(kind: 'merge' | 'rebase' | 'revert'): Promise<void> {
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
    const result = await window.api.merge(repoPath, source, target)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
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
    const result = await window.api.rebase(repoPath, source, target)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('rebase')
      }
    }
  }

  async function doRevert(hash: string, noCommit: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.revert(repoPath, hash, noCommit)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setConflictKind(null)
    } else {
      setError(result.error)
      if (result.conflict) {
        await enterConflict('revert')
      }
    }
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

  function handlePull(): Promise<void> {
    return runRemoteOp((path) => window.api.pull(path))
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
          for (const file of files) {
            const change = changes.find((entry) => entry.path === file)
            const untracked = change ? change.worktree === '?' : false
            const result = await window.api.discardFile(repoPath, file, untracked)
            if (!result.ok) {
              setError(result.error)
              break
            }
          }
          await loadStatus(repoPath)
        })()
      }
    })
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
    const result = await window.api.commit(repoPath, message)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    setCommitSummary('')
    setCommitDescription('')
    setCommitCoauthors('')
    await loadLog(repoPath)
  }

  async function handleShowDiff(file: string, staged: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.diff(repoPath, file, staged)
    if (result.ok) {
      setDiffView({
        title: file,
        subtitle: staged ? 'staged' : 'unstaged',
        text: result.text
      })
      setSelectedDiffFile(null)
      showPanel('diff', 'Diff')
    } else {
      setError(result.error)
    }
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

  async function doDeleteBranch(name: string, force = false): Promise<void> {
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
            void doDeleteBranch(name, true)
          }
        })
        return
      }
      setError(result.error)
      return
    }
    setInfo(result.message)
    await loadLog(repoPath)
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
    remotes,
    repoPath,
    selected,
    setSelected,
    onCheckout: handleCheckout,
    onShowCommit: handleShowCommit,
    onRevert: doRevert,
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
    onNewBranchFrom: openNewBranchModal,
    changes,
    stashes,
    commitSummary,
    setCommitSummary,
    commitDescription,
    setCommitDescription,
    commitCoauthors,
    setCommitCoauthors,
    onStage: handleStage,
    onUnstage: handleUnstage,
    onStageAll: handleStageAll,
    onUnstageAll: handleUnstageAll,
    onCommit: handleCommit,
    onShowDiff: handleShowDiff,
    onStash: handleStash,
    onPopStash: handlePopStash,
    onDropStash: handleDropStash,
    onDiscard: requestDiscard,
    onStageMany: handleStageMany,
    onUnstageMany: handleUnstageMany,
    onDiscardMany: handleDiscardMany,
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
    onReorderRepos: (items) => void handleReorderRepos(items)
  }

  return (
    <div className="app">
      <header className="toolbar">
        <RepoSwitcher
          repos={repos}
          currentPath={repoPath}
          onSwitch={(path) => handleSwitchRepo(path)}
          onAddExisting={handleOpen}
          onClone={openCloneModal}
          onRemove={handleRemoveRepo}
          onSetGroup={openGroupModal}
          onReorder={(items) => void handleReorderRepos(items)}
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
            setContextMenu({
              x: rect.left,
              y: rect.bottom + 4,
              items: [
                {
                  label: 'Repositories',
                  onClick: () => showPanel('repos', 'Repositories')
                },
                { label: 'History', onClick: () => showPanel('graph', 'History') },
                { label: 'Changes', onClick: () => showPanel('changes', 'Changes') },
                { label: 'Files', onClick: () => showPanel('files', 'Files') },
                { label: 'Diff', onClick: () => showPanel('diff', 'Diff') },
                { label: 'Pull requests', onClick: () => showPanel('pr', 'Pull requests') }
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

      {(error || info) && (
        <footer className={`statusbar ${error ? 'statusbar-error' : 'statusbar-info'}`}>
          <span className="statusbar-text">{error || info}</span>
          <button
            className="statusbar-close"
            onClick={() => {
              setError(null)
              setInfo(null)
            }}
          >
            ×
          </button>
        </footer>
      )}

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
