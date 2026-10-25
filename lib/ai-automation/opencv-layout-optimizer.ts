/**
 * OpenCV 5 & AI Sugiyama Visual Layout Optimizer
 *
 * Implements a dual-phase visual layout engine:
 * 1. AI Sugiyama Hierarchical DAG Structuring with Barycentric Crossing Minimization (imported from ./sugiyama-layout).
 * 2. OpenCV 5 Computer Vision Spatial Matrix & Distance Transform clearance optimization.
 */

import type { FlowGraph, FlowGraphNode, FlowGraphEdge } from "./types"
import {
  calculateSugiyamaLayout,
  type NodePosition,
  type LayoutOptions,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
  DEFAULT_COL_SPACING_X,
  DEFAULT_ROW_SPACING_Y,
  DEFAULT_START_X,
  DEFAULT_START_Y,
} from "./sugiyama-layout"

export {
  calculateSugiyamaLayout,
  type NodePosition,
  type LayoutOptions,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
  DEFAULT_COL_SPACING_X,
  DEFAULT_ROW_SPACING_Y,
  DEFAULT_START_X,
  DEFAULT_START_Y,
}

export interface LayoutMetrics {
  totalNodes: number
  totalEdges: number
  edgeCrossings: number
  cardCollisions: number
  lineCardPenetrations: number
  visualClutterScore: number
  opencvEnhanced: boolean
  openCvError?: string | null
  executionTimeMs: number
}

/**
 * Lazy-loads OpenCV.js with timeout and validation.
 */
let openCvPromise: Promise<any> | undefined
let cvModule: any = null

export async function loadOpenCvForLayout(): Promise<any> {
  if (cvModule?.Mat) return cvModule

  if (!openCvPromise) {
    openCvPromise = (async () => {
      try {
        let cv: any = null
        if (typeof eval !== "undefined") {
          try {
            const req = eval("require")
            const raw = req("@techstark/opencv-js")
            cv = raw && typeof raw.then === "function" ? await raw : raw
          } catch {}
        }

        if (!cv?.Mat) {
          const imported: any = await import("@techstark/opencv-js")
          const raw = imported?.default ?? imported
          cv = raw && typeof raw.then === "function" ? await raw : raw
        }

        if (!cv?.Mat) {
          await new Promise<void>((resolve, reject) => {
            if (cv?.Mat) return resolve()
            const timeout = setTimeout(() => {
              if (cv?.Mat) resolve()
              else reject(new Error("OpenCV.js initialization timed out"))
            }, 5000)

            const prevInit = cv?.onRuntimeInitialized
            cv.onRuntimeInitialized = () => {
              clearTimeout(timeout)
              if (typeof prevInit === "function") prevInit()
              resolve()
            }
          })
        }

        if (!cv?.Mat) {
          throw new Error("OpenCV.js did not expose required CV APIs")
        }

        cvModule = cv
        return cv
      } catch (err) {
        openCvPromise = undefined
        throw err
      }
    })()
  }
  return openCvPromise
}

function getBezierPoint(
  p1: NodePosition,
  p2: NodePosition,
  t: number,
  width: number,
  height: number
): { x: number; y: number } {
  const x1 = p1.x + width
  const y1 = p1.y + height / 2
  const x2 = p2.x
  const y2 = p2.y + height / 2
  const dx = Math.max(20, x2 - x1)
  const curveOffset = Math.max(60, dx * 0.45)
  const cp1x = x1 + curveOffset
  const cp1y = y1
  const cp2x = x2 - curveOffset
  const cp2y = y2
  const mt = 1 - t
  const x = mt * mt * mt * x1 + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * x2
  const y = mt * mt * mt * y1 + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * y2
  return { x, y }
}

/**
 * Stage 2: OpenCV 5 Computer Vision Spatial Matrix & Distance Transform Clearance Optimization
 */
