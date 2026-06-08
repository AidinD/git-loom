import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  getLog,
  checkout,
  merge,
  mergeAbort,
  rebase,
  rebaseAbort,
  interactiveRebase,
  type RebaseTodoRow,
  revert,
  revertAbort,
  cherryPick,
  cherryPickAbort,
  resetTo,
  getHead,
  undoLastCommit,
  status,
  diff,
  stage,
  unstage,
  applyPatch,
  fileHistory,
  blame,
  imageDiff,
  commit,
  showCommit,
  remoteUrl,
  clone,
  stashList,
  stashPush,
  stashFiles,
  stashPop,
  stashDrop,
  fetch,
  pull,
  push,
  listBranches,
  aheadBehind,
  createBranch,
  deleteBranch,
  deleteRemoteBranch,
  deleteBranches,
  listLocalBranches,
  getUpstream,
  renameBranch,
  discardFile,
  stageAll,
  unstageAll,
  stageFiles,
  unstageFiles,
  listConflicts,
  useOurs,
  useTheirs,
  markResolved,
  continueConflict,
  skipConflict,
  readConflictFile,
  resolveConflictFile,
  conflictState
} from './git'
import {
  listRepos,
  addRepo,
  removeRepo,
  setRepoGroup,
  renameRepoGroup,
  setReposLayout,
  getCurrentRepo,
  setCurrentRepo
} from './repos'
import { listGithubRepos, listPullRequests, checkoutPullRequest } from './github'

const { autoUpdater } = electronUpdater

/** Converts a git remote URL (ssh or https) to a browsable web URL. */
function toWebUrl(remote: string): string | null {
  const ssh = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (ssh) {
    return `https://${ssh[1]}/${ssh[2]}`
  }
  const https = remote.match(/^https?:\/\/(.+?)(?:\.git)?$/)
  if (https) {
    return `https://${https[1]}`
  }
  return null
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Loom',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Checks GitHub Releases for updates (packaged builds only) and tells the
 * renderer when one is downloaded so it can offer a restart.
 */
function setupAutoUpdate(): void {
  if (!app.isPackaged) {
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:ready', info.version)
  })
  autoUpdater.checkForUpdates().catch(() => {
    // offline or no releases yet — ignore
  })
}

