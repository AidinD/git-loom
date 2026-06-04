import { useEffect, useState } from 'react'
import type { Commit, FileChange, RepoEntry, StashEntry } from '../../shared/types'
import GitGraph from './graph/GitGraph'
import ChangesPanel from './ChangesPanel'
import DiffModal from './DiffModal'
import RepoSwitcher from './RepoSwitcher'

interface DiffView {
  path: string
  staged: boolean
  text: string
}

const ROW_HEIGHT = 28

type RefKind = 'head' | 'branch' | 'remote' | 'tag'

interface ParsedRef {
  kind: RefKind
  /** Display text on the chip. */
  label: string
  /** The git ref name (merge source + drag/drop identity), or null. */
  name: string | null
  /** The name to pass to `git checkout`, or null when not checkout-able. */
  target: string | null
}

interface MergeRequest {
  source: string
  target: string
  targetLabel: string
}

function parseRef(ref: string, remotes: string[]): ParsedRef {
  if (ref.startsWith('tag: ')) {
    const name = ref.slice(5)
    return { kind: 'tag', label: name, name, target: name }
  }
  if (ref.startsWith('HEAD ->')) {
    // The current branch. Shown as "you are here" but still a real branch you
    // can merge into / from — it is the most common merge target.
    const branch = ref.replace('HEAD ->', '').trim()
    return { kind: 'head', label: `HEAD → ${branch}`, name: branch, target: branch }
  }
  if (ref === 'HEAD') {
    // Detached HEAD — a pure indicator, no branch behind it.
    return { kind: 'head', label: 'HEAD', name: null, target: null }
  }
  const slash = ref.indexOf('/')
  if (slash !== -1 && remotes.includes(ref.slice(0, slash))) {
    // Remote-tracking ref like "origin/feature". Checking out its short name
    // lets git create/switch to a local branch tracking it, instead of
    // landing in a detached HEAD.
    const shortName = ref.slice(slash + 1)
    const target = shortName && shortName !== 'HEAD' ? shortName : null
    return { kind: 'remote', label: ref, name: ref, target }
  }
  // Local branch — may itself contain slashes, e.g. "feature/x".
  return { kind: 'branch', label: ref, name: ref, target: ref }
}

/** A ref that can be the source of a merge / dragged. */
function canDragRef(parsed: ParsedRef): boolean {
  return parsed.name !== null && parsed.kind !== 'tag'
}

/** A ref that can be a merge target / drop zone (a checkout-able branch). */
function canDropRef(parsed: ParsedRef): boolean {
  return parsed.target !== null && parsed.kind !== 'tag'
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

  async function loadStatus(path: string): Promise<void> {
    const result = await window.api.status(path)
    if (result.ok) {
      setChanges(result.files)
    } else {
      setChanges([])
    }
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

  async function runRemoteOp(
    op: (path: string) => Promise<{ ok: boolean } & ({ message: string } | { error: string })>
  ): Promise<void> {
    if (!repoPath) {
      return
    }
    setError(null)
    setInfo(null)
    const result = await op(repoPath)
    // Refresh first: loadLog clears the error bar, so set the result after it.
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
        {inConflict && (
          <button className="danger" onClick={handleAbortMerge}>
            Abort merge
          </button>
        )}
        {repoPath && <span className="repo-path">{repoPath}</span>}
      </header>

      <div className="workspace">
        {repoPath && (
          <ChangesPanel
            files={changes}
            stashes={stashes}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onCommit={handleCommit}
            onShowDiff={handleShowDiff}
            onStash={handleStash}
            onPopStash={handlePopStash}
            onDropStash={handleDropStash}
          />
        )}

        <div className="main">
          {commits.length > 0 && <GitGraph commits={commits} rowHeight={ROW_HEIGHT} />}

          <ul className="commit-list">
          {commits.map((commit) => (
            <li
              key={commit.hash}
              className={`commit${selected === commit.hash ? ' selected' : ''}`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => setSelected(commit.hash)}
              onDoubleClick={() => handleCheckout(commit.hash)}
              title="Double-click to check out this commit (detached)"
            >
              <code className="hash">{commit.hash.slice(0, 7)}</code>
              {commit.refs.length > 0 && (
                <span className="refs">
                  {commit.refs.map((ref) => {
                    const parsed = parseRef(ref, remotes)
                    const canDrag = canDragRef(parsed)
                    const canDrop = canDropRef(parsed)
                    const classes = [
                      'ref',
                      `ref-${parsed.kind}`,
                      parsed.target ? 'checkoutable' : '',
                      canDrag ? 'draggable' : '',
                      dragOver === parsed.name ? 'drag-over' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <span
                        key={ref}
                        className={classes}
                        title={
                          parsed.target
                            ? `Double-click to check out ${parsed.target} · drag onto another branch to merge`
                            : undefined
                        }
                        draggable={canDrag}
                        onDoubleClick={(event) => {
                          if (!parsed.target) {
                            return
                          }
                          event.stopPropagation()
                          handleCheckout(parsed.target)
                        }}
                        onDragStart={(event) => {
                          event.stopPropagation()
                          event.dataTransfer.effectAllowed = 'move'
                          setDragSource(parsed.name)
                        }}
                        onDragEnd={() => {
                          setDragSource(null)
                          setDragOver(null)
                        }}
                        onDragOver={(event) => {
                          if (canDrop && dragSource && dragSource !== parsed.name) {
                            event.preventDefault()
                            setDragOver(parsed.name)
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOver === parsed.name) {
                            setDragOver(null)
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (
                            canDrop &&
                            parsed.target &&
                            dragSource &&
                            dragSource !== parsed.name
                          ) {
                            setMergeRequest({
                              source: dragSource,
                              target: parsed.target,
                              targetLabel: parsed.label
                            })
                          }
                          setDragOver(null)
                          setDragSource(null)
                        }}
                      >
                        {parsed.label}
                      </span>
                    )
                  })}
                </span>
              )}
              <span className="subject">{commit.subject}</span>
              <span className="author">{commit.authorName}</span>
            </li>
          ))}
          </ul>
        </div>
      </div>

      {!loading && repoPath && commits.length === 0 && !error && (
        <div className="status">No commits found.</div>
      )}

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
