import { useCallback, useEffect, useRef, useState } from 'react'
import { DockviewReact, themeDark } from 'dockview'
import type { DockviewApi, DockviewReadyEvent } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import type { Commit, FileChange, RepoEntry, StashEntry } from '../../shared/types'
import ChangesPanel from './ChangesPanel'
import DiffModal from './DiffModal'
import RepoSwitcher from './RepoSwitcher'
import GraphView from './GraphView'
import { LoomContext, useLoom } from './loom-context'
import type { LoomContextValue } from './loom-context'

interface MergeRequest {
  source: string
  target: string
  targetLabel: string
}

interface DiffView {
  path: string
  staged: boolean
  text: string
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
      onCommit={l.onCommit}
      onShowDiff={l.onShowDiff}
      onStash={l.onStash}
      onPopStash={l.onPopStash}
      onDropStash={l.onDropStash}
    />
  )
}

function GraphDockPanel() {
  return <GraphView />
}

const DOCK_COMPONENTS = {
  changes: ChangesDockPanel,
  graph: GraphDockPanel
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
  const [mergeRequest, setMergeRequest] = useState<MergeRequest | null>(null)
  const [inConflict, setInConflict] = useState(false)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [diffView, setDiffView] = useState<DiffView | null>(null)
  const [repos, setRepos] = useState<RepoEntry[]>([])
  const [groupModalRepo, setGroupModalRepo] = useState<RepoEntry | null>(null)
  const [groupInput, setGroupInput] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')

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

  async function confirmMerge(): Promise<void> {
    if (!repoPath || !mergeRequest) {
      return
    }
    const request = mergeRequest
    setMergeRequest(null)
    setError(null)
    setInfo(null)
    const result = await window.api.merge(repoPath, request.source, request.target)
    await loadLog(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setInConflict(false)
    } else {
      setError(result.error)
      setInConflict(result.conflict)
    }
  }

  async function handleAbortMerge(): Promise<void> {
    if (!repoPath) {
      return
    }
    const result = await window.api.mergeAbort(repoPath)
    if (result.ok) {
      setInfo(result.message)
      setError(null)
      setInConflict(false)
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
    requestMerge: (source, target, targetLabel) =>
      setMergeRequest({ source, target, targetLabel }),
    changes,
    stashes,
    commitMessage,
    setCommitMessage,
    onStage: handleStage,
    onUnstage: handleUnstage,
    onCommit: handleCommit,
    onShowDiff: handleShowDiff,
    onStash: handleStash,
    onPopStash: handlePopStash,
    onDropStash: handleDropStash
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
          </>
        )}
        <button className="secondary" onClick={resetLayout} title="Reset panel layout">
          Reset layout
        </button>
        {inConflict && (
          <button className="danger" onClick={handleAbortMerge}>
            Abort merge
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

      {mergeRequest && (
        <div className="modal-backdrop" onClick={() => setMergeRequest(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-text">
              Merge <strong>{mergeRequest.source}</strong> into{' '}
              <strong>{mergeRequest.targetLabel}</strong>?
            </p>
            <p className="modal-hint">
              Checks out {mergeRequest.targetLabel}, then merges {mergeRequest.source}
              into it.
            </p>
            <div className="modal-actions">
              <button onClick={confirmMerge}>Merge</button>
              <button className="secondary" onClick={() => setMergeRequest(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {diffView && <DiffModal diff={diffView} onClose={() => setDiffView(null)} />}

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
    </div>
  )
}

export default App
