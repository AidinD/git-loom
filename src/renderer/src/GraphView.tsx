import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import GitGraph from './graph/GitGraph'
import { useLoom } from './loom-context'
import type { ContextMenuItem } from './ContextMenu'
import type { Commit } from '../../shared/types'

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

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return `hsl(${hash % 360} 42% 42%)`
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

// Higher priority renders further right (next to the graph) and stays visible
// when a row has more ref chips than fit; lower-priority ones clip on the left.
const REF_PRIORITY: Record<RefKind, number> = {
  head: 3,
  branch: 2,
  tag: 1,
  remote: 0
}

function sortRefsByPriority(refs: string[], remotes: string[]): string[] {
  return [...refs].sort(
    (a, b) =>
      REF_PRIORITY[parseRef(a, remotes).kind] - REF_PRIORITY[parseRef(b, remotes).kind]
  )
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
    onRevert,
    onCherryPick,
    onResetTo,
    onLoadMore
  } = useLoom()

  const mainRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const hasCommits = commits.length > 0
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)

  useEffect(() => {
    const el = mainRef.current
    if (!el) {
      return
    }
    let frame = 0
    function onScroll(): void {
      if (frame) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        // Within ~600px of the bottom: fetch the next page.
        if (el!.scrollHeight - el!.scrollTop - el!.clientHeight < 600) {
          onLoadMoreRef.current()
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [hasCommits])

  if (commits.length === 0) {
    return (
      <div className="graph-empty">
        {repoPath ? 'No commits found.' : 'Open a repository to get started.'}
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const matchHashes = new Set<string>()
  const matchIndices: number[] = []
  if (needle.length > 0) {
    commits.forEach((commit, index) => {
      if (
        commit.subject.toLowerCase().includes(needle) ||
        commit.authorName.toLowerCase().includes(needle) ||
        commit.hash.toLowerCase().startsWith(needle)
      ) {
        matchHashes.add(commit.hash)
        matchIndices.push(index)
      }
    })
  }

  function jumpToMatch(pos: number): void {
    if (matchIndices.length === 0 || !mainRef.current) {
      return
    }
    const wrapped = (pos + matchIndices.length) % matchIndices.length
    setMatchPos(wrapped)
    const row = matchIndices[wrapped]
    mainRef.current.scrollTo({ top: Math.max(0, row * ROW_HEIGHT - 100) })
  }

  function selectRow(commit: Commit): void {
    setSelected(commit.hash)
    onShowCommit(commit.hash, commit.subject)
  }

  function commitMenu(event: ReactMouseEvent, commit: Commit): void {
    event.preventDefault()
    openContextMenu(event.clientX, event.clientY, [
      { label: 'New branch here…', onClick: () => onNewBranchFrom(commit.hash) },
      { label: 'Check out (detached)', onClick: () => onCheckout(commit.hash) },
      { label: 'Cherry-pick onto current', onClick: () => onCherryPick(commit.hash) },
      {
        label: 'Reset current branch here (soft)',
        onClick: () => onResetTo(commit.hash, 'soft')
      },
      {
        label: 'Reset current branch here (mixed)',
        onClick: () => onResetTo(commit.hash, 'mixed')
      },
      {
        label: 'Reset current branch here (hard)',
        danger: true,
        onClick: () => onResetTo(commit.hash, 'hard')
      },
      {
        label: 'Revert & commit',
        onClick: () => onRevert(commit.hash, false)
      },
      {
        label: 'Revert without committing',
        onClick: () => onRevert(commit.hash, true)
      }
    ])
  }

  function renderChip(ref: string) {
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
          if ((parsed.kind === 'branch' || parsed.kind === 'head') && parsed.name) {
            const branchName = parsed.name
            items.push({ label: 'Rename…', onClick: () => onRenameBranch(branchName) })
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
          if (canDrop && parsed.target && dragSource && dragSource !== parsed.name) {
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
  }

  return (
    <div className="history">
      <div className="history-search">
        <input
          className="repo-filter"
          placeholder="Search commits (message, author, hash)"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setMatchPos(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              jumpToMatch(event.shiftKey ? matchPos - 1 : matchPos + 1)
            }
          }}
        />
        {needle.length > 0 && (
          <span className="history-search-count">
            {matchIndices.length === 0
              ? 'No matches'
              : `${matchPos + 1}/${matchIndices.length}`}
          </span>
        )}
        <button
          className="secondary"
          disabled={matchIndices.length === 0}
          title="Previous match"
          onClick={() => jumpToMatch(matchPos - 1)}
        >
          ↑
        </button>
        <button
          className="secondary"
          disabled={matchIndices.length === 0}
          title="Next match"
          onClick={() => jumpToMatch(matchPos + 1)}
        >
          ↓
        </button>
      </div>

      <div className="main" ref={mainRef}>
        <ul className="refs-col">
          {commits.map((commit) => (
            <li
              key={commit.hash}
              className={`refs-row${selected === commit.hash ? ' selected' : ''}${
                matchHashes.has(commit.hash) ? ' search-match' : ''
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => selectRow(commit)}
              onDoubleClick={() => onCheckout(commit.hash)}
              onContextMenu={(event) => commitMenu(event, commit)}
            >
              {sortRefsByPriority(commit.refs, remotes).map((ref) => renderChip(ref))}
            </li>
          ))}
        </ul>

        <GitGraph commits={commits} rowHeight={ROW_HEIGHT} selectedHash={selected} />

        <ul className="commit-list">
          {commits.map((commit) => (
            <li
              key={commit.hash}
              className={`commit${selected === commit.hash ? ' selected' : ''}${
                matchHashes.has(commit.hash) ? ' search-match' : ''
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => selectRow(commit)}
              onDoubleClick={() => onCheckout(commit.hash)}
              onContextMenu={(event) => commitMenu(event, commit)}
              title={commit.subject}
            >
            <code className="hash">{commit.hash.slice(0, 7)}</code>
            <span className="subject">{commit.subject}</span>
            <span
              className="avatar"
              style={{ background: avatarColor(commit.authorName) }}
              title={commit.authorName}
            >
              {initialsFor(commit.authorName)}
            </span>
            <span className="author">{commit.authorName}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default GraphView
