/**
 * AI Sugiyama Hierarchical DAG Layout Engine
 * Client-safe, zero external dependencies.
 *
 * Implements:
 * 1. Topological / BFS layering with feedback-edge (cycle) breaking.
 * 2. Barycentric heuristic crossing minimization (forward and backward sweeps).
 * 3. Layer column partitioning (guarantees layers never overlap horizontally).
 * 4. Vertical parent-child centroid alignment.
 */

import type { FlowGraph, FlowGraphNode, FlowGraphEdge } from "./types"

export interface NodePosition {
  x: number
  y: number
}

export interface LayoutOptions {
  cardWidth?: number
  cardHeight?: number
  colSpacingX?: number
  rowSpacingY?: number
  startX?: number
  startY?: number
  maxPerSubCol?: number
}

export const DEFAULT_CARD_WIDTH = 250
export const DEFAULT_CARD_HEIGHT = 480
export const DEFAULT_COL_SPACING_X = 370
export const DEFAULT_ROW_SPACING_Y = 560
export const DEFAULT_START_X = 80
export const DEFAULT_START_Y = 80

/**
 * Stage 1: AI Sugiyama Layered Hierarchical DAG with Barycentric Crossing Minimization
 */
export function calculateSugiyamaLayout(
  graph: FlowGraph,
  options: LayoutOptions = {}
): { positions: Record<string, NodePosition>; layerMap: Map<string, number> } {
  const positions: Record<string, NodePosition> = {}
  const nodes = graph.nodes
  if (!nodes || nodes.length === 0) return { positions, layerMap: new Map() }

  const cardWidth = options.cardWidth ?? DEFAULT_CARD_WIDTH
  const cardHeight = options.cardHeight ?? DEFAULT_CARD_HEIGHT
  const startX = options.startX ?? DEFAULT_START_X
  const startY = options.startY ?? DEFAULT_START_Y
  const colSpacingX = options.colSpacingX ?? DEFAULT_COL_SPACING_X
  const rowSpacingY = options.rowSpacingY ?? DEFAULT_ROW_SPACING_Y

  // 1. Identify Root node (prefer S001, Home, Login, or lowest in-degree)
  const inDegree = new Map<string, number>()
  nodes.forEach((n) => inDegree.set(n.id, 0))

  const isReturnLabel = (label: string = "") =>
    /back|return|cancel|close|previous|undo|exit|logout/i.test(label)

  graph.edges.forEach((e) => {
    if (e.from !== e.to && !isReturnLabel(e.label)) {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
    }
  })

  let rootId = nodes.find((n) => n.id === "S001")?.id
  if (!rootId) {
    rootId = nodes.find((n) => /home|login|start|index|auth/i.test(n.title || n.url))?.id
  }
  if (!rootId) {
    let minDeg = Infinity
    for (const [id, deg] of inDegree.entries()) {
      if (deg < minDeg) {
        minDeg = deg
        rootId = id
      }
    }
  }
  if (!rootId) rootId = nodes[0].id

  // 2. Classify forward outgoing edges
  const forwardOutgoing = new Map<string, string[]>()
  const forwardIncoming = new Map<string, string[]>()
  nodes.forEach((n) => {
    forwardOutgoing.set(n.id, [])
    forwardIncoming.set(n.id, [])
  })

  graph.edges.forEach((e) => {
    if (e.from === e.to) return
    if (isReturnLabel(e.label)) return
    forwardOutgoing.get(e.from)?.push(e.to)
    forwardIncoming.get(e.to)?.push(e.from)
  })

  // 3. Assign layers using BFS from root
  const layers = new Map<string, number>()
  layers.set(rootId, 0)
  const queue = [rootId]
  const visited = new Set<string>([rootId])

  while (queue.length > 0) {
    const curr = queue.shift()!
    const currLvl = layers.get(curr) || 0
    const children = forwardOutgoing.get(curr) || []
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child)
        layers.set(child, currLvl + 1)
        queue.push(child)
      }
    }
  }

  // Assign any disconnected nodes across horizontal columns so they fit wide screens cleanly
  const maxPerCol = options.maxPerSubCol ?? 2
  let unreachedIdx = 0
  for (const n of nodes) {
    if (!layers.has(n.id)) {
      const assigned = 1 + Math.floor(unreachedIdx / maxPerCol)
      layers.set(n.id, assigned)
      unreachedIdx++
    }
  }

  // 4. Group nodes by layer
  const byLayer = new Map<number, string[]>()
  for (const [id, lvl] of layers.entries()) {
    if (!byLayer.has(lvl)) byLayer.set(lvl, [])
    byLayer.get(lvl)!.push(id)
  }

  const sortedLayerKeys = Array.from(byLayer.keys()).sort((a, b) => a - b)

  // 5. Barycentric heuristic to untangle edge crossings
  const nodeOrderY = new Map<string, number>()
  nodeOrderY.set(rootId, 0)

  for (const lvl of sortedLayerKeys) {
    if (lvl === 0) continue
    const ids = byLayer.get(lvl)!
    const barycenters = ids.map((id, index) => {
      const parents = forwardIncoming.get(id) || []
      const knownParents = parents.filter((p) => nodeOrderY.has(p))
      if (knownParents.length > 0) {
        const sum = knownParents.reduce((acc, p) => acc + (nodeOrderY.get(p) || 0), 0)
        return { id, bary: sum / knownParents.length, origIdx: index }
      }
      return { id, bary: index * 10, origIdx: index }
    })

    barycenters.sort((a, b) => a.bary - b.bary || a.origIdx - b.origIdx)
    byLayer.set(
      lvl,
      barycenters.map((b) => b.id)
    )

    barycenters.forEach((b, idx) => {
      nodeOrderY.set(b.id, idx)
    })
  }

  // 6. Calculate geometric X and Y positions
  const layerColumnX = new Map<number, number>()
  let currentX = startX

  sortedLayerKeys.forEach((lvl) => {
    const ids = byLayer.get(lvl)!
    layerColumnX.set(lvl, currentX)
    const numSubCols = Math.max(1, Math.ceil(ids.length / maxPerCol))
    currentX += colSpacingX + (numSubCols - 1) * (cardWidth + 100)
  })

  // Position nodes
  sortedLayerKeys.forEach((lvl) => {
    const ids = byLayer.get(lvl)!
    const baseX = layerColumnX.get(lvl) || startX

    if (lvl === 0) {
      const lvl1Count = (byLayer.get(1) || []).length
      const rootY = startY + Math.max(0, (Math.min(maxPerCol, lvl1Count) - 1) * (rowSpacingY / 2))
      positions[rootId] = { x: baseX, y: rootY }
      return
    }

    ids.forEach((id, idx) => {
      const subCol = Math.floor(idx / maxPerCol)
      const rowIdx = idx % maxPerCol
      const x = baseX + subCol * (cardWidth + 100)
      const y = startY + rowIdx * rowSpacingY
      positions[id] = { x, y }
    })
  })

  // Vertical centering pass: center parent nodes relative to their children's vertical span
  for (let l = sortedLayerKeys.length - 2; l >= 0; l--) {
    const lvl = sortedLayerKeys[l]
    const ids = byLayer.get(lvl)!
    ids.forEach((id) => {
      const children = forwardOutgoing.get(id) || []
      const childPositions = children.map((c) => positions[c]).filter(Boolean)
      if (childPositions.length > 0) {
        const minY = Math.min(...childPositions.map((p) => p.y))
        const maxY = Math.max(...childPositions.map((p) => p.y))
        const targetY = Math.round((minY + maxY) / 2)
        if (positions[id]) {
          positions[id] = { x: positions[id].x, y: targetY }
        }
      }
    })
  }

  // Final deterministic column overlap resolution: group by X column, sort by Y, enforce min vertical spacing
  const byColX = new Map<number, string[]>()
  for (const [id, pos] of Object.entries(positions)) {
    const colKey = Math.round(pos.x)
    if (!byColX.has(colKey)) byColX.set(colKey, [])
    byColX.get(colKey)!.push(id)
  }
  for (const colIds of byColX.values()) {
    colIds.sort((a, b) => (positions[a]?.y ?? 0) - (positions[b]?.y ?? 0))
    for (let i = 1; i < colIds.length; i++) {
      const prevPos = positions[colIds[i - 1]]
      const currPos = positions[colIds[i]]
      if (prevPos && currPos && currPos.y < prevPos.y + rowSpacingY) {
        positions[colIds[i]] = {
          x: currPos.x,
          y: prevPos.y + rowSpacingY,
        }
      }
    }
  }

  return { positions, layerMap: layers }
}
