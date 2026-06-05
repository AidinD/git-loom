import { useEffect, useRef } from 'react'
import type { Commit } from '../../../shared/types'
import { computeLayout } from './layout'

const LANE_WIDTH = 18
const MIN_LANE_WIDTH = 5
const NODE_RADIUS = 5.5
const MARGIN_LEFT = 14
const MAX_GUTTER = 220
const MAX_PHYSICAL = 16384

const PALETTE = [
  '#6ea8fe',
  '#f7768e',
  '#9ece6a',
  '#e0af68',
  '#bb9af7',
  '#7dcfff',
  '#ff9e64',
  '#73daca'
]

function colorForLane(lane: number): string {
  return PALETTE[lane % PALETTE.length]
}

interface Props {
  commits: Commit[]
  rowHeight: number
  selectedHash?: string | null
}

function GitGraph({ commits, rowHeight, selectedHash }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const layout = computeLayout(commits)
    // Shrink lane spacing when there are many concurrent branches so the gutter
    // stays bounded instead of growing arbitrarily wide.
    const laneWidth =
      layout.laneCount > 1
        ? Math.max(
            MIN_LANE_WIDTH,
            Math.min(
              LANE_WIDTH,
              Math.floor((MAX_GUTTER - MARGIN_LEFT * 2) / (layout.laneCount - 1))
            )
          )
        : LANE_WIDTH
    const nodeRadius = Math.max(2.5, Math.min(NODE_RADIUS, laneWidth / 2.5))
    const width =
      MARGIN_LEFT * 2 + Math.max(0, layout.laneCount - 1) * laneWidth + nodeRadius * 2
    const height = commits.length * rowHeight

    const baseDpr = window.devicePixelRatio || 1
    const dpr = height * baseDpr <= MAX_PHYSICAL ? baseDpr : 1

    canvas.width = Math.ceil(width * dpr)
    canvas.height = Math.ceil(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const laneX = (lane: number): number => MARGIN_LEFT + lane * laneWidth
    const rowY = (row: number): number => row * rowHeight + rowHeight / 2

    // Highlight the selected commit's row so the selection reads across the
    // refs column, the graph, and the message list as one continuous band.
    if (selectedHash) {
      const selectedNode = layout.byHash.get(selectedHash)
      if (selectedNode) {
        ctx.fillStyle = '#3a3320'
        ctx.fillRect(0, selectedNode.row * rowHeight, width, rowHeight)
      }
    }

    // Edges first, so nodes sit on top of them.
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const edge of layout.edges) {
      const x1 = laneX(edge.fromLane)
      const y1 = rowY(edge.fromRow)
      const x2 = laneX(edge.toLane)
      const y2 = rowY(edge.toRow)

      ctx.strokeStyle = colorForLane(edge.lane)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      if (x1 === x2) {
        // Same lane: a straight vertical segment.
        ctx.lineTo(x2, y2)
      } else if (edge.merge) {
        // Merge: curve out of the merge commit at the top, then descend the
        // merged branch's own lane straight down to its parent.
        const bend = Math.min(y1 + rowHeight, y2)
        ctx.bezierCurveTo(x1, (y1 + bend) / 2, x2, (y1 + bend) / 2, x2, bend)
        ctx.lineTo(x2, y2)
      } else {
        // Branch line: descend the child's lane, then curve into the parent's
        // lane over the last row before the parent.
        const bend = Math.max(y2 - rowHeight, y1)
        ctx.lineTo(x1, bend)
        ctx.bezierCurveTo(x1, (bend + y2) / 2, x2, (bend + y2) / 2, x2, y2)
      }
      ctx.stroke()
    }

    // Nodes on top — a bg-coloured halo separates the node from the lines
    // passing nearby, then a filled coloured dot (GitKraken-ish).
    for (const node of layout.nodes) {
      const x = laneX(node.lane)
      const y = rowY(node.row)
      ctx.beginPath()
      ctx.arc(x, y, nodeRadius + 2, 0, Math.PI * 2)
      ctx.fillStyle = '#1e1e22'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2)
      ctx.fillStyle = colorForLane(node.lane)
      ctx.fill()
    }
  }, [commits, rowHeight, selectedHash])

  return <canvas ref={canvasRef} className="git-graph" />
}

export default GitGraph