app.whenReady().then(() => {
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
  })

  ipcMain.handle('repo:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle(
    'git:log',
    async (_event, repoPath: string, limit?: number, skip?: number) => {
      return getLog(repoPath, limit, skip)
    }
  )

  ipcMain.handle(
    'git:checkout',
    async (_event, repoPath: string, target: string) => {
      return checkout(repoPath, target)
    }
  )

  ipcMain.handle(
    'git:merge',
    async (_event, repoPath: string, source: string, target: string) => {
      return merge(repoPath, source, target)
    }
  )

  ipcMain.handle('git:mergeAbort', async (_event, repoPath: string) => {
    return mergeAbort(repoPath)
  })

  ipcMain.handle(
    'git:rebase',
    async (_event, repoPath: string, source: string, target: string) => {
      return rebase(repoPath, source, target)
    }
  )

  ipcMain.handle('git:rebaseAbort', async (_event, repoPath: string) => {
    return rebaseAbort(repoPath)
  })

  ipcMain.handle(
    'git:interactiveRebase',
    async (_event, repoPath: string, baseHash: string, rows: RebaseTodoRow[]) => {
      return interactiveRebase(repoPath, baseHash, rows)
    }
  )

  ipcMain.handle(
    'git:revert',
    async (_event, repoPath: string, hash: string, noCommit: boolean) => {
      return revert(repoPath, hash, noCommit)
    }
  )

  ipcMain.handle('git:revertAbort', async (_event, repoPath: string) => {
    return revertAbort(repoPath)
  })

  ipcMain.handle('git:cherryPick', async (_event, repoPath: string, hash: string) => {
    return cherryPick(repoPath, hash)
  })

  ipcMain.handle('git:cherryPickAbort', async (_event, repoPath: string) => {
    return cherryPickAbort(repoPath)
  })

  ipcMain.handle(
    'git:resetTo',
    async (
      _event,
      repoPath: string,
      hash: string,
      mode: 'soft' | 'mixed' | 'hard' | 'keep'
    ) => {
      return resetTo(repoPath, hash, mode)
    }
  )

  ipcMain.handle('git:getHead', async (_event, repoPath: string) => {
    return getHead(repoPath)
  })

  ipcMain.handle('git:undoLastCommit', async (_event, repoPath: string) => {
    return undoLastCommit(repoPath)
  })

  ipcMain.handle('git:conflictState', async (_event, repoPath: string) => {
    return conflictState(repoPath)
  })

  ipcMain.handle('git:listConflicts', async (_event, repoPath: string) => {
    return listConflicts(repoPath)
  })

  ipcMain.handle('git:useOurs', async (_event, repoPath: string, file: string) => {
    return useOurs(repoPath, file)
  })

  ipcMain.handle('git:useTheirs', async (_event, repoPath: string, file: string) => {
    return useTheirs(repoPath, file)
  })

  ipcMain.handle('git:markResolved', async (_event, repoPath: string, file: string) => {
    return markResolved(repoPath, file)
  })

  ipcMain.handle(
    'git:continueConflict',
    async (
      _event,
      repoPath: string,
      kind: 'merge' | 'rebase' | 'revert' | 'cherry-pick'
    ) => {
      return continueConflict(repoPath, kind)
    }
  )

  ipcMain.handle(
    'git:skipConflict',
    async (_event, repoPath: string, kind: 'rebase' | 'cherry-pick' | 'revert') => {
      return skipConflict(repoPath, kind)
    }
  )

  ipcMain.handle('git:readConflictFile', async (_event, repoPath: string, file: string) => {
    return readConflictFile(repoPath, file)
  })

  ipcMain.handle(
    'git:resolveConflictFile',
    async (_event, repoPath: string, file: string, content: string) => {
      return resolveConflictFile(repoPath, file, content)
    }
  )

  ipcMain.handle('git:status', async (_event, repoPath: string) => {
    return status(repoPath)
  })

  ipcMain.handle(
    'git:diff',
    async (_event, repoPath: string, file: string, staged: boolean) => {
      return diff(repoPath, file, staged)
    }
  )

  ipcMain.handle('git:showCommit', async (_event, repoPath: string, hash: string) => {
    return showCommit(repoPath, hash)
  })

  ipcMain.handle('git:stage', async (_event, repoPath: string, file: string) => {
    return stage(repoPath, file)
  })

  ipcMain.handle('git:stageAll', async (_event, repoPath: string) => {
    return stageAll(repoPath)
  })

  ipcMain.handle('git:unstageAll', async (_event, repoPath: string) => {
    return unstageAll(repoPath)
  })

  ipcMain.handle('git:stageFiles', async (_event, repoPath: string, files: string[]) => {
    return stageFiles(repoPath, files)
  })

  ipcMain.handle(
    'git:unstageFiles',
    async (_event, repoPath: string, files: string[]) => {
      return unstageFiles(repoPath, files)
    }
  )

  ipcMain.handle('git:unstage', async (_event, repoPath: string, file: string) => {
    return unstage(repoPath, file)
  })

  ipcMain.handle(
    'git:applyPatch',
    async (_event, repoPath: string, patch: string, reverse: boolean) => {
      return applyPatch(repoPath, patch, reverse)
    }
  )

  ipcMain.handle('git:fileHistory', async (_event, repoPath: string, file: string) => {
    return fileHistory(repoPath, file)
  })

  ipcMain.handle('git:blame', async (_event, repoPath: string, file: string) => {
    return blame(repoPath, file)
  })

  ipcMain.handle(
    'git:imageDiff',
    async (_event, repoPath: string, file: string, staged: boolean) => {
      return imageDiff(repoPath, file, staged)
    }
  )

  ipcMain.handle(
    'git:commit',
    async (_event, repoPath: string, message: string, sign?: boolean) => {
      return commit(repoPath, message, sign)
    }
  )

  ipcMain.handle('git:clone', async (_event, url: string, parentDir: string) => {
    return clone(url, parentDir)
  })

  ipcMain.handle('github:listRepos', async () => {
    return listGithubRepos()
  })

  ipcMain.handle('github:listPrs', async (_event, repoPath: string) => {
    return listPullRequests(repoPath)
  })

  ipcMain.handle('github:checkoutPr', async (_event, repoPath: string, num: number) => {
    return checkoutPullRequest(repoPath, num)
  })

  ipcMain.handle('repo:reveal', async (_event, repoPath: string) => {
    shell.openPath(repoPath)
  })

  ipcMain.handle('repo:exists', async (_event, repoPath: string) => {
    return existsSync(repoPath)
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('repo:openInEditor', async (_event, repoPath: string) => {
    // Best-effort: open the repo in VS Code via its CLI.
    const child = spawn(`code "${repoPath}"`, {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
  })

  ipcMain.handle('repo:openOnGitHub', async (_event, repoPath: string) => {
    const url = await remoteUrl(repoPath)
    const web = url ? toWebUrl(url) : null
    if (web) {
      shell.openExternal(web)
    }
    return web
  })

  ipcMain.handle('git:stashList', async (_event, repoPath: string) => {
    return stashList(repoPath)
  })

  ipcMain.handle('git:stashPush', async (_event, repoPath: string, message: string) => {
    return stashPush(repoPath, message)
  })

  ipcMain.handle(
    'git:stashFiles',
    async (_event, repoPath: string, files: string[], message: string) => {
      return stashFiles(repoPath, files, message)
    }
  )

  ipcMain.handle('git:stashPop', async (_event, repoPath: string, ref: string) => {
    return stashPop(repoPath, ref)
  })

  ipcMain.handle('git:stashDrop', async (_event, repoPath: string, ref: string) => {
    return stashDrop(repoPath, ref)
  })

  ipcMain.handle('git:fetch', async (_event, repoPath: string) => {
    return fetch(repoPath)
  })

  ipcMain.handle('git:pull', async (_event, repoPath: string) => {
    return pull(repoPath)
  })

  ipcMain.handle('git:push', async (_event, repoPath: string) => {
    return push(repoPath)
  })

  ipcMain.handle('git:branches', async (_event, repoPath: string) => {
    return listBranches(repoPath)
  })

  ipcMain.handle('git:aheadBehind', async (_event, repoPath: string) => {
    return aheadBehind(repoPath)
  })

  ipcMain.handle(
    'git:createBranch',
    async (_event, repoPath: string, name: string, startPoint?: string) => {
      return createBranch(repoPath, name, startPoint)
    }
  )

  ipcMain.handle(
    'git:deleteBranch',
    async (_event, repoPath: string, name: string, force: boolean) => {
      return deleteBranch(repoPath, name, force)
    }
  )

  ipcMain.handle(
    'git:deleteRemoteBranch',
    async (_event, repoPath: string, remote: string, branch: string) => {
      return deleteRemoteBranch(repoPath, remote, branch)
    }
  )

  ipcMain.handle('git:getUpstream', async (_event, repoPath: string, name: string) => {
    return getUpstream(repoPath, name)
  })

  ipcMain.handle('git:listLocalBranches', async (_event, repoPath: string) => {
    return listLocalBranches(repoPath)
  })

  ipcMain.handle(
    'git:deleteBranches',
    async (_event, repoPath: string, names: string[], force: boolean) => {
      return deleteBranches(repoPath, names, force)
    }
  )

  ipcMain.handle(
    'git:renameBranch',
    async (_event, repoPath: string, oldName: string, newName: string) => {
      return renameBranch(repoPath, oldName, newName)
    }
  )

  ipcMain.handle(
    'git:discardFile',
    async (_event, repoPath: string, file: string, untracked: boolean) => {
      return discardFile(repoPath, file, untracked)
    }
  )

  ipcMain.handle('repos:list', async () => {
    return listRepos()
  })

  ipcMain.handle('repos:getCurrent', async () => {
    return getCurrentRepo()
  })

  ipcMain.handle('repos:setCurrent', async (_event, repoPath: string) => {
    setCurrentRepo(repoPath)
  })

  ipcMain.handle('repos:add', async (_event, repoPath: string) => {
    return addRepo(repoPath)
  })

  ipcMain.handle('repos:remove', async (_event, repoPath: string) => {
    return removeRepo(repoPath)
  })

  ipcMain.handle(
    'repos:setGroup',
    async (_event, repoPath: string, group: string) => {
      return setRepoGroup(repoPath, group)
    }
  )

  ipcMain.handle(
    'repos:setLayout',
    async (_event, items: { path: string; group: string }[]) => {
      return setReposLayout(items)
    }
  )

  ipcMain.handle(
    'repos:renameGroup',
    async (_event, oldName: string, newName: string) => {
      return renameRepoGroup(oldName, newName)
    }
  )

  ipcMain.handle('update:install', async () => {
    autoUpdater.quitAndInstall()
  })

  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
