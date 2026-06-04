import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { RepoEntry } from '../shared/types'

interface Store {
  repos: RepoEntry[]
  current?: string
}

function storeFile(): string {
  return join(app.getPath('userData'), 'repos.json')
}

function read(): Store {
  try {
    if (existsSync(storeFile())) {
      const parsed = JSON.parse(readFileSync(storeFile(), 'utf8'))
      if (parsed && Array.isArray(parsed.repos)) {
        return parsed as Store
      }
    }
  } catch {
    // Corrupt or unreadable store — start fresh rather than crash.
  }
  return { repos: [] }
}

function write(store: Store): void {
  writeFileSync(storeFile(), JSON.stringify(store, null, 2))
}

export function listRepos(): RepoEntry[] {
  return read().repos
}

export function addRepo(path: string): RepoEntry[] {
  const store = read()
  if (!store.repos.some((repo) => repo.path === path)) {
    store.repos.push({ path, name: basename(path), group: '' })
    write(store)
  }
  return store.repos
}

export function removeRepo(path: string): RepoEntry[] {
  const store = read()
  store.repos = store.repos.filter((repo) => repo.path !== path)
  write(store)
  return store.repos
}

export function getCurrentRepo(): string | null {
  return read().current ?? null
}

export function setCurrentRepo(path: string): void {
  const store = read()
  store.current = path
  write(store)
}

export function setRepoGroup(path: string, group: string): RepoEntry[] {
  const store = read()
  const entry = store.repos.find((repo) => repo.path === path)
  if (entry) {
    entry.group = group.trim()
    write(store)
  }
  return store.repos
}
