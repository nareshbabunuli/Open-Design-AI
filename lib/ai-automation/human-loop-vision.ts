/**
 * OpenCV-backed vision helpers for the human testing loop.
 * Used by human-test-loop.ts to enrich Laya decisions.
 */
import type { VisualFeatures, DOMElement } from "./vision-preprocessor"

/** Crop only the relevant visible controls, then bound the actual vision payload. */
export async function prepareDecisionImage(
  maskedScreenshot: Buffer, regions: Array<{ x: number; y: number; width: number; height: number }> = [], viewportWidth?: number,
): Promise<string> {
  const sharp = (await import("sharp")).default
  const metadata = await sharp(maskedScreenshot).metadata()
  const width = metadata.width || 1, height = metadata.height || 1
  const scale = viewportWidth ? width / viewportWidth : 1
  const visible = regions.map(r => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale }))
    .filter(r => r.width > 0 && r.height > 0 && r.x < width && r.y < height && r.x + r.width > 0 && r.y + r.height > 0)
  let image = sharp(maskedScreenshot)
  if (visible.length) {
    const left = Math.max(0, Math.floor(Math.min(...visible.map(r => r.x)) - 40))
    const top = Math.max(0, Math.floor(Math.min(...visible.map(r => r.y)) - 40))
    const right = Math.min(width, Math.ceil(Math.max(...visible.map(r => r.x + r.width)) + 40))
    const bottom = Math.min(height, Math.ceil(Math.max(...visible.map(r => r.y + r.height)) + 40))
    if (right > left && bottom > top) image = image.extract({ left, top, width: right - left, height: bottom - top })
  }
  const encoded = await image.resize({ width: 960, height: 720, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 65 }).toBuffer()
  return `data:image/jpeg;base64,${encoded.toString("base64")}`
}

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
