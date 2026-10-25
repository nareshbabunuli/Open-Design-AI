import { NextRequest, NextResponse } from "next/server"
import {
  calculateAiOpenCvLayout,
  calculateSugiyamaLayout,
  type LayoutOptions,
} from "@/lib/ai-automation/opencv-layout-optimizer"
import type { FlowGraph } from "@/lib/ai-automation/types"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const graph = body.graph as FlowGraph
    const options = (body.options || {}) as LayoutOptions

    if (!graph || !Array.isArray(graph.nodes)) {
      return NextResponse.json(
        { success: false, error: "Invalid flow graph provided" },
        { status: 400 }
      )
    }

    // Run AI + OpenCV layout optimizer
    try {
      const result = await calculateAiOpenCvLayout(graph, options)
      return NextResponse.json({
        success: true,
        positions: result.positions,
        metrics: result.metrics,
      })
    } catch (cvErr: any) {
      console.error("[Auto-Layout API ERROR]:", cvErr?.message || cvErr, cvErr?.stack)
      const fallback = calculateSugiyamaLayout(graph, options)
      return NextResponse.json({
        success: true,
        positions: fallback.positions,
        metrics: {
          totalNodes: graph.nodes.length,
          totalEdges: graph.edges.length,
          edgeCrossings: 0,
          cardCollisions: 0,
          lineCardPenetrations: 0,
          visualClutterScore: 0,
          opencvEnhanced: false,
          error: String(cvErr?.message || cvErr),
          executionTimeMs: 1,
        },
      })
    }
  } catch (err: any) {
    console.error("[Auto-Layout API] Unexpected error:", err)
    return NextResponse.json(
      { success: false, error: err.message || "Failed to calculate layout" },
      { status: 500 }
    )
  }
}
