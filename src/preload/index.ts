import { contextBridge, ipcRenderer } from 'electron'
import type {
  LogResult,
  CheckoutResult,
  MergeResult,
  StatusResult,
  DiffResult,
  RepoEntry,
  CloneResult,
  StashListResult
} from '../shared/types'

const api = {
  openRepo: (): Promise<string | null> => ipcRenderer.invoke('repo:open'),
  getLog: (repoPath: string): Promise<LogResult> =>
    ipcRenderer.invoke('git:log', repoPath),
  checkout: (repoPath: string, target: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:checkout', repoPath, target),
  merge: (repoPath: string, source: string, target: string): Promise<MergeResult> =>
    ipcRenderer.invoke('git:merge', repoPath, source, target),
  mergeAbort: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:mergeAbort', repoPath),
  status: (repoPath: string): Promise<StatusResult> =>
    ipcRenderer.invoke('git:status', repoPath),
  diff: (repoPath: string, file: string, staged: boolean): Promise<DiffResult> =>
    ipcRenderer.invoke('git:diff', repoPath, file, staged),
  stage: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stage', repoPath, file),
  unstage: (repoPath: string, file: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:unstage', repoPath, file),
  commit: (repoPath: string, message: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:commit', repoPath, message),
  clone: (url: string, parentDir: string): Promise<CloneResult> =>
    ipcRenderer.invoke('git:clone', url, parentDir),
  listRepos: (): Promise<RepoEntry[]> => ipcRenderer.invoke('repos:list'),
  addRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:add', repoPath),
  removeRepo: (repoPath: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:remove', repoPath),
  setRepoGroup: (repoPath: string, group: string): Promise<RepoEntry[]> =>
    ipcRenderer.invoke('repos:setGroup', repoPath, group),
  stashList: (repoPath: string): Promise<StashListResult> =>
    ipcRenderer.invoke('git:stashList', repoPath),
  stashPush: (repoPath: string, message: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashPush', repoPath, message),
  stashPop: (repoPath: string, ref: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashPop', repoPath, ref),
  stashDrop: (repoPath: string, ref: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:stashDrop', repoPath, ref),
  fetch: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:fetch', repoPath),
  pull: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:pull', repoPath),
  push: (repoPath: string): Promise<CheckoutResult> =>
    ipcRenderer.invoke('git:push', repoPath),
  getCurrentRepo: (): Promise<string | null> =>
    ipcRenderer.invoke('repos:getCurrent'),
  setCurrentRepo: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke('repos:setCurrent', repoPath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore - fallback when context isolation is disabled
  window.api = api
}
