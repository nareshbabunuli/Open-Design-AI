/**
 * OpenCV-backed vision helpers for the human testing loop.
 * Used by human-test-loop.ts to enrich Laya decisions.
 */
import type { VisualFeatures, DOMElement } from "./vision-preprocessor"

export async function runHumanLoopVision(
  screenshotBuffer: Buffer,
  domElements: DOMElement[],
): Promise<VisualFeatures | undefined> {
  try {
    const visionMod = await import("./vision-preprocessor").catch(() => null as any)
    if (visionMod?.preprocessWithOpenCV) {
      return await visionMod.preprocessWithOpenCV(screenshotBuffer, domElements)
    }
    if (visionMod?.preprocessScreenshotForLaya) {
      return await visionMod.preprocessScreenshotForLaya(screenshotBuffer, domElements)
    }
  } catch (err) {
    console.warn("[HumanLoopVision] failed:", (err as Error)?.message || err)
  }
  return undefined
}

export function enrichCriteriaWithVision(
  baseCriteria: Record<string, string>,
  candidates: Array<{ title: string; pattern: string; risk: string; priority: number; goal: string; target?: { selector?: string } }>,
  visualFeatures?: VisualFeatures,
): Record<string, string> {
  if (!visualFeatures?.features?.visualHierarchy?.length) return baseCriteria

  const rankBySelector = new Map<string, { rank: number; prominence: number }>()
  for (const item of visualFeatures.features.visualHierarchy) {
    rankBySelector.set(item.selector, { rank: item.rank, prominence: item.prominence })
  }

  const enriched: Record<string, string> = {}
  candidates.slice(0, 14).forEach((c, i) => {
    const sel = c.target?.selector || ""
    const vis = sel ? rankBySelector.get(sel) : undefined
    const visTag = vis
      ? ` | visualRank=${vis.rank} | prominence=${Number(vis.prominence).toFixed(2)}`
      : " | visualRank=none"
    const base = baseCriteria[`test_${i}`]
    if (base && !base.includes("visualRank=")) {
      enriched[`test_${i}`] = base + visTag
    } else {
      enriched[`test_${i}`] =
        `${c.title} | pattern=${c.pattern} | risk=${c.risk} | priority=${c.priority} | goal=${c.goal}${visTag}`
    }
  })
  if (baseCriteria.escalate) enriched.escalate = baseCriteria.escalate
  else enriched.escalate = "No safe candidate is appropriate; stop this loop and report blocked coverage."
  return enriched
}

export const LAYA_VISION_INSTRUCTIONS =
  "Choose the safest meaningful untested candidate. Prefer high-value coverage. When visualRank/prominence are present (from OpenCV), prefer candidates that are visually prominent and relevant. Do not choose escalate unless no candidate is useful."
