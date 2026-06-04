import type { Commit } from '../../../shared/types'

export interface GraphNode {
  hash: string
  row: number
  lane: number
}

export interface GraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  /** Lane index used to pick the edge color. */
  lane: number
  /** True when this edge goes to a non-first parent (a merge). */
  merge: boolean
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  laneCount: number
  byHash: Map<string, GraphNode>
}

/**
 * Assigns each commit a row and a lane, then derives the edges to its parents.
 *
 * Commits are expected in topological order (child before parent, as produced
 * by `git log --topo-order`). We walk top to bottom maintaining a set of
 * "active lanes", where each lane carries the hash of the commit it expects to
 * reach next. A commit takes the lane that was waiting for it (or a fresh lane
 * if it is a branch tip); its first parent inherits that lane and any extra
 * parents (merges) open new lanes.
 *
 * Pure and shell-independent on purpose — it can be unit-tested and reused
 * outside this Electron app.
 */
export function computeLayout(commits: Commit[]): GraphLayout {
  const lanes: (string | null)[] = []
  const nodes: GraphNode[] = []
  const byHash = new Map<string, GraphNode>()

  function firstFreeLane(): number {
    const idx = lanes.indexOf(null)
    return idx === -1 ? lanes.length : idx
  }

  let laneCount = 0

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]

    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      lane = firstFreeLane()
      lanes[lane] = commit.hash
    }

    // Converging merges: free any other lanes that also expected this commit.
    for (let k = 0; k < lanes.length; k++) {
      if (k !== lane && lanes[k] === commit.hash) {
        lanes[k] = null
      }
    }

    const node: GraphNode = { hash: commit.hash, row, lane }
    nodes.push(node)
    byHash.set(commit.hash, node)

    // First parent continues in this lane; extra parents open new lanes.
    if (commit.parents.length === 0) {
      lanes[lane] = null
    } else {
      lanes[lane] = commit.parents[0]
      for (let pi = 1; pi < commit.parents.length; pi++) {
        const parent = commit.parents[pi]
        if (lanes.indexOf(parent) === -1) {
          lanes[firstFreeLane()] = parent
        }
      }
    }

    laneCount = Math.max(laneCount, lanes.length)
  }

  // Edges, now that every reachable commit has a placement.
  const edges: GraphEdge[] = []
  for (const commit of commits) {
    const child = byHash.get(commit.hash)
    if (!child) {
      continue
    }
    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentNode = byHash.get(commit.parents[pi])
      if (!parentNode) {
        continue
      }
      edges.push({
        fromRow: child.row,
        fromLane: child.lane,
        toRow: parentNode.row,
        toLane: parentNode.lane,
        lane: pi === 0 ? child.lane : parentNode.lane,
        merge: pi > 0
      })
    }
  }

  return { nodes, edges, laneCount, byHash }
}
