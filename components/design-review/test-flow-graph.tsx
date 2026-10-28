"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import type {
  FlowGraph,
  AppScreenNode,
  TestPlanStep,
  AppWorkflowTransition,
  FullAppTestPlan,
} from "@/lib/ai-automation/types"
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  LayoutGrid,
  GripVertical,
  Layers,
  Sparkles,
  ExternalLink,
  Eye,
  MousePointer,
  Compass,
  Columns,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Check,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
  FileCode,
  Monitor,
  Tablet,
} from "lucide-react"
import { generateAppMapHtml } from "@/lib/ai-automation/map-html-exporter"

interface TestFlowGraphProps {
  graph: FlowGraph
  screens?: AppScreenNode[]
  steps?: TestPlanStep[]
  transitions?: AppWorkflowTransition[]
  plan?: FullAppTestPlan
  onSelectScreen?: (screenId: string) => void
  onDeleteScreen?: (screenId: string) => void
  onViewScreenshot?: (url: string) => void
  onOpenMapPage?: () => void
  isBesideScreen?: boolean
  onToggleBesideScreen?: () => void
  isFullStage?: boolean
  onToggleFullStage?: () => void
  onCloseBeside?: () => void
}

import { calculateSugiyamaLayout } from "@/lib/ai-automation/sugiyama-layout"

interface NodePos {
  x: number
  y: number
}

const CARD_WIDTH = 268
const CARD_HEIGHT = 510

/**
 * Calculates default left-to-right hierarchical tree positions for phone screens
 * Root screen on the left, child screens organized with Sugiyama crossing reduction
 */
function calculateDefaultLayout(graph: FlowGraph): Record<string, NodePos> {
  return calculateSugiyamaLayout(graph, {
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    colSpacingX: 360,
    rowSpacingY: 560,
    maxPerSubCol: 2,
  }).positions
}

/**
 * Calculates a smart cubic Bezier curve between two cards so connecting lines
 * anchor to edges instead of passing underneath cards.
 */
function getSmartBezier(
  fromPos: NodePos,
  toPos: NodePos,
  width: number,
  height: number
): { path: string; midX: number; midY: number } {
  let x1: number
  let y1: number
  let x2: number
  let y2: number
  let cp1x: number
  let cp1y: number
  let cp2x: number
  let cp2y: number

  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y

  // Self-loop (intra-screen action / click returning to same screen)
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
    x1 = fromPos.x + width * 0.75
    y1 = fromPos.y
    x2 = fromPos.x + width
    y2 = fromPos.y + height * 0.25
    const loopOffset = 50
    cp1x = x1
    cp1y = y1 - loopOffset
    cp2x = x2 + loopOffset
    cp2y = y2
    const midX = fromPos.x + width + loopOffset * 0.45
    const midY = fromPos.y - loopOffset * 0.45
    return {
      path: `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`,
      midX,
      midY,
    }
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominant
    if (dx >= 0) {
      // Source is left of Target -> Right anchor to Left anchor
      x1 = fromPos.x + width
      y1 = fromPos.y + height / 2
      x2 = toPos.x
      y2 = toPos.y + height / 2
      const curveOffset = Math.max(60, dx * 0.45)
      cp1x = x1 + curveOffset
      cp1y = y1
      cp2x = x2 - curveOffset
      cp2y = y2
    } else {
      // Source is right of Target -> Backward return path curves gracefully underneath
      x1 = fromPos.x
      y1 = fromPos.y + height * 0.8
      x2 = toPos.x + width
      y2 = toPos.y + height * 0.8
      const curveOffset = Math.max(70, Math.abs(dx) * 0.35)
      // Droop proportional to span so long return jumps don't slice middle cards
      const arcDroop = Math.min(130, Math.max(55, Math.abs(dx) * 0.12))
      cp1x = x1 - curveOffset
      cp1y = y1 + arcDroop
      cp2x = x2 + curveOffset
      cp2y = y2 + arcDroop
    }
  } else {
    // Vertical dominant
    if (dy >= 0) {
      // Source is above Target -> Bottom anchor to Top anchor
      x1 = fromPos.x + width / 2
      y1 = fromPos.y + height
      x2 = toPos.x + width / 2
      y2 = toPos.y
      const curveOffset = Math.max(50, dy * 0.45)
      cp1x = x1
      cp1y = y1 + curveOffset
      cp2x = x2
      cp2y = y2 - curveOffset
    } else {
      // Source is below Target -> Top anchor to Bottom anchor
      x1 = fromPos.x + width / 2
      y1 = fromPos.y
      x2 = toPos.x + width / 2
      y2 = toPos.y + height
      const curveOffset = Math.max(50, Math.abs(dy) * 0.45)
      cp1x = x1
      cp1y = y1 - curveOffset
      cp2x = x2
      cp2y = y2 + curveOffset
    }
  }

  // Midpoint calculation for cubic bezier at t = 0.5
  const t = 0.5
  const midX =
    Math.pow(1 - t, 3) * x1 +
    3 * Math.pow(1 - t, 2) * t * cp1x +
    3 * (1 - t) * Math.pow(t, 2) * cp2x +
    Math.pow(t, 3) * x2
  const midY =
    Math.pow(1 - t, 3) * y1 +
    3 * Math.pow(1 - t, 2) * t * cp1y +
    3 * (1 - t) * Math.pow(t, 2) * cp2y +
    Math.pow(t, 3) * y2

  const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
  return { path, midX, midY }
}

