import { useEffect, useRef } from 'react'
import type { Commit } from '../../../shared/types'
import { computeLayout } from './layout'

const LANE_WIDTH = 18
const MIN_LANE_WIDTH = 5
const NODE_RADIUS = 5.5
const MARGIN_LEFT = 14
const MAX_GUTTER = 220

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

/** Nearest scrollable ancestor, so we can window the canvas to the viewport. */
function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node
    }
    node = node.parentElement
  }
  return document.scrollingElement as HTMLElement
}

interface Props {
  commits: Commit[]
  rowHeight: number
  selectedHash?: string | null
}

/**
 * Canvas graph renderer with viewport windowing: the canvas is sticky to the
 * top of the scroll area and only the visible row range is painted on each
 * scroll frame. This keeps it crisp (full DPR) and unbounded by the browser's
 * max canvas height, however large the history is.
 */
function GitGraph({ commits, rowHeight, selectedHash }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) {
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
    const totalHeight = commits.length * rowHeight

    wrapper.style.width = `${width}px`
    wrapper.style.height = `${totalHeight}px`
    canvas.style.width = `${width}px`

    const scrollParent = findScrollParent(wrapper)
    const laneX = (lane: number): number => MARGIN_LEFT + lane * laneWidth
    const rowY = (row: number): number => row * rowHeight + rowHeight / 2

    function draw(): void {
      if (!canvas) {
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return
      }
      const scrollTop = scrollParent.scrollTop
      const viewHeight = Math.min(scrollParent.clientHeight || totalHeight, totalHeight)
      const dpr = window.devicePixelRatio || 1

      canvas.style.height = `${viewHeight}px`
      canvas.width = Math.ceil(width * dpr)
      canvas.height = Math.ceil(viewHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, viewHeight)
      // Shift world coordinates so the visible window maps onto the canvas.
      ctx.translate(0, -scrollTop)

      const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2)
      const lastRow = Math.min(
        commits.length - 1,
        Math.ceil((scrollTop + viewHeight) / rowHeight) + 2
      )

      // Selection band across the full graph width.
      if (selectedHash) {
        const selectedNode = layout.byHash.get(selectedHash)
        if (
          selectedNode &&
          selectedNode.row >= firstRow &&
          selectedNode.row <= lastRow
        ) {
          ctx.fillStyle = '#3a3320'
          ctx.fillRect(0, selectedNode.row * rowHeight, width, rowHeight)
        }
      }

      // Edges first, so nodes sit on top of them.
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const edge of layout.edges) {
        if (edge.toRow < firstRow - 1 || edge.fromRow > lastRow + 1) {
          continue
        }
        const x1 = laneX(edge.fromLane)
        const y1 = rowY(edge.fromRow)
        const x2 = laneX(edge.toLane)
        const y2 = rowY(edge.toRow)

        ctx.strokeStyle = colorForLane(edge.lane)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        if (x1 === x2) {
          ctx.lineTo(x2, y2)
        } else if (edge.merge) {
          const bend = Math.min(y1 + rowHeight, y2)
          ctx.bezierCurveTo(x1, (y1 + bend) / 2, x2, (y1 + bend) / 2, x2, bend)
          ctx.lineTo(x2, y2)
        } else {
          const bend = Math.max(y2 - rowHeight, y1)
          ctx.lineTo(x1, bend)
          ctx.bezierCurveTo(x1, (bend + y2) / 2, x2, (bend + y2) / 2, x2, y2)
        }
        ctx.stroke()
      }

      // Thin connector from the left edge to nodes that carry a ref label.
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
      for (let row = firstRow; row <= lastRow; row++) {
        const commit = commits[row]
        if (!commit || commit.refs.length === 0) {
          continue
        }
        const node = layout.byHash.get(commit.hash)
        if (!node) {
          continue
        }
        const y = rowY(node.row)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(laneX(node.lane) - nodeRadius, y)
        ctx.stroke()
      }

      // Nodes on top — a bg-coloured halo, then a filled coloured dot.
      for (const node of layout.nodes) {
        if (node.row < firstRow || node.row > lastRow) {
          continue
        }
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
    }

    let frame = 0
    function scheduleDraw(): void {
      if (frame) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        draw()
      })
    }

    draw()
    scrollParent.addEventListener('scroll', scheduleDraw, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleDraw)
    resizeObserver.observe(scrollParent)

    return () => {
      scrollParent.removeEventListener('scroll', scheduleDraw)
      resizeObserver.disconnect()
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [commits, rowHeight, selectedHash])

  return (
    <div ref={wrapperRef} className="git-graph-col">
      <canvas ref={canvasRef} className="git-graph" />
    </div>
  )
}

export default GitGraph
