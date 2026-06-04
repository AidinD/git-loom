import { useCallback, useEffect, useRef, useState } from 'react'
import { DockviewReact, themeDark } from 'dockview'
import type { DockviewApi, DockviewReadyEvent } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import type { Commit, FileChange, RepoEntry, StashEntry } from '../../shared/types'
import ChangesPanel from './ChangesPanel'
import DiffPanel from './DiffPanel'
import RepoSwitcher from './RepoSwitcher'
import GraphView from './GraphView'
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

// Stable dockview panel components — they read live data from LoomContext.
function ChangesDockPanel() {
  const l = useLoom()
  return (
    <ChangesPanel
      files={l.changes}
      stashes={l.stashes}
      commitMessage={l.commitMessage}
      onCommitMessageChange={l.setCommitMessage}
      onStage={l.onStage}
      onUnstage={l.onUnstage}
      onStageAll={l.onStageAll}
      onUnstageAll={l.onUnstageAll}
      onStageMany={l.onStageMany}
      onUnstageMany={l.onUnstageMany}
      onDiscardMany={l.onDiscardMany}
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

const DOCK_COMPONENTS = {
  changes: ChangesDockPanel,
  graph: GraphDockPanel,
  diff: DiffDockPanel
}

function buildDefaultLayout(api: DockviewApi): void {
  api.addPanel({ id: 'graph', component: 'graph', title: 'History' })
  api.addPanel({
    id: 'changes',
    component: 'changes',
    title: 'Changes',
    position: { referencePanel: 'graph', direction: 'left' }
  })
}

function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [remotes, setRemotes] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [conflictKind, setConflictKind] = useState<'merge' | 'rebase' | null>(null)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [diffView, setDiffView] = useState<DiffView | null>(null)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [groupModalRepo, setGroupModalRepo] = useState<RepoEntry | null>(null)
  const [groupInput, setGroupInput] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchStart, setNewBranchStart] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  useEffect(() => {
    window.api.listRepos().then(setRepos)
    window.api.getCurrentRepo().then((path) => {
      if (path) {
        loadLog(path)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function showPanel(id: 'graph' | 'changes' | 'diff', title: string): void {
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
        setConflictKind('merge')
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
        setConflictKind('rebase')
      }
    }
  }

  async function handleAbort(): Promise<void> {
    if (!repoPath) {
      return
    }
    const result =
      conflictKind === 'rebase'
        ? await window.api.rebaseAbort(repoPath)
        : await window.api.mergeAbort(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setError(null)
      setConflictKind(null)
    } else {
      setError(result.error)
    }
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

  function handleFetch(): Promise<void> {
    return runRemoteOp((path) => window.api.fetch(path))
  }

  function handlePull(): Promise<void> {
    return runRemoteOp((path) => window.api.pull(path))
  }

  function handlePush(): Promise<void> {
    return runRemoteOp((path) => window.api.push(path))
  }

  async function handleStash(): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.stashPush(repoPath, commitMessage.trim())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    setCommitMessage('')
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
    if (!repoPath || commitMessage.trim().length === 0) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await window.api.commit(repoPath, commitMessage.trim())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    setCommitMessage('')
    await loadLog(repoPath)
  }

  async function handleShowDiff(file: string, staged: boolean): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.diff(repoPath, file, staged)
    if (result.ok) {
      setDiffView({ path: file, staged, text: result.text })
      showPanel('diff', 'Diff')
    } else {
      setError(result.error)
    }
  }

  async function handleRemoveRepo(path: string): Promise<void> {
    setRepos(await window.api.removeRepo(path))
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

  async function handleClone(): Promise<void> {
    const url = cloneUrl.trim()
    if (url.length === 0) {
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
    const result = await window.api.clone(url, parentDir)
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
    commitMessage,
    setCommitMessage,
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
    diffView
  }

  return (
    <div className="app">
      <header className="toolbar">
        <RepoSwitcher
          repos={repos}
          currentPath={repoPath}
          onSwitch={(path) => loadLog(path)}
          onAddExisting={handleOpen}
          onClone={() => setCloneOpen(true)}
          onRemove={handleRemoveRepo}
          onSetGroup={openGroupModal}
        />
        {repoPath && (
          <>
            <button className="secondary" onClick={() => loadLog(repoPath)}>
              Refresh
            </button>
            <button className="secondary" onClick={handleFetch}>
              Fetch
            </button>
            <button className="secondary" onClick={handlePull}>
              Pull
            </button>
            <button className="secondary" onClick={handlePush}>
              Push
            </button>
            <button className="secondary" onClick={() => openNewBranchModal(null)}>
              New branch
            </button>
          </>
        )}
        <button
          className="secondary"
          title="Re-open panels"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setContextMenu({
              x: rect.left,
              y: rect.bottom + 4,
              items: [
                { label: 'History', onClick: () => showPanel('graph', 'History') },
                { label: 'Changes', onClick: () => showPanel('changes', 'Changes') },
                { label: 'Diff', onClick: () => showPanel('diff', 'Diff') }
              ]
            })
          }}
        >
          View
        </button>
        <button className="secondary" onClick={resetLayout} title="Reset panel layout">
          Reset layout
        </button>
        {conflictKind && (
          <button className="danger" onClick={handleAbort}>
            Abort {conflictKind}
          </button>
        )}
        {repoPath && <span className="repo-path">{repoPath}</span>}
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
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">Clone a repository</p>
            <p className="modal-hint">
              Enter a URL, then choose the folder to clone into.
            </p>
            <input
              className="commit-message"
              style={{ height: 'auto' }}
              placeholder="https://github.com/org/repo.git"
              value={cloneUrl}
              autoFocus
              onChange={(event) => setCloneUrl(event.target.value)}
            />
            <div className="modal-actions">
              <button onClick={handleClone}>Choose folder & clone</button>
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
