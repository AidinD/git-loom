import GitGraph from './graph/GitGraph'
import { useLoom } from './loom-context'
import type { ContextMenuItem } from './ContextMenu'

const ROW_HEIGHT = 28

type RefKind = 'head' | 'branch' | 'remote' | 'tag'

interface ParsedRef {
  kind: RefKind
  label: string
  name: string | null
  target: string | null
}

function parseRef(ref: string, remotes: string[]): ParsedRef {
  if (ref.startsWith('tag: ')) {
    const name = ref.slice(5)
    return { kind: 'tag', label: name, name, target: name }
  }
  if (ref.startsWith('HEAD ->')) {
    const branch = ref.replace('HEAD ->', '').trim()
    return { kind: 'head', label: `HEAD → ${branch}`, name: branch, target: branch }
  }
  if (ref === 'HEAD') {
    return { kind: 'head', label: 'HEAD', name: null, target: null }
  }
  const slash = ref.indexOf('/')
  if (slash !== -1 && remotes.includes(ref.slice(0, slash))) {
    const shortName = ref.slice(slash + 1)
    const target = shortName && shortName !== 'HEAD' ? shortName : null
    return { kind: 'remote', label: ref, name: ref, target }
  }
  return { kind: 'branch', label: ref, name: ref, target: ref }
}

function canDragRef(parsed: ParsedRef): boolean {
  return parsed.name !== null && parsed.kind !== 'tag'
}

function canDropRef(parsed: ParsedRef): boolean {
  return parsed.target !== null && parsed.kind !== 'tag'
}

function GraphView() {
  const {
    commits,
    remotes,
    repoPath,
    selected,
    setSelected,
    onCheckout,
    onShowCommit,
    dragSource,
    setDragSource,
    dragOver,
    setDragOver,
    onMerge,
    onRebase,
    openContextMenu,
    onRenameBranch,
    onDeleteBranch,
    onNewBranchFrom,
    onRevert
  } = useLoom()

  if (commits.length === 0) {
    return (
      <div className="graph-empty">
        {repoPath ? 'No commits found.' : 'Open a repository to get started.'}
      </div>
    )
  }

  return (
    <div className="main">
      <GitGraph commits={commits} rowHeight={ROW_HEIGHT} />

      <ul className="commit-list">
        {commits.map((commit) => (
          <li
            key={commit.hash}
            className={`commit${selected === commit.hash ? ' selected' : ''}`}
            style={{ height: ROW_HEIGHT }}
            onClick={() => {
              setSelected(commit.hash)
              onShowCommit(commit.hash, commit.subject)
            }}
            onDoubleClick={() => onCheckout(commit.hash)}
            onContextMenu={(event) => {
              event.preventDefault()
              openContextMenu(event.clientX, event.clientY, [
                {
                  label: 'New branch here…',
                  onClick: () => onNewBranchFrom(commit.hash)
                },
                {
                  label: 'Check out (detached)',
                  onClick: () => onCheckout(commit.hash)
                },
                {
                  label: 'Revert commit',
                  danger: true,
                  onClick: () => onRevert(commit.hash)
                }
              ])
            }}
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
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        const items: ContextMenuItem[] = []
                        if (parsed.target) {
                          items.push({
                            label: `Check out ${parsed.target}`,
                            onClick: () => onCheckout(parsed.target)
                          })
                        }
                        if (
                          (parsed.kind === 'branch' || parsed.kind === 'head') &&
                          parsed.name
                        ) {
                          const branchName = parsed.name
                          items.push({
                            label: 'Rename…',
                            onClick: () => onRenameBranch(branchName)
                          })
                          items.push({
                            label: 'Delete',
                            danger: true,
                            onClick: () => onDeleteBranch(branchName)
                          })
                        }
                        if (items.length > 0) {
                          openContextMenu(event.clientX, event.clientY, items)
                        }
                      }}
                      onDoubleClick={(event) => {
                        if (!parsed.target) {
                          return
                        }
                        event.stopPropagation()
                        onCheckout(parsed.target)
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
                          const source = dragSource
                          const target = parsed.target
                          const label = parsed.label
                          openContextMenu(event.clientX, event.clientY, [
                            {
                              label: `Merge ${source} into ${label}`,
                              onClick: () => onMerge(source, target, label)
                            },
                            {
                              label: `Rebase ${source} onto ${label}`,
                              onClick: () => onRebase(source, target, label)
                            }
                          ])
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
  )
}

export default GraphView
