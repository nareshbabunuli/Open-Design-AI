/**
 * OpenCV-based UI Element Detector
 *
 * Detects visually distinct interactive-looking regions (buttons, inputs,
 * cards, etc.) from a screenshot using classic computer-vision techniques.
 * Results are intended to enrich Laya's candidate list so the fast local
 * reflex can make better decisions before escalating to a frontier model.
 */

import { loadOpenCvForLayout } from "./opencv-layout-optimizer"

export interface VisualCandidate {
  id: number
  x: number
  y: number
  width: number
  height: number
  area: number
  aspectRatio: number
  /** Rough visual classification */
  kind: "button" | "input" | "card" | "unknown"
  /** Higher = more visually prominent */
  prominence: number
}

export interface DetectElementsOptions {
  /** Minimum area in pixels (after any downscale) */
  minArea?: number
  /** Maximum number of candidates to return */
  maxCandidates?: number
  /** Downscale factor for faster processing (0.5 = half resolution) */
  scale?: number
}

const DEFAULT_MIN_AREA = 400
const DEFAULT_MAX_CANDIDATES = 18
const DEFAULT_SCALE = 0.6

/**
 * Detect UI-like regions in a screenshot using OpenCV.
 *
 * @param screenshot - PNG/JPEG buffer from Puppeteer page.screenshot()
 * @returns ranked visual candidates (largest / most prominent first)
 */
export async function detectVisualElements(
  screenshot: Buffer,
  options: DetectElementsOptions = {},
): Promise<VisualCandidate[]> {
  const minArea = options.minArea ?? DEFAULT_MIN_AREA
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  const scale = options.scale ?? DEFAULT_SCALE

  let cv: any
  try {
    cv = await loadOpenCvForLayout()
  } catch (err) {
    console.warn("[OpenCV-Detector] OpenCV unavailable:", (err as Error)?.message || err)
    return []
  }

  if (!cv?.Mat || !cv.imread || !cv.Canny) {
    console.warn("[OpenCV-Detector] Required OpenCV APIs missing")
    return []
  }

  // Decode image from buffer
  // @techstark/opencv-js accepts Uint8Array for imdecode in many builds;
  // fall back to a data-URL path if needed.
  let src: any = null
  let gray: any = null
  let blurred: any = null
  let edges: any = null
  let contours: any = null
  let hierarchy: any = null

  try {
    // Prefer imdecode when available
    if (typeof cv.imdecode === "function") {
      const data = new Uint8Array(screenshot)
      const matFromArray = cv.matFromArray
        ? cv.matFromArray(1, data.length, cv.CV_8UC1, data)
        : null
      if (matFromArray) {
        src = cv.imdecode(matFromArray, cv.IMREAD_COLOR)
        matFromArray.delete()
      }
    }

    // Fallback: write to a temporary data URL via canvas-less path is hard in pure Node.
    // Most @techstark/opencv-js builds support imdecode; if not, return empty.
    if (!src || src.empty?.()) {
      console.warn("[OpenCV-Detector] Could not decode screenshot")
      return []
    }

    const origW = src.cols
    const origH = src.rows

    // Optional downscale for speed
    let working = src
    if (scale < 1.0) {
      const newW = Math.max(320, Math.round(origW * scale))
      const newH = Math.max(240, Math.round(origH * scale))
      working = new cv.Mat()
      cv.resize(src, working, new cv.Size(newW, newH), 0, 0, cv.INTER_AREA)
    }

    gray = new cv.Mat()
    cv.cvtColor(working, gray, cv.COLOR_RGBA2GRAY || cv.COLOR_BGR2GRAY)

    blurred = new cv.Mat()
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)

    edges = new cv.Mat()
    cv.Canny(blurred, edges, 50, 150)

    // Dilate to connect broken edges of buttons/inputs
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.dilate(edges, edges, kernel)
    kernel.delete()

    contours = new cv.MatVector()
    hierarchy = new cv.Mat()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const candidates: VisualCandidate[] = []
    const invScale = 1 / scale

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const rect = cv.boundingRect(cnt)
      const area = rect.width * rect.height

      // Filter by area (in original resolution terms)
      const origArea = area * invScale * invScale
      if (origArea < minArea) continue

      // Filter extreme aspect ratios (likely noise or full-width bars)
      const aspect = rect.width / Math.max(1, rect.height)
      if (aspect > 12 || aspect < 0.12) continue

      // Map back to original coordinates
      const x = Math.round(rect.x * invScale)
      const y = Math.round(rect.y * invScale)
      const w = Math.round(rect.width * invScale)
      const h = Math.round(rect.height * invScale)

      // Simple heuristic classification
      let kind: VisualCandidate["kind"] = "unknown"
      if (aspect > 2.5 && h < 60) kind = "input"
      else if (aspect > 1.2 && aspect < 5 && h >= 28 && h <= 70) kind = "button"
      else if (w > 120 && h > 80) kind = "card"

      // Prominence: prefer larger, more central, higher-up elements lightly
      const sizeScore = Math.min(1, origArea / 40000)
      const centerX = (x + w / 2) / origW
      const centerY = (y + h / 2) / origH
      const centrality = 1 - Math.abs(centerX - 0.5) * 0.6 - Math.abs(centerY - 0.4) * 0.4
      const prominence = Number((sizeScore * 0.65 + Math.max(0, centrality) * 0.35).toFixed(3))

      candidates.push({
        id: candidates.length,
        x,
        y,
        width: w,
        height: h,
        area: Math.round(origArea),
        aspectRatio: Number(aspect.toFixed(2)),
        kind,
        prominence,
      })
    }

    // Sort by prominence descending and limit
    candidates.sort((a, b) => b.prominence - a.prominence)
    return candidates.slice(0, maxCandidates)
  } catch (err) {
    console.warn("[OpenCV-Detector] Processing error:", (err as Error)?.message || err)
    return []
  } finally {
    try {
      src?.delete?.()
      gray?.delete?.()
      blurred?.delete?.()
      edges?.delete?.()
      contours?.delete?.()
      hierarchy?.delete?.()
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Match a visual candidate to the closest DOM candidate by center distance / IoU.
 * Returns the index into the DOM list, or -1 if no reasonable match.
 */
export function matchVisualToDom(
  visual: VisualCandidate,
  domBoxes: Array<{ x: number; y: number; width: number; height: number }>,
  maxDistance = 80,
): number {
  let bestIdx = -1
  let bestScore = -Infinity

  const vx = visual.x + visual.width / 2
  const vy = visual.y + visual.height / 2

  for (let i = 0; i < domBoxes.length; i++) {
    const d = domBoxes[i]
    const dx = d.x + d.width / 2
    const dy = d.y + d.height / 2
    const dist = Math.hypot(vx - dx, vy - dy)
    if (dist > maxDistance) continue

    // Simple IoU-ish score
    const x1 = Math.max(visual.x, d.x)
    const y1 = Math.max(visual.y, d.y)
    const x2 = Math.min(visual.x + visual.width, d.x + d.width)
    const y2 = Math.min(visual.y + visual.height, d.y + d.height)
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    const union = visual.area + d.width * d.height - inter
    const iou = union > 0 ? inter / union : 0

    const score = iou * 2 - dist / maxDistance
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  return bestIdx
}
