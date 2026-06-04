import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import {
  getLog,
  checkout,
  merge,
  mergeAbort,
  status,
  diff,
  stage,
  unstage,
  commit,
  clone,
  stashList,
  stashPush,
  stashPop,
  stashDrop,
  fetch,
  pull,
  push,
  createBranch,
  deleteBranch,
  renameBranch,
  discardFile
} from './git'
import {
  listRepos,
  addRepo,
  removeRepo,
  setRepoGroup,
  getCurrentRepo,
  setCurrentRepo
} from './repos'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
    mainWindow.show()
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

app.whenReady().then(() => {
  ipcMain.handle('repo:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('git:log', async (_event, repoPath: string) => {
    return getLog(repoPath)
  })

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

  ipcMain.handle('git:status', async (_event, repoPath: string) => {
    return status(repoPath)
  })

  ipcMain.handle(
    'git:diff',
    async (_event, repoPath: string, file: string, staged: boolean) => {
      return diff(repoPath, file, staged)
    }
  )

  ipcMain.handle('git:stage', async (_event, repoPath: string, file: string) => {
    return stage(repoPath, file)
  })

  ipcMain.handle('git:unstage', async (_event, repoPath: string, file: string) => {
    return unstage(repoPath, file)
  })

  ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
    return commit(repoPath, message)
  })

  ipcMain.handle('git:clone', async (_event, url: string, parentDir: string) => {
    return clone(url, parentDir)
  })

  ipcMain.handle('git:stashList', async (_event, repoPath: string) => {
    return stashList(repoPath)
  })

  ipcMain.handle('git:stashPush', async (_event, repoPath: string, message: string) => {
    return stashPush(repoPath, message)
  })

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

  ipcMain.handle(
    'git:createBranch',
    async (_event, repoPath: string, name: string, startPoint?: string) => {
      return createBranch(repoPath, name, startPoint)
    }
  )

  ipcMain.handle('git:deleteBranch', async (_event, repoPath: string, name: string) => {
    return deleteBranch(repoPath, name)
  })

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

  createWindow()

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