export default function TestFlowGraph({
  graph,
  screens,
  steps,
  transitions,
  plan,
  onSelectScreen,
  onDeleteScreen,
  onViewScreenshot,
  onOpenMapPage,
  isBesideScreen = false,
  onToggleBesideScreen,
  isFullStage = false,
  onToggleFullStage,
  onCloseBeside,
}: TestFlowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Full screen toggle state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // OpenCV & AI Auto-Layout state
  const [isOptimizingLayout, setIsOptimizingLayout] = useState(false)
  const [layoutToast, setLayoutToast] = useState<{ message: string; sub?: string } | null>(null)

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 })

  // Node Positions (movable cards)
  const [nodePositions, setNodePositions] = useState<Record<string, NodePos>>(() =>
    calculateDefaultLayout(graph)
  )

  // Figma Multi-Selection & Tool Mode State
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select")
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const isMarqueeRef = useRef(false)

  // Active dragging card (supports moving single card OR entire multi-selection group together)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, nodeX: 0, nodeY: 0 })
  const groupDragInitialPosRef = useRef<Record<string, NodePos>>({})
  const hasDraggedRef = useRef(false)

  // Card Inspector state ("Big Card & Side Operations")
  const [inspectingNodeId, setInspectingNodeId] = useState<string | null>(null)
  const [inspectorSubTab, setInspectorSubTab] = useState<"operations" | "transitions" | "elements">("operations")
  const [operationFilter, setOperationFilter] = useState<"all" | "passed" | "failed">("all")
  const [evidencePreviewModal, setEvidencePreviewModal] = useState<string | null>(null)

  // Navigation line visibility filters: Forward vs Back/Return
  const [showForwardLines, setShowForwardLines] = useState(true)
  const [showReturnLines, setShowReturnLines] = useState(true)

  // Track locally deleted screen node IDs for instant UI responsiveness
  const [deletedNodeIds, setDeletedNodeIds] = useState<Set<string>>(new Set())

  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((n) => !deletedNodeIds.has(n.id))
  }, [graph.nodes, deletedNodeIds])

  const visibleEdges = useMemo(() => {
    return graph.edges.filter(
      (e) => !deletedNodeIds.has(e.from) && !deletedNodeIds.has(e.to)
    )
  }, [graph.edges, deletedNodeIds])

  const handleDeleteNode = useCallback(
    (nodeId: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      setDeletedNodeIds((prev) => {
        const next = new Set(prev)
        next.add(nodeId)
        return next
      })
      if (inspectingNodeId === nodeId) {
        setInspectingNodeId(null)
      }
      onDeleteScreen?.(nodeId)
    },
    [inspectingNodeId, onDeleteScreen]
  )

  // Automatically compute optimal Zoom & Pan so all phone screens fit cleanly inside the visible viewport
  const fitPositionsToViewport = useCallback(
    (positionsMap: Record<string, NodePos>) => {
      const activeIds = visibleNodes.map((n) => n.id)
      const coords = activeIds.map((id) => positionsMap[id]).filter(Boolean)
      if (coords.length === 0) return
      const rect = containerRef.current?.getBoundingClientRect()
      const viewW = rect?.width && rect.width > 200 ? rect.width : 1180
      const viewH = rect?.height && rect.height > 200 ? rect.height : 620

      const minX = Math.min(...coords.map((p) => p.x))
      const maxX = Math.max(...coords.map((p) => p.x + CARD_WIDTH))
      const minY = Math.min(...coords.map((p) => p.y))
      const maxY = Math.max(...coords.map((p) => p.y + CARD_HEIGHT))

      const contentW = Math.max(CARD_WIDTH, maxX - minX)
      const contentH = Math.max(CARD_HEIGHT, maxY - minY)

      // Leave comfortable margin around top toolbar & bottom dock
      const availW = Math.max(320, viewW - 96)
      const availH = Math.max(260, viewH - 120)

      const scaleX = availW / contentW
      const scaleY = availH / contentH
      const idealZoom = Math.min(0.95, Math.max(0.08, +(Math.min(scaleX, scaleY)).toFixed(2)))

      const centeredPanX = Math.round((viewW - contentW * idealZoom) / 2 - minX * idealZoom)
      const centeredPanY = Math.round(54 + (availH - contentH * idealZoom) / 2 - minY * idealZoom)

      setZoom(idealZoom)
      setPan({ x: Math.max(28, centeredPanX), y: Math.max(48, centeredPanY) })
    },
    [visibleNodes]
  )

  // Re-initialize layout and fit to screen when graph nodes change
  useEffect(() => {
    const def = calculateDefaultLayout(graph)
    setNodePositions((prev: Record<string, NodePos>) => {
      const merged = { ...def }
      for (const k of Object.keys(prev)) {
        if (merged[k]) merged[k] = prev[k]
      }
      return merged
    })
    const timer = setTimeout(() => {
      fitPositionsToViewport(def)
    }, 60)
    return () => clearTimeout(timer)
  }, [graph.nodes.length, graph.edges.length])

  // Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFullscreen])

  // Quick Screen-Friendly Layout Presets (Storyboard Row, Widescreen Grid, or AI Flow)
  const handleApplyPresetLayout = useCallback(
    (mode: "row" | "grid") => {
      const next: Record<string, NodePos> = {}
      const count = visibleNodes.length
      const cols = mode === "row" ? Math.max(1, count) : Math.max(2, Math.min(5, Math.ceil(Math.sqrt(count * 1.5))))
      visibleNodes.forEach((n, idx) => {
        const c = mode === "row" ? idx : idx % cols
        const r = mode === "row" ? 0 : Math.floor(idx / cols)
        next[n.id] = {
          x: 80 + c * (CARD_WIDTH + 90),
          y: 80 + r * (CARD_HEIGHT + 80),
        }
      })
      setNodePositions(next)
      fitPositionsToViewport(next)
      setLayoutToast({
        message: mode === "row" ? "Phone Storyboard Row Applied" : "Widescreen Phone Grid Applied",
        sub: `${count} phone screens fitted to viewport`,
      })
      setTimeout(() => setLayoutToast(null), 2800)
    },
    [visibleNodes, fitPositionsToViewport]
  )

  // Reset Layout to automatic clean tree powered by OpenCV 5 and AI Sugiyama + auto-fit to screen
  const handleResetLayout = async () => {
    // If there are very few or no connecting edges, use a clean Widescreen Grid so phones fill the screen horizontally
    if (visibleEdges.length === 0 && visibleNodes.length > 1) {
      handleApplyPresetLayout("grid")
      return
    }
    try {
      setIsOptimizingLayout(true)
      const res = await fetch("/api/ai-automation/auto-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graph,
          options: {
            cardWidth: CARD_WIDTH,
            cardHeight: CARD_HEIGHT,
            colSpacingX: 360,
            rowSpacingY: 560,
            maxPerSubCol: 2,
          },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.positions) {
          setNodePositions(data.positions)
          setShowForwardLines(true)
          setShowReturnLines(true)
          fitPositionsToViewport(data.positions)
          setLayoutToast({
            message: data.metrics?.opencvEnhanced
              ? "AI & OpenCV 5 Auto-Layout Applied"
              : "AI Sugiyama Auto-Layout Applied",
            sub: `Fitted ${visibleNodes.length} phone screens to viewport • ${data.metrics?.cardCollisions ?? 0} collisions`,
          })
          setTimeout(() => setLayoutToast(null), 3500)
          return
        }
      }
    } catch (err) {
      console.warn("[Auto-Layout] API request failed, applying local Sugiyama DAG:", err)
    } finally {
      setIsOptimizingLayout(false)
    }

    // High quality local fallback layout + auto-fit to screen
    const fallback = calculateDefaultLayout(graph)
    setNodePositions(fallback)
    setShowForwardLines(true)
    setShowReturnLines(true)
    fitPositionsToViewport(fallback)
    setLayoutToast({
      message: "AI Auto-Layout Applied",
      sub: "Fitted all phone screens cleanly to viewport",
    })
    setTimeout(() => setLayoutToast(null), 3500)
  }

  // Export standalone interactive HTML map
  const [isExportingHtml, setIsExportingHtml] = useState(false)
  const handleExportMapHtml = useCallback(() => {
    try {
      setIsExportingHtml(true)
      const html = generateAppMapHtml({
        plan,
        screens: screens || plan?.screens || [],
        transitions: transitions || plan?.transitions || [],
        title: (plan as any)?.title || plan?.targetUrl || "Interactive App Map",
        timestamp: new Date().toISOString(),
      })
      const blob = new Blob([html], { type: "text/html;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `app-map-${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export app map HTML:", err)
    } finally {
      setIsExportingHtml(false)
    }
  }, [plan, screens, transitions])

  // Zoom controls (supports zooming all the way out to 5% and in to 250%)
  const handleZoomIn = () =>
    setZoom((z: number) => {
      const step = z < 0.4 ? 0.05 : 0.15
      return Math.min(2.5, +(z + step).toFixed(2))
    })
  const handleZoomOut = () =>
    setZoom((z: number) => {
      const step = z <= 0.4 ? 0.05 : 0.15
      return Math.max(0.05, +(z - step).toFixed(2))
    })
  const handleZoomReset = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  // Mouse wheel zoom (supports both standard wheel and Ctrl/Cmd + wheel down to 5%)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const step = zoom <= 0.4 ? 0.04 : 0.08
    const delta = e.deltaY < 0 ? step : -step
    setZoom((z: number) => Math.max(0.05, Math.min(2.5, +(z + delta).toFixed(2))))
  }

  // Convert client pointer coordinates to canvas world coordinates
  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      }
    },
    [pan.x, pan.y, zoom]
  )

  // Canvas Panning & Figma Marquee Box Selection Handlers
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    const isSurface =
      target.classList.contains("canvas-bg") ||
      target.tagName === "svg" ||
      Boolean(target.dataset.canvasSurface)
    if (!isSurface) return

    // Middle mouse or Pan tool (without Shift) -> Pan canvas
    const shouldMarquee = (canvasTool === "select" && e.button === 0 && !e.altKey) || e.shiftKey
    if (shouldMarquee) {
      const worldPt = clientToWorld(e.clientX, e.clientY)
      isMarqueeRef.current = true
      setMarquee({ startX: worldPt.x, startY: worldPt.y, currentX: worldPt.x, currentY: worldPt.y })
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setSelectedNodeIds(new Set())
      }
      try {
        target.setPointerCapture(e.pointerId)
      } catch {}
    } else {
      setIsPanning(true)
      panStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      try {
        target.setPointerCapture(e.pointerId)
      } catch {}
    }
  }

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (isMarqueeRef.current && marquee) {
      const worldPt = clientToWorld(e.clientX, e.clientY)
      const nextMarquee = { ...marquee, currentX: worldPt.x, currentY: worldPt.y }
      setMarquee(nextMarquee)
      const minX = Math.min(nextMarquee.startX, nextMarquee.currentX)
      const maxX = Math.max(nextMarquee.startX, nextMarquee.currentX)
      const minY = Math.min(nextMarquee.startY, nextMarquee.currentY)
      const maxY = Math.max(nextMarquee.startY, nextMarquee.currentY)
      if (maxX - minX > 4 || maxY - minY > 4) {
        const hitIds = new Set<string>()
        visibleNodes.forEach((n, idx) => {
          const pos = nodePositions[n.id] || { x: 60 + (idx % 4) * 320, y: 60 + Math.floor(idx / 4) * 200 }
          const intersects =
            pos.x < maxX &&
            pos.x + CARD_WIDTH > minX &&
            pos.y < maxY &&
            pos.y + CARD_HEIGHT > minY
          if (intersects) hitIds.add(n.id)
        })
        setSelectedNodeIds(hitIds)
      }
    } else if (isPanning) {
      const dx = e.clientX - panStartRef.current.pointerX
      const dy = e.clientY - panStartRef.current.pointerY
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      })
    } else if (draggingNodeId) {
      const dx = (e.clientX - dragStartRef.current.pointerX) / zoom
      const dy = (e.clientY - dragStartRef.current.pointerY) / zoom
      const initialGroup = groupDragInitialPosRef.current
      const groupKeys = Object.keys(initialGroup)
      if (groupKeys.length > 1) {
        setNodePositions((prev: Record<string, NodePos>) => {
          const next = { ...prev }
          for (const id of groupKeys) {
            const base = initialGroup[id]
            if (base) {
              next[id] = { x: Math.round(base.x + dx), y: Math.round(base.y + dy) }
            }
          }
          return next
        })
      } else {
        setNodePositions((prev: Record<string, NodePos>) => ({
          ...prev,
          [draggingNodeId]: {
            x: Math.round(dragStartRef.current.nodeX + dx),
            y: Math.round(dragStartRef.current.nodeY + dy),
          },
        }))
      }
    }
  }

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (isMarqueeRef.current) {
      isMarqueeRef.current = false
      setMarquee(null)
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
    if (isPanning) {
      setIsPanning(false)
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
    if (draggingNodeId) {
      setDraggingNodeId(null)
    }
  }

  // Card Dragging Handlers (Figma single or multi-card group drag)
  const handleCardPointerDown = (nodeId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const pos = nodePositions[nodeId] || { x: 0, y: 0 }
    setDraggingNodeId(nodeId)
    hasDraggedRef.current = false
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      nodeX: pos.x,
      nodeY: pos.y,
    }

    // Determine active selection group for dragging
    let nextSelected = new Set(selectedNodeIds)
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (nextSelected.has(nodeId)) nextSelected.delete(nodeId)
      else nextSelected.add(nodeId)
      setSelectedNodeIds(nextSelected)
    } else if (!nextSelected.has(nodeId)) {
      nextSelected = new Set([nodeId])
      setSelectedNodeIds(nextSelected)
    }

    const snap: Record<string, NodePos> = {}
    nextSelected.forEach((id) => {
      if (nodePositions[id]) snap[id] = { ...nodePositions[id] }
    })
    if (!snap[nodeId]) snap[nodeId] = { ...pos }
    groupDragInitialPosRef.current = snap

    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }

  const handleCardPointerMove = (nodeId: string, e: React.PointerEvent) => {
    if (draggingNodeId === nodeId) {
      e.stopPropagation()
      const dx = (e.clientX - dragStartRef.current.pointerX) / zoom
      const dy = (e.clientY - dragStartRef.current.pointerY) / zoom
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDraggedRef.current = true
      }
      const initialGroup = groupDragInitialPosRef.current
      const groupKeys = Object.keys(initialGroup)
      if (groupKeys.length > 1) {
        setNodePositions((prev: Record<string, NodePos>) => {
          const next = { ...prev }
          for (const id of groupKeys) {
            const base = initialGroup[id]
            if (base) {
              next[id] = { x: Math.round(base.x + dx), y: Math.round(base.y + dy) }
            }
          }
          return next
        })
      } else {
        setNodePositions((prev: Record<string, NodePos>) => ({
          ...prev,
          [nodeId]: {
            x: Math.round(dragStartRef.current.nodeX + dx),
            y: Math.round(dragStartRef.current.nodeY + dy),
          },
        }))
      }
    }
  }

  const handleCardPointerUp = (nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation()
    if (draggingNodeId === nodeId) {
      setDraggingNodeId(null)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  // Figma Multi-Select Alignment & Arrangement Actions
  const handleAlignSelected = useCallback(
    (mode: "row" | "col" | "grid") => {
      const ids = Array.from(selectedNodeIds).filter((id) => !deletedNodeIds.has(id))
      if (ids.length < 2) return
      setNodePositions((prev) => {
        const next = { ...prev }
        const sorted = [...ids].sort((a, b) => {
          const pa = prev[a] || { x: 0, y: 0 }
          const pb = prev[b] || { x: 0, y: 0 }
          return mode === "col" ? pa.y - pb.y : pa.x - pb.x
        })
        const anchor = prev[sorted[0]] || { x: 80, y: 80 }
        const cols = Math.ceil(Math.sqrt(sorted.length))
        sorted.forEach((id, idx) => {
          if (mode === "row") {
            next[id] = { x: Math.round(anchor.x + idx * (CARD_WIDTH + 60)), y: Math.round(anchor.y) }
          } else if (mode === "col") {
            next[id] = { x: Math.round(anchor.x), y: Math.round(anchor.y + idx * (CARD_HEIGHT + 50)) }
          } else {
            const cIdx = idx % cols
            const rIdx = Math.floor(idx / cols)
            next[id] = {
              x: Math.round(anchor.x + cIdx * (CARD_WIDTH + 60)),
              y: Math.round(anchor.y + rIdx * (CARD_HEIGHT + 50)),
            }
          }
        })
        return next
      })
    },
    [selectedNodeIds, deletedNodeIds]
  )

  // Compute bounding box of all cards to size SVG canvas
  const canvasBounds = useMemo(() => {
    const vals = Object.values(nodePositions)
    if (vals.length === 0) return { width: 1400, height: 900 }
    const maxX = Math.max(...vals.map((v) => v.x)) + CARD_WIDTH + 200
    const maxY = Math.max(...vals.map((v) => v.y)) + CARD_HEIGHT + 200
    return {
      width: Math.max(1600, maxX),
      height: Math.max(1000, maxY),
    }
  }, [nodePositions])

  // Screen map for element count metadata
  const screensMap = useMemo(() => {
    const m = new Map<string, AppScreenNode>()
    const sourceScreens = screens || plan?.screens
    if (sourceScreens) {
      for (const s of sourceScreens) m.set(s.id, s)
    }
    return m
  }, [screens, plan?.screens])

  // Copy feedback state for user journey
  const [copiedJourney, setCopiedJourney] = useState(false)

  // Compute the Whole Previous User Journey when a screen (or multiple screens) is selected
  const activeJourney = useMemo(() => {
    const selArray = Array.from(selectedNodeIds).filter((id) => !deletedNodeIds.has(id))
    if (selArray.length === 0) {
      return {
        active: false,
        targetId: null as string | null,
        orderedIds: [] as string[],
        stepOrderMap: new Map<string, number>(),
        edgeKeys: new Set<string>(),
      }
    }

    const targetId = selArray[selArray.length - 1]
    const nodeMap = new Map(visibleNodes.map((n) => [n.id, n]))

    // Build forward & incoming adjacency lists from visibleEdges
    const incoming = new Map<string, Array<{ from: string; label: string }>>()
    const outgoing = new Map<string, Array<{ to: string; label: string }>>()
    visibleNodes.forEach((n) => {
      incoming.set(n.id, [])
      outgoing.set(n.id, [])
    })
    visibleEdges.forEach((e) => {
      if (e.from === e.to) return
      const isRet = /back|return|close/i.test(e.label)
      if (!isRet) {
        outgoing.get(e.from)?.push({ to: e.to, label: e.label })
        incoming.get(e.to)?.push({ from: e.from, label: e.label })
      }
    })
    // Also include all edges as fallback if forward-only has no incoming path
    visibleEdges.forEach((e) => {
      if (e.from === e.to) return
      if ((incoming.get(e.to)?.length || 0) === 0) {
        incoming.get(e.to)?.push({ from: e.from, label: e.label })
      }
    })

    let orderedIds: string[] = []
    const edgeKeys = new Set<string>()

    if (selArray.length === 1) {
      // Find root node (prefer S001 or first visible node)
      const rootId =
        visibleNodes.find((n) => n.id === "S001")?.id ||
        visibleNodes[0]?.id ||
        targetId

      // 1. Try BFS shortest path from rootId -> targetId
      const queue: string[][] = [[rootId]]
      const visited = new Set<string>([rootId])
      let foundPath: string[] | null = null

      while (queue.length > 0) {
        const path = queue.shift()!
        const curr = path[path.length - 1]
        if (curr === targetId) {
          foundPath = path
          break
        }
        const nexts = outgoing.get(curr) || []
        for (const nx of nexts) {
          if (!visited.has(nx.to)) {
            visited.add(nx.to)
            queue.push([...path, nx.to])
          }
        }
      }

      // 2. If root BFS didn't reach targetId, walk backwards along incoming edges from targetId
      if (!foundPath || foundPath.length <= 1) {
        const revPath: string[] = [targetId]
        const seen = new Set<string>([targetId])
        let curr = targetId
        while (true) {
          const parents = (incoming.get(curr) || []).filter((p) => !seen.has(p.from))
          if (parents.length === 0) break
          const chosen = parents[0].from
          seen.add(chosen)
          revPath.unshift(chosen)
          curr = chosen
        }
        if (revPath.length > 1) {
          foundPath = revPath
        }
      }

      // 3. Fallback when screens have no explicit edges yet: include previous sequential screens up to targetId
      if (!foundPath || foundPath.length <= 1) {
        const targetIdx = visibleNodes.findIndex((n) => n.id === targetId)
        if (targetIdx > 0 && visibleEdges.length === 0) {
          foundPath = visibleNodes.slice(0, targetIdx + 1).map((n) => n.id)
        } else {
          foundPath = [targetId]
        }
      }

      orderedIds = foundPath.filter((id) => nodeMap.has(id))
    } else {
      // Multiple screens selected: preserve screen flow order and also include any connecting ancestor chain
      orderedIds = visibleNodes.filter((n) => selectedNodeIds.has(n.id)).map((n) => n.id)
    }

    // Mark connecting edges along the ordered journey (plus any direct edge between journey nodes)
    const journeySet = new Set(orderedIds)
    for (let i = 0; i < orderedIds.length - 1; i++) {
      edgeKeys.add(`${orderedIds[i]}->${orderedIds[i + 1]}`)
    }
    visibleEdges.forEach((e) => {
      if (journeySet.has(e.from) && journeySet.has(e.to)) {
        edgeKeys.add(`${e.from}->${e.to}`)
      }
    })

    const stepOrderMap = new Map<string, number>()
    orderedIds.forEach((id, idx) => stepOrderMap.set(id, idx + 1))

    return {
      active: orderedIds.length > 0,
      targetId,
      orderedIds,
      stepOrderMap,
      edgeKeys,
    }
  }, [selectedNodeIds, deletedNodeIds, visibleNodes, visibleEdges])

  // Copy the highlighted journey to clipboard as structured text/markdown
  const handleCopyJourney = useCallback(async () => {
    if (!activeJourney.active || activeJourney.orderedIds.length === 0) return
    const allSteps = steps || plan?.steps || []
    const lines: string[] = []
    lines.push(`# User Journey (${activeJourney.orderedIds.length} Screens: ${activeJourney.orderedIds.join(" → ")})`)
    lines.push("")

    activeJourney.orderedIds.forEach((id, idx) => {
      const node = visibleNodes.find((n) => n.id === id)
      const scr = screensMap.get(id)
      const title = scr?.name || node?.title?.replace(/^S\d+\s*/i, "") || id
      const url = scr?.path || scr?.url || node?.url || "/"
      lines.push(`## Step ${idx + 1}: [${id}] ${title} (${url})`)

      const scrSteps = allSteps.filter(
        (s) =>
          s.screenId === id ||
          (scr && s.screenName?.toLowerCase() === scr.name?.toLowerCase()) ||
          (node && s.screenName?.toLowerCase() === node.title?.toLowerCase())
      )
      if (scrSteps.length > 0) {
        scrSteps.forEach((st, sIdx) => {
          const val = st.syntheticValue ? ` = "${st.syntheticValue}"` : ""
          lines.push(`  - ${sIdx + 1}. [${(st.actionType || "STEP").toUpperCase()}] ${st.targetName || st.expectedResult || "Action"}${val} (${st.status || "pending"})`)
        })
      }

      if (idx < activeJourney.orderedIds.length - 1) {
        const nextId = activeJourney.orderedIds[idx + 1]
        const edge = visibleEdges.find((e) => e.from === id && e.to === nextId)
        lines.push(`  ↳ Transition to ${nextId}: ${edge?.label || "Navigate →"}`)
      }
      lines.push("")
    })

    const text = lines.join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopiedJourney(true)
      setLayoutToast({
        message: "Journey Copied to Clipboard",
        sub: `${activeJourney.orderedIds.join(" → ")}`,
      })
      setTimeout(() => {
        setCopiedJourney(false)
        setLayoutToast(null)
      }, 2800)
    } catch (err) {
      console.error("Failed to copy journey:", err)
    }
  }, [activeJourney, visibleNodes, visibleEdges, screensMap, steps, plan?.steps])

  // Export ONLY the highlighted journey as a standalone interactive HTML file
  const handleExportJourneyHtml = useCallback(() => {
    if (!activeJourney.active || activeJourney.orderedIds.length === 0) return
    try {
      const journeySet = new Set(activeJourney.orderedIds)
      const allScreens = screens || plan?.screens || []
      const journeyScreens: AppScreenNode[] = activeJourney.orderedIds.map((id) => {
        const existing = allScreens.find((s) => s.id === id)
        if (existing) return existing
        const n = visibleNodes.find((vn) => vn.id === id)
        return {
          id,
          name: n?.title || id,
          url: n?.url || "/",
          path: n?.url || "/",
          screenshotUrl: n?.screenshotUrl,
          actionableElements: [],
          forms: [],
          discoveredAt: new Date().toISOString(),
        } as AppScreenNode
      })

      const allTransitions = transitions || plan?.transitions || []
      const journeyTransitions: AppWorkflowTransition[] = []
      for (let i = 0; i < activeJourney.orderedIds.length - 1; i++) {
        const fromId = activeJourney.orderedIds[i]
        const toId = activeJourney.orderedIds[i + 1]
        const matchedT = allTransitions.find((t) => t.fromScreenId === fromId && t.toScreenId === toId)
        const matchedE = visibleEdges.find((e) => e.from === fromId && e.to === toId)
        journeyTransitions.push(
          matchedT || {
            id: `journey-trans-${fromId}-${toId}`,
            fromScreenId: fromId,
            toScreenId: toId,
            action: matchedE?.label || `Step ${i + 1} → Step ${i + 2}`,
            actionType: "click",
          }
        )
      }

      const allSteps = steps || plan?.steps || []
      const journeySteps = allSteps.filter((s) => s.screenId && journeySet.has(s.screenId))
      const journeyGraph: FlowGraph = {
        nodes: activeJourney.orderedIds
          .map((id) => visibleNodes.find((n) => n.id === id))
          .filter(Boolean) as FlowGraph["nodes"],
        edges: journeyTransitions.map((t) => ({
          from: t.fromScreenId,
          to: t.toScreenId,
          label: t.action,
        })),
      }

      const html = generateAppMapHtml({
        plan: plan
          ? {
              ...plan,
              screens: journeyScreens,
              transitions: journeyTransitions,
              steps: journeySteps,
              flowGraph: journeyGraph,
            }
          : undefined,
        screens: journeyScreens,
        transitions: journeyTransitions,
        title: `User Journey: ${activeJourney.orderedIds.join(" → ")}`,
        timestamp: new Date().toISOString(),
      })

      const blob = new Blob([html], { type: "text/html;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const startId = activeJourney.orderedIds[0]
      const endId = activeJourney.orderedIds[activeJourney.orderedIds.length - 1]
      a.download = `journey-${startId}-to-${endId}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setLayoutToast({
        message: "Journey Exported as HTML",
        sub: `journey-${startId}-to-${endId}.html downloaded`,
      })
      setTimeout(() => setLayoutToast(null), 2800)
    } catch (err) {
      console.error("Failed to export journey HTML:", err)
    }
  }, [activeJourney, screens, plan, transitions, steps, visibleNodes, visibleEdges])

  // Search tested screens in map
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false)

  const matchingNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return visibleNodes.filter((node) => {
      const matchedScreen = screensMap.get(node.id)
      const name = (node.title || "").toLowerCase()
      const path = (matchedScreen?.path || "").toLowerCase()
      const id = (node.id || "").toLowerCase()
      const comp = (node.componentLocation || "").toLowerCase()
      const hasAction = (matchedScreen?.actionableElements || []).some((el) => (el.name || "").toLowerCase().includes(q))
      const hasStep = (steps || plan?.steps || []).some(
        (s) =>
          (s.screenId === node.id || s.screenName?.toLowerCase() === name) &&
          ((s.targetName || "").toLowerCase().includes(q) || (s.expectedResult || "").toLowerCase().includes(q))
      )
      return name.includes(q) || path.includes(q) || id.includes(q) || comp.includes(q) || hasAction || hasStep
    })
  }, [searchQuery, visibleNodes, screensMap, steps, plan?.steps])

  const matchingNodeIds = useMemo(() => {
    return new Set(matchingNodes.map((n) => n.id))
  }, [matchingNodes])

  const centerOnNode = useCallback(
    (nodeId: string, openInspector = false) => {
      const pos = nodePositions[nodeId]
      if (!pos || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const targetX = rect.width / 2 - (pos.x + CARD_WIDTH / 2) * zoom
      const targetY = rect.height / 2 - (pos.y + CARD_HEIGHT / 2) * zoom
      setPan({ x: Math.round(targetX), y: Math.round(targetY) })
      if (openInspector) {
        setInspectingNodeId(nodeId)
        onSelectScreen?.(nodeId)
      }
    },
    [nodePositions, zoom, onSelectScreen]
  )

  const handleNavigateSearch = useCallback(
    (direction: 1 | -1) => {
      if (matchingNodes.length === 0) return
      let nextIdx = (activeSearchIndex + direction) % matchingNodes.length
      if (nextIdx < 0) nextIdx = matchingNodes.length - 1
      setActiveSearchIndex(nextIdx)
      centerOnNode(matchingNodes[nextIdx].id, false)
    },
    [matchingNodes, activeSearchIndex, centerOnNode]
  )

  // Submit search: updates query, highlights matches, and centers camera WITHOUT auto-opening inspector
  const handleExecuteSearch = useCallback(
    (customQuery?: string) => {
      const q = (customQuery !== undefined ? customQuery : searchInput).trim()
      setSearchQuery(q)
      setIsSearchDropdownOpen(false)
      if (!q) {
        setActiveSearchIndex(0)
        return
      }

      const lower = q.toLowerCase()
      const firstMatch = visibleNodes.find((node) => {
        const matchedScreen = screensMap.get(node.id)
        const name = (node.title || "").toLowerCase()
        const path = (matchedScreen?.path || "").toLowerCase()
        const id = (node.id || "").toLowerCase()
        const comp = (node.componentLocation || "").toLowerCase()
        const hasAction = (matchedScreen?.actionableElements || []).some((el) => (el.name || "").toLowerCase().includes(lower))
        const hasStep = (steps || plan?.steps || []).some(
          (s) =>
            (s.screenId === node.id || s.screenName?.toLowerCase() === name) &&
            ((s.targetName || "").toLowerCase().includes(lower) || (s.expectedResult || "").toLowerCase().includes(lower))
        )
        return name.includes(lower) || path.includes(lower) || id.includes(lower) || comp.includes(lower) || hasAction || hasStep
      })

      if (firstMatch) {
        setActiveSearchIndex(0)
        centerOnNode(firstMatch.id, false)
      }
    },
    [searchInput, visibleNodes, screensMap, steps, plan?.steps, centerOnNode]
  )

  const handleClearSearch = useCallback(() => {
    setSearchInput("")
    setSearchQuery("")
    setIsSearchDropdownOpen(false)
    setActiveSearchIndex(0)
  }, [])

  // Current inspecting node & screen record
  const inspectingNode = useMemo(() => {
    if (!inspectingNodeId) return null
    return visibleNodes.find((n) => n.id === inspectingNodeId) || null
  }, [visibleNodes, inspectingNodeId])

  const inspectingScreen = useMemo(() => {
    if (!inspectingNodeId) return null
    return screensMap.get(inspectingNodeId) || null
  }, [screensMap, inspectingNodeId])

  // All test steps / operations executed on this screen
  const screenOperations = useMemo(() => {
    if (!inspectingNodeId) return []
    const allSteps = steps || plan?.steps || []
    return allSteps.filter(
      (s) =>
        s.screenId === inspectingNodeId ||
        (inspectingScreen && s.screenName?.toLowerCase() === inspectingScreen.name?.toLowerCase()) ||
        (inspectingNode && s.screenName?.toLowerCase() === inspectingNode.title?.toLowerCase())
    )
  }, [steps, plan?.steps, inspectingNodeId, inspectingScreen, inspectingNode])

  // Selected operation within the screen inspector
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)

  // Reset selected operation when changing screen
  useEffect(() => {
    setSelectedOperationId(null)
  }, [inspectingNodeId])

  const activeOperation = useMemo(() => {
    if (!screenOperations || screenOperations.length === 0) return null
    if (!selectedOperationId) return screenOperations[0]
    return screenOperations.find((op) => op.id === selectedOperationId) || screenOperations[0]
  }, [screenOperations, selectedOperationId])

  const activeScreenshot =
    (selectedOperationId && activeOperation?.screenshotUrl) ||
    inspectingScreen?.screenshotUrl ||
    inspectingNode?.screenshotUrl ||
    activeOperation?.screenshotUrl

  const filteredScreenOperations = useMemo(() => {
    if (operationFilter === "all") return screenOperations
    return screenOperations.filter((op) => op.status === operationFilter)
  }, [screenOperations, operationFilter])

  // Outgoing transitions (side operations that navigate to another screen)
  const outgoingTransitions = useMemo(() => {
    if (!inspectingNodeId) return []
    const allTransitions = transitions || plan?.transitions || []
    const directMatches = allTransitions.filter(
      (t) => t.fromScreenId === inspectingNodeId && !deletedNodeIds.has(t.toScreenId)
    )
    if (directMatches.length > 0) return directMatches

    // Fallback: derive from visibleEdges
    return visibleEdges
      .filter((e) => e.from === inspectingNodeId)
      .map((e, idx) => ({
        id: `trans-${e.from}-${e.to}-${idx}`,
        fromScreenId: e.from,
        toScreenId: e.to,
        action: e.label,
        actionType: "click" as const,
      }))
  }, [transitions, plan?.transitions, visibleEdges, inspectingNodeId, deletedNodeIds])

  // Incoming transitions
  const incomingTransitions = useMemo(() => {
    if (!inspectingNodeId) return []
    return visibleEdges.filter((e) => e.to === inspectingNodeId)
  }, [visibleEdges, inspectingNodeId])

  // Index of inspecting node among visible nodes
  const inspectingIndex = useMemo(() => {
    if (!inspectingNodeId) return -1
    return visibleNodes.findIndex((n) => n.id === inspectingNodeId)
  }, [visibleNodes, inspectingNodeId])

  // Handle keyboard shortcut Escape to close inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (evidencePreviewModal) {
          setEvidencePreviewModal(null)
        } else if (inspectingNodeId) {
          setInspectingNodeId(null)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [inspectingNodeId, evidencePreviewModal])

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-xl border border-slate-800 bg-slate-950 transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 flex h-screen w-screen flex-col rounded-none border-none"
          : isBesideScreen || isFullStage
          ? "h-full w-full flex-1 flex flex-col rounded-none border-none"
          : "h-[580px] w-full"
      }`}
      onWheel={handleWheel}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      data-canvas-surface="true"
    >
      {/* 1. FIGMA TOP TOOLBAR */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Figma Pointer Tool Switcher (Select Box vs Hand Pan) + Search */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center bg-slate-900/95 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg text-xs">
            <button
              type="button"
              onClick={() => setCanvasTool("select")}
              className={`px-2 py-1 rounded flex items-center gap-1 font-semibold transition cursor-pointer ${
                canvasTool === "select"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Select & Box-Select Cards (Drag canvas to select multiple cards, drag any selected card to move group)"
            >
              <MousePointer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Select</span>
            </button>

          </div>

          <div className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleExecuteSearch()
            }}
            className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-lg text-xs"
          >
            <Search className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tested screens..."
              className="bg-transparent border-none text-xs text-white placeholder-slate-400 focus:outline-none w-32 sm:w-44"
            />
            <button
              type="submit"
              disabled={!searchInput.trim()}
              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-[10px] transition cursor-pointer shrink-0 shadow-xs"
              title="Submit search (Enter)"
            >
              Submit
            </button>
            {searchQuery && (
              <div className="flex items-center gap-1 pl-1 border-l border-slate-700">
                <span className="text-[10px] font-mono font-bold text-indigo-300">
                  {matchingNodes.length > 0 ? `${activeSearchIndex + 1}/${matchingNodes.length}` : "0"}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateSearch(-1)}
                  disabled={matchingNodes.length <= 1}
                  className="p-1 hover:bg-slate-800 disabled:opacity-30 text-slate-300 rounded cursor-pointer"
                  title="Previous matching screen"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSearch(1)}
                  disabled={matchingNodes.length <= 1}
                  className="p-1 hover:bg-slate-800 disabled:opacity-30 text-slate-300 rounded cursor-pointer"
                  title="Next matching screen"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </form>

          {/* Quick Match Dropdown */}
          {isSearchDropdownOpen && searchQuery.trim() && matchingNodes.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 max-h-56 overflow-y-auto rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl z-50 p-1 space-y-1 backdrop-blur-md">
              {matchingNodes.map((mNode, idx) => (
                <div
                  key={mNode.id}
                  onClick={() => {
                    setActiveSearchIndex(idx)
                    centerOnNode(mNode.id)
                    setIsSearchDropdownOpen(false)
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer flex items-center justify-between gap-2 transition ${
                    idx === activeSearchIndex
                      ? "bg-indigo-600/40 border border-indigo-500/50 text-white"
                      : "hover:bg-slate-800/80 text-slate-300"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate text-[11px]">{mNode.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{mNode.id} • {mNode.url}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-950 text-indigo-300 border border-slate-800 shrink-0">
                    Jump →
                  </span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/90 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700/80 shadow-lg text-xs">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom Out (Ctrl -)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          {/* Zoom Level Indicator */}
          <button
            type="button"
            onClick={handleZoomReset}
            className="px-2 py-0.5 rounded hover:bg-slate-800 text-[11px] font-mono font-bold text-slate-200 transition cursor-pointer"
            title="Click to reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom In (Ctrl +)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-700 mx-0.5" />

          {/* Auto Arrange / Reset Layout + Screen Presets */}
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={isOptimizingLayout}
            className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold ${
              isOptimizingLayout
                ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 cursor-wait animate-pulse"
                : "bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40"
            }`}
            title="Auto-arrange phone screens in a clean flow and fit to screen"
          >
            <Sparkles className={`h-3.5 w-3.5 text-indigo-400 ${isOptimizingLayout ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">
              {isOptimizingLayout ? "Fitting..." : "Auto-Layout"}
            </span>
          </button>



          <button
            type="button"
            onClick={() => fitPositionsToViewport(nodePositions)}
            className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px] font-medium"
            title="Fit all phone screens into visible screen area"
          >
            <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden xl:inline">Fit</span>
          </button>

          <div className="w-px h-4 bg-slate-700 mx-0.5" />

          {/* Front / Forward Navigations Line Toggle */}
          <button
            type="button"
            onClick={() => setShowForwardLines((prev) => !prev)}
            className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 text-[11px] font-medium ${
              showForwardLines
                ? "bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/35"
                : "bg-slate-800/60 text-slate-400 line-through hover:text-slate-200 border border-slate-700/50"
            }`}
            title={showForwardLines ? "Hide Front / Forward navigation lines" : "Show Front / Forward navigation lines"}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
            <span className="hidden sm:inline">Front Nav</span>
          </button>

          {/* Back / Return Navigations Line Toggle */}
          <button
            type="button"
            onClick={() => setShowReturnLines((prev) => !prev)}
            className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 text-[11px] font-medium ${
              showReturnLines
                ? "bg-emerald-600/25 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/35"
                : "bg-slate-800/60 text-slate-400 line-through hover:text-slate-200 border border-slate-700/50"
            }`}
            title={showReturnLines ? "Hide Back / Return navigation lines" : "Show Back / Return navigation lines"}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">Back Nav</span>
          </button>



          <div className="w-px h-4 bg-slate-700 mx-0.5" />

          {/* Fullscreen / Full Page Toggle */}
          <button
            type="button"
            onClick={() => {
              if (onToggleFullStage) {
                onToggleFullStage()
              } else if (onOpenMapPage && !isFullStage) {
                onOpenMapPage()
              } else {
                setIsFullscreen(!isFullscreen)
              }
            }}
            className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold ${
              isFullStage || isFullscreen
                ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/50"
                : "hover:bg-slate-800 text-slate-300 hover:text-white"
            }`}
            title={
              isFullStage
                ? "Show phone simulation beside map (Split View)"
                : "Hide phone simulation and expand map across full stage"
            }
          >
            {isFullStage || isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Fullscreen</span>
              </>
            )}
          </button>

          {/* Close Beside / Full Stage button */}
          {(isBesideScreen || isFullStage) && onCloseBeside && (
            <>
              <div className="w-px h-4 bg-slate-700 mx-0.5" />
              <button
                type="button"
                onClick={onCloseBeside}
                className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                title="Close map view and return to single phone simulator"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* AI & OpenCV Layout Toast Notification */}
      {layoutToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-2">
          <div className="px-4 py-2 rounded-full bg-slate-900/95 border border-indigo-500/50 shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs text-white">
            <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 animate-pulse" />
            <span className="font-semibold text-indigo-200">{layoutToast.message}</span>
            {layoutToast.sub && (
              <>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300 text-[11px] font-mono">{layoutToast.sub}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. INFINITE DOT GRID CANVAS SURFACE */}
      <div
        className="canvas-bg absolute inset-0 cursor-grab active:cursor-grabbing overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(#334155 1.2px, transparent 1.2px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Transformable Canvas Layer */}
        <div
          className="absolute origin-top-left transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: `${canvasBounds.width}px`,
            height: `${canvasBounds.height}px`,
          }}
        >
          {/* SVG LAYER: SMART CURVED BEZIER CONNECTING LINES */}
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            width={canvasBounds.width}
            height={canvasBounds.height}
          >
            <defs>
              <marker
                id="figma-arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M0,2 L8,5 L0,8 z" fill="#6366f1" />
              </marker>
              <marker
                id="figma-arrowhead-return"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M0,2 L8,5 L0,8 z" fill="#10b981" />
              </marker>
              <marker
                id="figma-arrowhead-journey"
                markerWidth="11"
                markerHeight="11"
                refX="8"
                refY="5"
                orient="auto"
              >
                <path d="M0,1.5 L9,5 L0,8.5 z" fill="#f59e0b" />
              </marker>
              <filter id="glow-indigo" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.4" />
              </filter>
            </defs>

            {visibleEdges.map((e, idx) => {
              const fromPos = nodePositions[e.from]
              const toPos = nodePositions[e.to]
              if (!fromPos || !toPos || e.from === e.to) return null

              const isReturn = /back|return|close/i.test(e.label) || fromPos.x > toPos.x

              // Filter out lines based on user visibility toggles
              if (isReturn && !showReturnLines) return null
              if (!isReturn && !showForwardLines) return null

              const { path, midX, midY } = getSmartBezier(
                fromPos,
                toPos,
                CARD_WIDTH,
                CARD_HEIGHT
              )

              const isJourneyEdge = activeJourney.active && activeJourney.edgeKeys.has(`${e.from}->${e.to}`)
              const isDimmedEdge = activeJourney.active && !isJourneyEdge
              const fromStepNum = activeJourney.stepOrderMap.get(e.from)
              const toStepNum = activeJourney.stepOrderMap.get(e.to)
              const baseLabel = e.label.length > 26 ? e.label.slice(0, 25) + "…" : e.label
              const labelText =
                isJourneyEdge && fromStepNum && toStepNum
                  ? `#${fromStepNum}→#${toStepNum} ${baseLabel}`
                  : baseLabel

              return (
                <g key={`edge-${e.from}-${e.to}-${idx}`} style={{ opacity: isDimmedEdge ? 0.18 : 1 }}>
                  {/* Background Glow Line */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isJourneyEdge ? "#f59e0b" : isReturn ? "#064e3b" : "#4338ca"}
                    strokeOpacity={isJourneyEdge ? "0.45" : "0.3"}
                    strokeWidth={isJourneyEdge ? "8" : "4"}
                  />

                  {/* Main Bezier Connecting Line */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isJourneyEdge ? "#fbbf24" : isReturn ? "#10b981" : "#6366f1"}
                    strokeOpacity={isJourneyEdge ? 1 : isReturn ? 0.9 : 0.85}
                    strokeWidth={isJourneyEdge ? "3.2" : "2"}
                    strokeDasharray={isReturn && !isJourneyEdge ? "5 3" : undefined}
                    markerEnd={
                      isJourneyEdge
                        ? "url(#figma-arrowhead-journey)"
                        : isReturn
                        ? "url(#figma-arrowhead-return)"
                        : "url(#figma-arrowhead)"
                    }
                  />

                  {/* Midpoint Pill Label with Backdrop */}
                  <g
                    transform={`translate(${midX}, ${midY})`}
                    className="pointer-events-auto cursor-pointer group/edge"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setInspectingNodeId(e.to)
                      setInspectorSubTab("operations")
                      if (onSelectScreen) onSelectScreen(e.to)
                    }}
                  >
                    <rect
                      x={-(labelText.length * 3.3) - 8}
                      y="-11"
                      width={labelText.length * 6.6 + 16}
                      height="20"
                      rx="6"
                      fill={isJourneyEdge ? "#451a03" : isReturn ? "#064e3b" : "#0f172a"}
                      stroke={isJourneyEdge ? "#f59e0b" : isReturn ? "#059669" : "#4338ca"}
                      strokeWidth={isJourneyEdge ? "1.5" : "1"}
                      className="shadow-md group-hover/edge:stroke-amber-400 transition-colors"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={isJourneyEdge ? "#fde68a" : isReturn ? "#6ee7b7" : "#c7d2fe"}
                      fontSize="9.5"
                      fontFamily="ui-monospace, monospace"
                      fontWeight="700"
                      className="group-hover/edge:fill-white transition-colors"
                    >
                      {labelText}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>

          {/* FIGMA MARQUEE SELECTION BOX */}
          {marquee && (
            <div
              className="absolute border-2 border-indigo-400 bg-indigo-500/15 rounded pointer-events-none z-50 shadow-lg"
              style={{
                left: `${Math.min(marquee.startX, marquee.currentX)}px`,
                top: `${Math.min(marquee.startY, marquee.currentY)}px`,
                width: `${Math.abs(marquee.currentX - marquee.startX)}px`,
                height: `${Math.abs(marquee.currentY - marquee.startY)}px`,
              }}
            />
          )}

          {/* HTML LAYER: FIGMA MOBILE PHONE SCREEN FRAMES (Full Tall Phone Preview + Multi-Select + Group Drag) */}
          {visibleNodes.map((node, i) => {
            const pos = nodePositions[node.id] || {
              x: 80 + (i % 4) * 350,
              y: 80 + Math.floor(i / 4) * 580,
            }
            const isDragging =
              draggingNodeId === node.id ||
              (Boolean(draggingNodeId) && selectedNodeIds.has(node.id) && selectedNodeIds.has(draggingNodeId!))
            const isSelected = selectedNodeIds.has(node.id)
            const matchedScreen = screensMap.get(node.id)
            const allSteps = steps || plan?.steps || []
            const nodeSteps = allSteps.filter(
              (s) =>
                s.screenId === node.id ||
                (matchedScreen && s.screenName?.toLowerCase() === matchedScreen.name?.toLowerCase()) ||
                s.screenName?.toLowerCase() === node.title?.toLowerCase()
            )
            const elementsList = matchedScreen?.actionableElements || []
            const elementsCount = elementsList.length
            const isMatch = matchingNodeIds.has(node.id)
            const journeyStepNum = activeJourney.stepOrderMap.get(node.id)
            const isInJourney = Boolean(journeyStepNum)
            const isJourneyTarget = activeJourney.targetId === node.id
            const isDimmed =
              (searchQuery.trim().length > 0 && !isMatch) ||
              (activeJourney.active && activeJourney.orderedIds.length > 1 && !isInJourney)

            // Clean up raw title & classify what kind of screen this is so user immediately knows what it is
            const rawTitle =
              matchedScreen?.name || node.title.replace(/^S\d+\s*/i, "") || `Screen ${node.id}`
            const is404 = /^404$/i.test(rawTitle.trim()) || /404|not found/i.test(rawTitle)
            const isFormScenario = /form_scenario|form\s*"?form/i.test(rawTitle)
            const isClickAction = /\(click\)$/i.test(rawTitle.trim())
            const isLoginScreen = /sign\s*in|log\s*in|auth|reset password/i.test(rawTitle)

            const cleanTitle = rawTitle
              .replace(/\s*\(form_scenario\)\s*/gi, "")
              .replace(/\s*\(click\)\s*/gi, "")
              .replace(/^Form\s*"([^"]+)"\s*/i, "$1: ")
              .trim()

            // Clean up URL-encoded hash paths
            let rawRoute = matchedScreen?.path || "/"
            if (!matchedScreen?.path && node.url) {
              try {
                const u = new URL(node.url)
                rawRoute = (u.pathname || "/") + (u.hash || "")
              } catch {
                rawRoute = node.url
              }
            }
            let routePath = rawRoute
            try {
              routePath = decodeURIComponent(rawRoute)
            } catch {}
            if (routePath.includes("#action-")) {
              routePath = routePath.split("#action-")[0] || "/"
            }

            const screenCategory = is404
              ? { label: "404 BROKEN ROUTE", cls: "bg-rose-500/25 text-rose-300 border-rose-500/40" }
              : isFormScenario
              ? { label: "FORM TEST", cls: "bg-purple-500/25 text-purple-300 border-purple-500/40" }
              : isLoginScreen
              ? { label: "AUTH / LOGIN", cls: "bg-amber-500/25 text-amber-300 border-amber-500/40" }
              : isClickAction
              ? { label: "UI ACTION", cls: "bg-sky-500/25 text-sky-300 border-sky-500/40" }
              : { label: "APP SCREEN", cls: "bg-indigo-500/25 text-indigo-300 border-indigo-500/40" }

            const shotUrl =
              node.screenshotUrl ||
              matchedScreen?.screenshotUrl ||
              nodeSteps.find((st) => st.screenshotUrl)?.screenshotUrl
            const showScreenshot = Boolean(shotUrl) && !brokenImageIds.has(node.id)
            const passedCount = nodeSteps.filter((s) => s.status === "passed").length
            const failedCount = nodeSteps.filter((s) => s.status === "failed").length

            // Build visible UI content rows (combine steps + actionable elements so you ALWAYS see what is inside the screen)
            const previewRows: Array<{
              id: string
              badge: string
              label: string
              sub?: string
              status?: string
              kind: "step" | "element"
            }> = []
            const seenLabels = new Set<string>()

            nodeSteps.forEach((st) => {
              const lbl = (st.targetName || st.expectedResult || "Test Step")
                .replace(/\s*\(form_scenario\)\s*/gi, "")
                .trim()
              const key = `${st.actionType}-${lbl.toLowerCase()}`
              if (seenLabels.has(key) || previewRows.length >= 4) return
              seenLabels.add(key)
              previewRows.push({
                id: `st-${st.id}`,
                badge:
                  st.actionType === "fill"
                    ? "INPUT"
                    : st.actionType === "form_scenario"
                    ? "FORM"
                    : (st.actionType || "STEP").toUpperCase().slice(0, 6),
                label: lbl,
                sub: st.syntheticValue ? `"${st.syntheticValue}"` : undefined,
                status: st.status,
                kind: "step",
              })
            })

            elementsList.forEach((el, eIdx) => {
              if (previewRows.length >= 4) return
              const lbl = (el.name || el.selector || "UI Element")
                .replace(/Landlord Accounting\s*[—\-–]\s*/i, "")
                .trim()
              const key = lbl.toLowerCase()
              if (!lbl || seenLabels.has(key)) return
              seenLabels.add(key)
              previewRows.push({
                id: `el-${el.id || eIdx}`,
                badge:
                  el.type === "input"
                    ? "FIELD"
                    : el.type === "button" || el.type === "clickable"
                    ? "BTN"
                    : (el.type || "UI").toUpperCase().slice(0, 5),
                label: lbl,
                sub: el.selector,
                status: el.testStatus,
                kind: "element",
              })
            })

            const isDesktopCard = /desktop|1440|1920/i.test(node.title) || (node as any).deviceType === "desktop";
            const isTabletCard = /tablet|ipad|768|1024/i.test(node.title) || (node as any).deviceType === "tablet";

            return (
              <div
                key={node.id}
                onPointerDown={(e) => handleCardPointerDown(node.id, e)}
                onPointerMove={(e) => handleCardPointerMove(node.id, e)}
                onPointerUp={(e) => handleCardPointerUp(node.id, e)}
                onPointerCancel={(e) => handleCardPointerUp(node.id, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setInspectingNodeId(node.id)
                  setInspectorSubTab("operations")
                  onSelectScreen?.(node.id)
                }}
                className={`absolute select-none cursor-grab active:cursor-grabbing flex flex-col overflow-visible group/phone ${
                  isDragging
                    ? "z-40 scale-[1.02] transition-none"
                    : isSelected
                    ? "z-30 transition-all duration-150"
                    : isMatch
                    ? "z-30 scale-[1.02] transition-all duration-300"
                    : inspectingNodeId === node.id
                    ? "z-30 transition-all duration-300"
                    : isDimmed
                    ? "z-10 opacity-30 grayscale-[70%] transition-all duration-300"
                    : "z-20 transition-all duration-200"
                }`}
                style={{
                  width: `${CARD_WIDTH}px`,
                  height: `${CARD_HEIGHT}px`,
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  touchAction: "none",
                }}
              >
                {/* Journey Step Ribbon when part of highlighted user journey */}
                {isInJourney && (
                  <div
                    className={`-mt-5 mb-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center justify-between border shadow-md ${
                      isJourneyTarget
                        ? "bg-indigo-600/95 border-indigo-300 text-white"
                        : "bg-amber-500/95 border-amber-300 text-slate-950"
                    }`}
                  >
                    <span>
                      STEP {journeyStepNum} OF {activeJourney.orderedIds.length}
                    </span>
                    <span>{isJourneyTarget ? "★ SELECTED" : "JOURNEY →"}</span>
                  </div>
                )}

                {/* Figma Artboard Title Bar floating right above the Phone Frame */}
                <div className="mb-1.5 px-1 flex items-center justify-between gap-1.5 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedNodeIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(node.id)) next.delete(node.id)
                          else next.add(node.id)
                          return next
                        })
                      }}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition cursor-pointer shrink-0 ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-400 text-white shadow-sm shadow-indigo-500/50"
                          : "bg-slate-900 border-slate-700 text-transparent hover:border-indigo-400"
                      }`}
                      title={isSelected ? "Deselect phone" : "Select phone (highlights journey & allows group move)"}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </button>
                    <span className="px-1.5 py-0.5 rounded font-mono font-extrabold text-[11px] bg-indigo-500/30 text-indigo-200 border border-indigo-500/50 shrink-0">
                      {node.id}
                    </span>
                    <span className="text-xs font-extrabold text-white truncate" title={cleanTitle}>
                      {is404 ? `404: ${routePath}` : cleanTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {is404 ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/25 text-rose-300 border border-rose-500/40">
                        404
                      </span>
                    ) : failedCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        {failedCount} FAIL
                      </span>
                    ) : passedCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        PASS
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setInspectingNodeId(node.id)
                        setInspectorSubTab("operations")
                        onSelectScreen?.(node.id)
                      }}
                      className="p-1 rounded bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-indigo-600 hover:border-indigo-500 transition cursor-pointer"
                      title="Inspect full phone screen & operations"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleDeleteNode(node.id, e)}
                      className="p-1 rounded bg-slate-900/90 border border-slate-800 text-slate-500 hover:text-rose-300 hover:bg-rose-950/70 transition cursor-pointer"
                      title={`Delete phone screen ${node.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* DEVICE HARDWARE CHASSIS / BEZEL */}
                <div
                  className={`relative flex-1 min-h-0 ${
                    isDesktopCard
                      ? "rounded-2xl p-1.5"
                      : isTabletCard
                      ? "rounded-[24px] p-2"
                      : "rounded-[34px] p-2"
                  } bg-slate-950 flex flex-col justify-between shadow-2xl border-[3px] transition-colors ${
                    isDragging || isSelected
                      ? "border-indigo-400 shadow-indigo-500/40 ring-2 ring-indigo-500/60"
                      : isInJourney
                      ? "border-amber-400 shadow-amber-500/35 ring-2 ring-amber-400/70"
                      : isMatch
                      ? "border-emerald-400 shadow-emerald-500/35 ring-2 ring-emerald-400/60"
                      : inspectingNodeId === node.id
                      ? "border-indigo-400 shadow-indigo-500/40 ring-2 ring-indigo-500/50"
                      : is404
                      ? "border-rose-800/80 group-hover/phone:border-rose-500/80"
                      : "border-slate-700/90 group-hover/phone:border-indigo-400/80"
                  }`}
                >
                  {/* Side Hardware Button Accents (Only on Mobile Phone) */}
                  {!isDesktopCard && !isTabletCard && (
                    <>
                      <span className="absolute -left-[5px] top-16 w-[3px] h-7 rounded-l bg-slate-700 pointer-events-none" />
                      <span className="absolute -left-[5px] top-26 w-[3px] h-7 rounded-l bg-slate-700 pointer-events-none" />
                      <span className="absolute -right-[5px] top-20 w-[3px] h-10 rounded-r bg-slate-700 pointer-events-none" />
                    </>
                  )}

                  {/* Figma Selection Corner Handles */}
                  {isSelected && (
                    <>
                      <span className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-[3px] pointer-events-none z-50" />
                      <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-[3px] pointer-events-none z-50" />
                      <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-[3px] pointer-events-none z-50" />
                      <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-[3px] pointer-events-none z-50" />
                    </>
                  )}

                  {/* INNER DEVICE DISPLAY */}
                  <div className={`flex-1 min-h-0 ${isDesktopCard ? "rounded-xl" : isTabletCard ? "rounded-[18px]" : "rounded-[25px]"} bg-slate-900 border border-slate-800/90 overflow-hidden flex flex-col justify-between relative`}>
                    {/* Device Status Bar / Window Controls */}
                    {isDesktopCard ? (
                      <div className="px-3 pt-2 pb-1.5 bg-slate-950 flex items-center justify-between text-[9px] font-semibold text-slate-300 shrink-0 border-b border-slate-800/80">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500/80 inline-block" />
                          <span className="w-2 h-2 rounded-full bg-amber-500/80 inline-block" />
                          <span className="w-2 h-2 rounded-full bg-emerald-500/80 inline-block" />
                        </div>
                        <div className="flex items-center gap-1 text-[9px] font-mono text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          <Monitor className="w-2.5 h-2.5 text-indigo-400" />
                          <span>Desktop (1440×900)</span>
                        </div>
                      </div>
                    ) : isTabletCard ? (
                      <div className="px-3 pt-1.5 pb-1 bg-slate-950 flex items-center justify-between text-[9px] font-semibold text-slate-300 shrink-0">
                        <span className="font-mono text-[9px]">9:41</span>
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          <Tablet className="w-2.5 h-2.5 text-cyan-400" />
                          <span>Tablet (768×1024)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-1.5 rounded-[1px] bg-slate-300" />
                          <span className="inline-block w-3 h-1.5 rounded-[2px] border border-slate-300 p-[0.5px]">
                            <span className="block w-full h-full bg-emerald-400" />
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 pt-1.5 pb-1 bg-slate-950 flex items-center justify-between text-[9px] font-semibold text-slate-300 shrink-0">
                        <span className="font-mono text-[9px]">9:41</span>
                        <div className="w-14 h-3 rounded-full bg-black border border-slate-800/90 flex items-center justify-end pr-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-950 border border-indigo-500/40" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-1.5 rounded-[1px] bg-slate-300" />
                          <span className="inline-block w-3 h-1.5 rounded-[2px] border border-slate-300 p-[0.5px]">
                            <span className="block w-full h-full bg-emerald-400" />
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 2. CLEAR SCREEN IDENTITY BANNER (Always legible even when zoomed out!) */}
                    <div className="px-3 py-2 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800/90 shrink-0">
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold border ${screenCategory.cls}`}
                        >
                          {screenCategory.label}
                        </span>
                        <span
                          className="text-[10px] font-mono text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[125px]"
                          title={routePath}
                        >
                          {routePath}
                        </span>
                      </div>
                      <div
                        className="text-[13px] font-extrabold text-white leading-tight line-clamp-2"
                        title={cleanTitle}
                      >
                        {is404 ? `Page Not Found (${routePath})` : cleanTitle}
                      </div>
                    </div>

                    {/* 3. SCREENSHOT PREVIEW WINDOW (Uncropped object-contain + clear 404 state) */}
                    <div className="h-[125px] relative bg-slate-950 border-b border-slate-800/90 overflow-hidden shrink-0 flex items-center justify-center">
                      {is404 ? (
                        <div className="w-full h-full p-3 bg-gradient-to-b from-rose-950/40 to-slate-950 flex flex-col items-center justify-center text-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-xs font-extrabold mb-1">
                            HTTP 404 ERROR
                          </span>
                          <p className="text-[11px] font-semibold text-slate-200 truncate max-w-full">
                            Route {routePath}
                          </p>
                          <p className="text-[9.5px] text-slate-400 mt-0.5">
                            Target URL returned 404 Not Found
                          </p>
                        </div>
                      ) : showScreenshot ? (
                        <>
                          <img
                            src={shotUrl}
                            alt={cleanTitle}
                            onError={() => {
                              setBrokenImageIds((prev) => {
                                const next = new Set(prev)
                                next.add(node.id)
                                return next
                              })
                            }}
                            className="w-full h-full object-contain bg-slate-950 pointer-events-none select-none"
                            draggable={false}
                            loading="lazy"
                          />
                          <span className="absolute bottom-1 right-1.5 px-1.5 py-0.2 rounded bg-slate-950/85 border border-slate-700/80 text-[8.5px] font-mono text-slate-300">
                            Live Capture
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full p-3 bg-gradient-to-b from-indigo-950/30 to-slate-950 flex flex-col items-center justify-center text-center">
                          <span className="text-[11px] font-bold text-indigo-300">{cleanTitle}</span>
                          <span className="text-[9.5px] font-mono text-slate-400 mt-0.5">
                            {elementsCount} interactive controls discovered
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 4. ALWAYS-VISIBLE INTERACTIVE UI CONTROLS & TEST STEPS INSIDE PHONE */}
                    <div className="flex-1 min-h-0 p-2.5 bg-slate-900/95 flex flex-col justify-between overflow-hidden">
                      <div className="flex items-center justify-between text-[9.5px] font-mono uppercase tracking-wider text-slate-400 mb-1 shrink-0">
                        <span className="font-bold text-slate-300">Screen UI & Actions</span>
                        <span className="text-indigo-300 font-semibold">
                          {elementsCount > 0 ? `${elementsCount} controls` : `${nodeSteps.length} steps`}
                        </span>
                      </div>

                      <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden flex flex-col justify-start">
                        {previewRows.length > 0 ? (
                          previewRows.slice(0, 4).map((row) => {
                            const isBtn = row.badge === "CLICK" || row.badge === "BTN"
                            const isInput = row.badge === "FILL" || row.badge === "INPUT" || row.badge === "FIELD"
                            return (
                              <div
                                key={row.id}
                                className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 text-[10.5px] ${
                                  isBtn
                                    ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-100 font-semibold"
                                    : isInput
                                    ? "bg-slate-950/95 border-purple-500/35 text-slate-100"
                                    : "bg-slate-950/85 border-slate-800 text-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-mono font-extrabold text-[8.5px] uppercase shrink-0 ${
                                      isInput
                                        ? "bg-purple-500/25 text-purple-200 border border-purple-500/40"
                                        : isBtn
                                        ? "bg-indigo-500/35 text-indigo-200 border border-indigo-400/50"
                                        : "bg-slate-800 text-slate-300 border border-slate-700"
                                    }`}
                                  >
                                    {row.badge}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold leading-tight" title={row.label}>
                                      {row.label}
                                    </div>
                                    {row.sub && (
                                      <div className="text-[9px] font-mono text-slate-400 truncate">
                                        {row.sub}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {row.status === "passed" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                ) : row.status === "failed" ? (
                                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                ) : (
                                  <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                                )}
                              </div>
                            )
                          })
                        ) : is404 ? (
                          <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/40 text-[10px] text-rose-200 space-y-1">
                            <div className="font-bold">Broken Navigation Link</div>
                            <div className="text-slate-300 font-mono text-[9.5px]">
                              Navigating to {routePath} yielded no interactive DOM controls (404).
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] text-slate-300">
                            <div className="font-semibold text-white">{cleanTitle}</div>
                            <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                              Double-click to inspect full screen details
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. Phone Bottom Bar & iOS Home Indicator */}
                    <div className="px-2.5 pt-1.5 pb-1.5 bg-slate-950 border-t border-slate-800/90 flex flex-col gap-1 shrink-0">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-300 font-mono font-semibold">
                          {elementsCount} UI Els · {nodeSteps.length} Steps
                        </span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            setInspectingNodeId(node.id)
                            setInspectorSubTab("operations")
                            onSelectScreen?.(node.id)
                          }}
                          className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition cursor-pointer shadow-xs"
                        >
                          Open Screen ↗
                        </button>
                      </div>
                      {/* Home Bar Pill */}
                      <div className="w-20 h-1 rounded-full bg-slate-600/80 mx-auto" />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. Figma Journey & Multi-Select Floating Dock */}
      {selectedNodeIds.size > 0 ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-amber-500/50 shadow-2xl text-xs text-white animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[95vw]">
          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold font-mono text-[11px] shrink-0">
            Journey ({activeJourney.orderedIds.length} {activeJourney.orderedIds.length === 1 ? "Screen" : "Screens"})
          </span>
          <span
            className="text-[11px] font-mono text-amber-200 bg-slate-950/90 border border-amber-500/30 px-2 py-0.5 rounded-md truncate max-w-[260px] sm:max-w-[360px]"
            title={activeJourney.orderedIds.join(" → ")}
          >
            {activeJourney.orderedIds.join(" → ")}
          </span>
          <button
            type="button"
            onClick={handleCopyJourney}
            className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer flex items-center gap-1 shrink-0 ${
              copiedJourney
                ? "bg-emerald-600 text-white"
                : "bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 border border-amber-500/40"
            }`}
            title="Copy whole user journey (screens, transitions, and steps) to clipboard"
          >
            <Check className="h-3 w-3" />
            <span>{copiedJourney ? "Copied!" : "Copy Journey"}</span>
          </button>
          <button
            type="button"
            onClick={handleExportJourneyHtml}
            className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
            title="Export this highlighted screen journey as a standalone interactive HTML file"
          >
            <FileCode className="h-3 w-3" />
            <span>Export Journey HTML</span>
          </button>
          <div className="w-px h-4 bg-slate-700 mx-0.5" />
          <button
            type="button"
            onClick={() => setSelectedNodeIds(new Set(visibleNodes.map((n) => n.id)))}
            className="px-2 py-1 rounded hover:bg-slate-800 text-slate-200 font-medium transition cursor-pointer"
            title="Select all cards"
          >
            Select All
          </button>
          {selectedNodeIds.size >= 2 && (
            <>
              <button
                type="button"
                onClick={() => handleAlignSelected("row")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-medium transition cursor-pointer flex items-center gap-1"
                title="Align selected cards in a horizontal row"
              >
                <Columns className="h-3 w-3" />
                <span>Align Row</span>
              </button>
              <button
                type="button"
                onClick={() => handleAlignSelected("grid")}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-medium transition cursor-pointer flex items-center gap-1"
                title="Pack selected cards into a tidy grid"
              >
                <LayoutGrid className="h-3 w-3" />
                <span>Grid</span>
              </button>
            </>
          )}
          {selectedNodeIds.size === 1 && (
            <button
              type="button"
              onClick={() => {
                const onlyId = Array.from(selectedNodeIds)[0]
                if (onlyId) {
                  setInspectingNodeId(onlyId)
                  setInspectorSubTab("operations")
                }
              }}
              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <Eye className="h-3 w-3" />
              <span>Inspect</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              selectedNodeIds.forEach((id) => handleDeleteNode(id))
              setSelectedNodeIds(new Set())
            }}
            className="px-2 py-1 rounded hover:bg-rose-950/60 text-rose-400 hover:text-rose-200 font-medium transition cursor-pointer flex items-center gap-1"
            title="Delete selected cards"
          >
            <Trash2 className="h-3 w-3" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedNodeIds(new Set())}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Clear selection (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="absolute bottom-3 left-3 z-30 pointer-events-none hidden sm:flex items-center gap-2 bg-slate-900/85 backdrop-blur px-2.5 py-1 rounded-md border border-slate-800 text-[10px] text-slate-400 shadow">
          <MousePointer className="h-3 w-3 text-indigo-400" />
          <span>Drag box or Shift+click to select multiple cards • Drag any selected card to move group • Double-click to inspect</span>
        </div>
      )}

      {/* 4. BIG CARD & SIDE OPERATIONS INSPECTOR MODAL */}
      {inspectingNode && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setInspectingNodeId(null)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {inspectingNode.id}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {inspectingScreen?.name || inspectingNode.title.replace(/^S\d+\s*/i, "")}
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {inspectingScreen?.url || inspectingNode.url || "/"}
                  </div>
                </div>
              </div>

              {/* Prev / Next Node Switcher & Delete & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    handleDeleteNode(inspectingNode.id, e)
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 flex items-center gap-1.5 transition cursor-pointer"
                  title="Delete this screen from application map"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>Delete Screen</span>
                </button>

                {visibleNodes.length > 1 && (
                  <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5 text-xs text-slate-300">
                    <button
                      type="button"
                      disabled={inspectingIndex <= 0}
                      onClick={() => {
                        if (inspectingIndex > 0) {
                          setInspectingNodeId(visibleNodes[inspectingIndex - 1].id)
                        }
                      }}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                      title="Previous Screen"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-2 text-[10px] font-mono text-slate-400">
                      {inspectingIndex + 1} / {visibleNodes.length}
                    </span>
                    <button
                      type="button"
                      disabled={inspectingIndex >= visibleNodes.length - 1}
                      onClick={() => {
                        if (inspectingIndex < visibleNodes.length - 1) {
                          setInspectingNodeId(visibleNodes[inspectingIndex + 1].id)
                        }
                      }}
                      className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                      title="Next Screen"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setInspectingNodeId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close Inspector (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Two Columns (Left: Big Card, Right: Side Operations) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* LEFT COLUMN: THE BIG CARD */}
              <div className="lg:col-span-5 p-4 bg-slate-950/60 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between overflow-y-auto custom-scrollbar space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px] truncate">
                        {activeOperation
                          ? `Screen: ${activeOperation.targetName}`
                          : "Big Screen Card"}
                      </span>
                      {activeOperation && (
                        <span
                          className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] uppercase shrink-0 ${
                            activeOperation.status === "passed"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : activeOperation.status === "failed"
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {activeOperation.status}
                        </span>
                      )}
                    </div>
                    {activeScreenshot && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onViewScreenshot) {
                            onViewScreenshot(activeScreenshot!)
                          } else {
                            setEvidencePreviewModal(activeScreenshot!)
                          }
                        }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer shrink-0"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Enlarge Screenshot</span>
                      </button>
                    )}
                  </div>

                  {/* Big Card Image Frame */}
                  <div className="rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-lg relative group aspect-[4/3] flex items-center justify-center">
                    {activeScreenshot ? (
                      <>
                        <img
                          src={activeScreenshot}
                          alt={activeOperation ? activeOperation.targetName : inspectingNode.title}
                          className="w-full h-full object-cover object-top"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewScreenshot) {
                              onViewScreenshot(activeScreenshot!)
                            } else {
                              setEvidencePreviewModal(activeScreenshot!)
                            }
                          }}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Maximize2 className="h-4 w-4" />
                          <span>View Full Resolution</span>
                        </button>
                      </>
                    ) : (
                      <div className="p-6 text-center text-slate-500 flex flex-col items-center">
                        <Layers className="h-8 w-8 mb-2 text-slate-600" />
                        <span className="text-xs">No screenshot captured</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Screen Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs font-bold text-white font-mono">
                        {inspectingScreen?.actionableElements?.length || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Elements</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs font-bold text-indigo-300 font-mono">
                        {screenOperations.length}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Operations</div>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="text-xs font-bold text-emerald-300 font-mono">
                        {outgoingTransitions.length}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Transitions</div>
                    </div>
                  </div>

                  {/* Incoming / Discovery Context */}
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] space-y-1">
                    <span className="text-slate-400 font-medium block">Route Path:</span>
                    <div className="font-mono text-slate-300 break-all text-[10px]">
                      {inspectingScreen?.path || inspectingNode.url || "/"}
                    </div>
                    {incomingTransitions.length > 0 && (
                      <div className="pt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
                        <span>Reached from</span>
                        <span className="px-1 py-0.2 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono font-bold">
                          {incomingTransitions[0].from}
                        </span>
                        <span>via &quot;{incomingTransitions[0].label}&quot;</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Left Column Bottom Action */}
                {onSelectScreen && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectScreen(inspectingNode.id)
                      setInspectingNodeId(null)
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Open in Discovered Screens Tab</span>
                  </button>
                )}
              </div>

              {/* RIGHT COLUMN: SIDE OPERATIONS IT HAS DONE */}
              <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-900 overflow-hidden">
                {/* Operations Subtab Header */}
                <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs shrink-0 overflow-x-auto custom-scrollbar">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setInspectorSubTab("operations")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        inspectorSubTab === "operations"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Operations Done ({screenOperations.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectorSubTab("transitions")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        inspectorSubTab === "transitions"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>Side Navigations ({outgoingTransitions.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectorSubTab("elements")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                        inspectorSubTab === "elements"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Elements ({inspectingScreen?.actionableElements?.length || 0})</span>
                    </button>
                  </div>

                  {/* Operation Status Filter when on operations tab */}
                  {inspectorSubTab === "operations" && screenOperations.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] shrink-0 ml-2">
                      {(["all", "passed", "failed"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setOperationFilter(st)}
                          className={`px-2 py-0.5 rounded capitalize transition cursor-pointer ${
                            operationFilter === st
                              ? "bg-slate-800 text-white font-bold border border-slate-700"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Operations Subtab Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-2.5">
                  {/* TAB 1: OPERATIONS & TESTS DONE */}
                  {inspectorSubTab === "operations" && (
                    <>
                      {filteredScreenOperations.length > 0 ? (
                        filteredScreenOperations.map((op) => {
                          const isPassed = op.status === "passed"
                          const isFailed = op.status === "failed"
                          const isRunning = op.status === "running"
                          const isSelected = activeOperation?.id === op.id

                          return (
                            <div
                              key={op.id}
                              onClick={() => setSelectedOperationId(op.id)}
                              className={`p-3 rounded-xl border text-xs space-y-1.5 transition cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-950/50 border-indigo-500 ring-2 ring-indigo-500/60 shadow-lg shadow-indigo-950"
                                  : isPassed
                                  ? "bg-emerald-950/20 border-emerald-800/40 hover:border-emerald-600/60"
                                  : isFailed
                                  ? "bg-rose-950/20 border-rose-800/40 hover:border-rose-600/60"
                                  : isRunning
                                  ? "bg-indigo-950/30 border-indigo-500 shadow-md animate-pulse"
                                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-slate-500 font-bold text-[11px]">
                                    #{op.stepIndex}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                                      op.actionType === "fill"
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : op.actionType === "click"
                                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                        : op.actionType === "upload"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : "bg-slate-800 text-slate-300 border border-slate-700"
                                    }`}
                                  >
                                    {op.actionType}
                                  </span>
                                  <span className="font-bold text-white truncate max-w-[240px]">
                                    {op.targetName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isSelected && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white flex items-center gap-1 shadow-xs">
                                      <Eye className="h-2.5 w-2.5" /> SCREEN
                                    </span>
                                  )}
                                  {isPassed && (
                                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> PASS
                                    </span>
                                  )}
                                  {isFailed && (
                                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                      <XCircle className="h-3 w-3" /> FAIL
                                    </span>
                                  )}
                                  {isRunning && (
                                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-500/30 text-indigo-300 border border-indigo-400 flex items-center gap-1">
                                      <Clock className="h-3 w-3 animate-spin" /> RUNNING
                                    </span>
                                  )}
                                  {op.status === "pending" && (
                                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                                      PENDING
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Target Selector */}
                              {op.targetSelector && (
                                <div className="text-[10px] font-mono text-slate-500 truncate">
                                  Selector: {op.targetSelector}
                                </div>
                              )}

                              {/* Synthetic Value */}
                              {op.syntheticValue && (
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span className="text-slate-400 font-medium">Input Value:</span>
                                  <code className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-indigo-300 font-mono">
                                    {op.syntheticValue}
                                  </code>
                                  <span className="text-[9px] text-emerald-400/80">(Synthetic Faker)</span>
                                </div>
                              )}

                              {/* Expected vs Actual */}
                              <div className="pt-1.5 border-t border-slate-800/60 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px]">
                                <div>
                                  <span className="text-slate-400 font-medium">Expected: </span>
                                  <span className="text-slate-300">{op.expectedResult}</span>
                                </div>
                                {op.actualResult && (
                                  <div>
                                    <span className="text-slate-400 font-medium">Observed: </span>
                                    <span className={isPassed ? "text-emerald-300 font-medium" : "text-rose-300 font-medium"}>
                                      {op.actualResult}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Step Evidence Screenshot */}
                              {op.screenshotUrl && (
                                <div className="pt-1 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEvidencePreviewModal(op.screenshotUrl!)}
                                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                                  >
                                    <Eye className="h-3 w-3 text-indigo-400" />
                                    <span>View Evidence Screenshot</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <div className="p-8 text-center text-slate-500 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 space-y-1">
                          <Sparkles className="h-6 w-6 text-slate-600 mx-auto mb-1" />
                          <p className="text-xs text-slate-400 font-semibold">
                            No executed test operations recorded for this screen.
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Run Full App Testing to execute structured operations on this screen.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* TAB 2: OUTGOING NAVIGATIONS (WHERE IT GOES NEXT) */}
                  {inspectorSubTab === "transitions" && (
                    <div className="space-y-2">
                      {outgoingTransitions.length > 0 ? (
                        outgoingTransitions.map((t, idx) => {
                          const targetScreen = screensMap.get(t.toScreenId)
                          const targetNode = visibleNodes.find((n) => n.id === t.toScreenId)

                          return (
                            <div
                              key={t.id || idx}
                              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 transition flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    Action
                                  </span>
                                  <span className="font-bold text-white truncate">
                                    {t.action}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                  <span>Navigates to:</span>
                                  <span className="font-mono text-indigo-300 font-bold">
                                    {t.toScreenId}
                                  </span>
                                  <span className="truncate">
                                    ({targetScreen?.name || targetNode?.title || "Screen"})
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setInspectingNodeId(t.toScreenId)
                                  setInspectorSubTab("operations")
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shrink-0"
                              >
                                <span>Inspect Screen</span>
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })
                      ) : (
                        <div className="p-8 text-center text-slate-500 rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                          <Compass className="h-6 w-6 text-slate-600 mx-auto mb-1" />
                          <p className="text-xs text-slate-400 font-semibold">
                            No outgoing transitions from this screen.
                          </p>
                          <p className="text-[11px] text-slate-500">
                            This screen is a terminal node or leaf screen in the mapped flow.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: DISCOVERED ACTIONABLE ELEMENTS */}
                  {inspectorSubTab === "elements" && (
                    <div className="space-y-1.5">
                      {inspectingScreen && inspectingScreen.actionableElements.length > 0 ? (
                        inspectingScreen.actionableElements.map((elem, elemIndex) => (
                          <div
                            key={`${elem.id}-${elemIndex}`}
                            className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                                    elem.type === "button"
                                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                      : elem.type === "input"
                                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                      : elem.type === "file_upload"
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : "bg-slate-800 text-slate-400 border border-slate-700"
                                  }`}
                                >
                                  {elem.type}
                                </span>
                                <span className="font-semibold text-white truncate">{elem.name}</span>
                              </div>
                              {elem.selector && (
                                <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                                  {elem.selector}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              {elem.isInteractive ? "Interactive" : "Static"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-500 rounded-xl bg-slate-950/40 border border-dashed border-slate-800">
                          <Layers className="h-6 w-6 text-slate-600 mx-auto mb-1" />
                          <p className="text-xs text-slate-400">
                            Actionable elements list will populate after discovery phase runs.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. FULL-RESOLUTION EVIDENCE / SCREENSHOT PREVIEW MODAL */}
      {evidencePreviewModal && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setEvidencePreviewModal(null)}
        >
          <div
            className="max-w-5xl max-h-[92vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 p-2 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-1.5 mb-1 text-xs text-slate-300 border-b border-slate-800">
              <span className="font-semibold">Step Evidence Screenshot</span>
              <button
                type="button"
                onClick={() => setEvidencePreviewModal(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={evidencePreviewModal}
              alt="Evidence Preview"
              className="max-w-full max-h-[84vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
