import { useLoom } from './loom-context'
import RepoList from './RepoList'

/** Docked panel showing the repository list (same UI as the toolbar dropdown). */
function ReposPanel() {
  const l = useLoom()
  return (
    <div className="repo-panel">
      <RepoList
        repos={l.repos}
        currentPath={l.repoPath}
        onSwitch={l.onSwitchRepo}
        onAddExisting={l.onAddExistingRepo}
        onClone={l.onCloneRepo}
        onRemove={l.onRemoveRepo}
        onSetGroup={l.onSetRepoGroup}
        onRenameGroup={l.onRenameRepoGroup}
        onReorder={l.onReorderRepos}
        openContextMenu={l.openContextMenu}
      />
    </div>
  )
}

export default ReposPanel