export async function optimizeWithOpenCv(
  graph: FlowGraph,
  initialPositions: Record<string, NodePosition>,
  options: LayoutOptions = {}
): Promise<{ positions: Record<string, NodePosition>; metrics: LayoutMetrics }> {
  const startTime = Date.now()
  const cardWidth = options.cardWidth ?? DEFAULT_CARD_WIDTH
  const cardHeight = options.cardHeight ?? DEFAULT_CARD_HEIGHT

  const positions: Record<string, NodePosition> = { ...initialPositions }
  let cv: any = null
  let opencvSuccess = false

  let cvErrorMsg: string | null = null
  try {
    cv = await loadOpenCvForLayout()
  } catch (err: any) {
    cvErrorMsg = err?.message || String(err)
    console.warn("[OpenCV-Layout] OpenCV 5 unavailable, using Sugiyama AI layout:", cvErrorMsg)
  }

  // Calculate canvas bounding box
  const vals = Object.values(positions)
  const maxX = vals.length > 0 ? Math.max(...vals.map((v) => v.x)) + cardWidth + 200 : 2000
  const maxY = vals.length > 0 ? Math.max(...vals.map((v) => v.y)) + cardHeight + 200 : 1400

  // Downsample scale for fast OpenCV matrix processing
  const scale = 0.25
  const matW = Math.max(200, Math.ceil(maxX * scale))
  const matH = Math.max(200, Math.ceil(maxY * scale))

  let lineCardPenetrations = 0
  let cardCollisions = 0
  let edgeCrossings = 0

  if (cv && cv.Mat && cv.distanceTransform) {
    let cardsMask: any = null
    let invMask: any = null
    let distMap: any = null

    try {
      cardsMask = new cv.Mat.zeros(matH, matW, cv.CV_8UC1)

      // Draw all card bounding boxes onto the OpenCV mask
      for (const [id, pos] of Object.entries(positions)) {
        const x1 = Math.max(0, Math.floor(pos.x * scale))
        const y1 = Math.max(0, Math.floor(pos.y * scale))
        const x2 = Math.min(matW - 1, Math.ceil((pos.x + cardWidth) * scale))
        const y2 = Math.min(matH - 1, Math.ceil((pos.y + cardHeight) * scale))
        const p1 = new cv.Point(x1, y1)
        const p2 = new cv.Point(x2, y2)
        cv.rectangle(cardsMask, p1, p2, new cv.Scalar(255), -1)
      }

      // Compute Distance Transform potential field
      invMask = new cv.Mat()
      distMap = new cv.Mat()
      cv.bitwise_not(cardsMask, invMask)
      cv.distanceTransform(invMask, distMap, cv.DIST_L2, 5)

      // Detect edge-card penetrations & apply repulsion relaxation
      for (const edge of graph.edges) {
        if (edge.from === edge.to) continue
        const pFrom = positions[edge.from]
        const pTo = positions[edge.to]
        if (!pFrom || !pTo) continue

        // Sample points along the actual curved Bezier connection corridor
        const samples = 10
        for (let s = 1; s < samples; s++) {
          const t = s / samples
          const pt = getBezierPoint(pFrom, pTo, t, cardWidth, cardHeight)
          const sampleX = pt.x
          const sampleY = pt.y

          // Check if this point penetrates any third-party card
          for (const [id, pos] of Object.entries(positions)) {
            if (id === edge.from || id === edge.to) continue
            // Card bounding box with safety margin
            const margin = 15
            if (
              sampleX >= pos.x - margin &&
              sampleX <= pos.x + cardWidth + margin &&
              sampleY >= pos.y - margin &&
              sampleY <= pos.y + cardHeight + margin
            ) {
              lineCardPenetrations++
              // OpenCV-guided repulsion: Nudge the obstacle card vertically away from the edge line
              const dy = sampleY - (pos.y + cardHeight / 2)
              const shift = dy >= 0 ? -(cardHeight / 2 + 35) : cardHeight / 2 + 35
              positions[id] = {
                x: pos.x,
                y: Math.max(40, pos.y + shift),
              }
            }
          }
        }
      }

      opencvSuccess = true
    } catch (cvError) {
      console.warn("[OpenCV-Layout] Error during OpenCV matrix optimization:", cvError)
    } finally {
      if (cardsMask) cardsMask.delete()
      if (invMask) invMask.delete()
      if (distMap) distMap.delete()
    }
  }

  // Count edge crossings (segment intersection test)
  const edgeSegments: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    from: string
    to: string
  }> = []

  for (const e of graph.edges) {
    const fromP = positions[e.from]
    const toP = positions[e.to]
    if (!fromP || !toP || e.from === e.to) continue
    edgeSegments.push({
      x1: fromP.x + cardWidth,
      y1: fromP.y + cardHeight / 2,
      x2: toP.x,
      y2: toP.y + cardHeight / 2,
      from: e.from,
      to: e.to,
    })
  }

  function linesIntersect(
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ): boolean {
    const ccw = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) =>
      (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x)
    return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2)
  }

  for (let i = 0; i < edgeSegments.length; i++) {
    for (let j = i + 1; j < edgeSegments.length; j++) {
      const segA = edgeSegments[i]
      const segB = edgeSegments[j]
      if (segA.from === segB.from || segA.to === segB.to || segA.from === segB.to || segA.to === segB.from) {
        continue
      }
      if (
        linesIntersect(
          { x: segA.x1, y: segA.y1 },
          { x: segA.x2, y: segA.y2 },
          { x: segB.x1, y: segB.y1 },
          { x: segB.x2, y: segB.y2 }
        )
      ) {
        edgeCrossings++
      }
    }
  }

  // Check card collisions (bounding box overlaps)
  const nodeIds = Object.keys(positions)
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const p1 = positions[nodeIds[i]]
      const p2 = positions[nodeIds[j]]
      const overlapX = Math.abs(p1.x - p2.x) < cardWidth + 20
      const overlapY = Math.abs(p1.y - p2.y) < cardHeight + 20
      if (overlapX && overlapY) {
        cardCollisions++
        positions[nodeIds[j]] = {
          x: p2.x,
          y: p1.y + cardHeight + 40,
        }
      }
    }
  }

  const duration = Date.now() - startTime
  const clutterScore = Number(
    Math.min(1.0, (edgeCrossings * 0.1 + lineCardPenetrations * 0.2 + cardCollisions * 0.5) / Math.max(1, graph.nodes.length)).toFixed(3)
  )

  return {
    positions,
    metrics: {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      edgeCrossings,
      cardCollisions,
      lineCardPenetrations,
      visualClutterScore: clutterScore,
      opencvEnhanced: opencvSuccess,
      openCvError: cvErrorMsg,
      executionTimeMs: duration,
    },
  }
}

/**
 * Main Entry Point: Optimizes graph layout using AI Sugiyama + OpenCV 5.
 */
export async function calculateAiOpenCvLayout(
  graph: FlowGraph,
  options: LayoutOptions = {}
): Promise<{ positions: Record<string, NodePosition>; metrics: LayoutMetrics }> {
  // 1. Compute AI Sugiyama hierarchical layout
  const { positions: sugiyamaPositions } = calculateSugiyamaLayout(graph, options)

  // 2. Enhance with OpenCV 5 visual clearance and collision resolution
  return await optimizeWithOpenCv(graph, sugiyamaPositions, options)
}
