# Loom

A visual Git client with a direct-manipulation commit graph — drag a branch
onto another to merge, double-click to checkout, multiple named stashes.

Working name; easy to rename later.

## Stack

- **Electron** (app shell) + **Vite** (`electron-vite`) for fast HMR
- **React + TypeScript** in the renderer
- Real `git` binary spawned from the main process (no library linking)
- Commit graph rendered on `<canvas>` (kept as a shell-independent component)

## Status

Phase 1 — skeleton: open a repository, run `git log`, list commits.

## Scripts

```bash
npm install      # install dependencies
npm run dev      # launch with hot reload
npm run build    # production build
npm run typecheck
```
