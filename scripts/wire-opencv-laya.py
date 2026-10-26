#!/usr/bin/env python3
"""Wire OpenCV vision helper into human-test-loop.ts"""
from pathlib import Path
import sys

path = Path("lib/ai-automation/human-test-loop.ts")
text = path.read_text()

old_vision = """    // Capture screenshot buffer for visual preprocessing
    let screenshotBuffer: Buffer | undefined
    let visualFeatures: any = undefined
    try {
      const screenshot = await page.screenshot({ type: "png" }).catch(() => undefined)
      screenshotBuffer = screenshot ? Buffer.from(screenshot) : undefined
      if (screenshotBuffer) {
        // Import vision preprocessor dynamically to avoid dependency issues
        const { preprocessScreenshotForLaya } = await import("./vision-preprocessor").catch(() => ({ preprocessScreenshotForLaya: null }))
        if (preprocessScreenshotForLaya) {
          visualFeatures = await preprocessScreenshotForLaya(
            screenshotBuffer,
            state.elements
              .filter(el => el.selector) // Filter out elements without selectors
              .map(el => ({
                selector: el.selector!,
                bounds: el.bounds,
                label: el.label,
                type: el.type,
              }))
          )
          appendLog(job, "info", `[VisionPreprocessor] Extracted ${visualFeatures.features.elementBoundingBoxes.length} element features; hierarchy depth: ${visualFeatures.features.visualHierarchy.length}`)
        }
      }
    } catch (visionError: any) {
      appendLog(job, "warn", `[VisionPreprocessor] Visual preprocessing failed: ${visionError?.message || String(visionError)}`)
    }"""

new_vision = """    // Capture screenshot + OpenCV vision for Laya
    let screenshotBuffer: Buffer | undefined
    let visualFeatures: any = undefined
    try {
      const screenshot = await page.screenshot({ type: "png" }).catch(() => undefined)
      screenshotBuffer = screenshot ? Buffer.from(screenshot) : undefined
      if (screenshotBuffer) {
        const { runHumanLoopVision } = await import("./human-loop-vision").catch(() => ({ runHumanLoopVision: null as any }))
        const domForVision = state.elements
          .filter((el: any) => el.selector)
          .map((el: any) => ({
            selector: el.selector!,
            bounds: el.bounds,
            label: el.label,
            type: el.type,
          }))
        if (runHumanLoopVision) {
          visualFeatures = await runHumanLoopVision(screenshotBuffer, domForVision)
        }
        if (visualFeatures?.features) {
          const engine = visualFeatures.engine || "unknown"
          appendLog(
            job,
            "info",
            `[VisionPreprocessor] engine=${engine} elements=${visualFeatures.features.elementBoundingBoxes.length} hierarchy=${visualFeatures.features.visualHierarchy.length}`,
          )
        }
      }
    } catch (visionError: any) {
      appendLog(job, "warn", `[VisionPreprocessor] Visual preprocessing failed: ${visionError?.message || String(visionError)}`)
    }"""

if old_vision not in text:
    print("VISION_BLOCK_NOT_FOUND", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_vision, new_vision)

old_criteria = "    const criteria = chooseCriteria(decisionCandidates)\n"
if old_criteria not in text:
    print("CRITERIA_DECL_NOT_FOUND", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_criteria, "", 1)

old_laya = """    try {
      // Prepare state payload with optional visual context
      const statePayload: any = {
        url: state.url,
        title: state.title,
        route: state.route,
        interactiveCount: state.elements.length,
        forms: state.forms.length,
        tables: state.tables.map((t) => ({ name: t.name, rows: t.rowCount, empty: t.hasExplicitEmptyState })),
        dialogs: state.dialogs.length,
        consoleErrors: runtimeEvidence.consoleErrors.slice(-5),
        pageErrors: runtimeEvidence.pageErrors.slice(-5),
        failedRequests: runtimeEvidence.failedRequests.slice(-5),
        badResponses: runtimeEvidence.badResponses.slice(-5),
        previousTestIds: [...tested].slice(-20),
      }
      
      // Add visual context if available
      if (beforeScreenshotUrl || visualFeatures) {
        statePayload.visual = {
          screenshotUrl: beforeScreenshotUrl || undefined,
          screenshotCapturedAt: Date.now(),
          ...(visualFeatures?.features && {
            elementCount: visualFeatures.features.elementBoundingBoxes.length,
            topElements: visualFeatures.features.visualHierarchy.slice(0, 10).map((el: any) => ({
              selector: el.selector,
              rank: el.rank,
              prominence: el.prominence,
            })),
            layoutClusters: visualFeatures.features.layoutClusters.map((cluster: any) => ({
              group: cluster.spatialGroup,
              elementCount: cluster.elements.length,
            })),
          }),
        }
        appendLog(job, "info", `[HumanLoop] Sending visual context to Laya: screenshot=${!!beforeScreenshotUrl}, features=${!!visualFeatures}`)
      }
      
      const result = await layaPredict(layaUrl, {
        state: JSON.stringify(statePayload),
        questions: {
          next_test: {
            type: "choice",
            instructions: "Choose the safest meaningful untested candidate. Prefer high-value coverage and do not choose escalate unless no candidate is useful.",
            criteria,
          },
        },
      })"""

new_laya = """    // Enrich criteria with OpenCV visual ranks before asking Laya
    let criteria = chooseCriteria(decisionCandidates)
    let layaInstructions =
      "Choose the safest meaningful untested candidate. Prefer high-value coverage and do not choose escalate unless no candidate is useful."
    try {
      const { enrichCriteriaWithVision, LAYA_VISION_INSTRUCTIONS } = await import("./human-loop-vision")
      criteria = enrichCriteriaWithVision(criteria, decisionCandidates, visualFeatures)
      layaInstructions = LAYA_VISION_INSTRUCTIONS
    } catch {
      // human-loop-vision unavailable — keep defaults
    }

    try {
      // Prepare state payload with optional visual context
      const statePayload: any = {
        url: state.url,
        title: state.title,
        route: state.route,
        interactiveCount: state.elements.length,
        forms: state.forms.length,
        tables: state.tables.map((t) => ({ name: t.name, rows: t.rowCount, empty: t.hasExplicitEmptyState })),
        dialogs: state.dialogs.length,
        consoleErrors: runtimeEvidence.consoleErrors.slice(-5),
        pageErrors: runtimeEvidence.pageErrors.slice(-5),
        failedRequests: runtimeEvidence.failedRequests.slice(-5),
        badResponses: runtimeEvidence.badResponses.slice(-5),
        previousTestIds: [...tested].slice(-20),
        visionEngine: visualFeatures?.engine || null,
      }

      // Add visual context if available
      if (beforeScreenshotUrl || visualFeatures) {
        statePayload.visual = {
          screenshotUrl: beforeScreenshotUrl || undefined,
          screenshotCapturedAt: Date.now(),
          engine: visualFeatures?.engine || undefined,
          ...(visualFeatures?.features && {
            elementCount: visualFeatures.features.elementBoundingBoxes.length,
            topElements: visualFeatures.features.visualHierarchy.slice(0, 10).map((el: any) => ({
              selector: el.selector,
              rank: el.rank,
              prominence: el.prominence,
            })),
            layoutClusters: visualFeatures.features.layoutClusters.map((cluster: any) => ({
              group: cluster.spatialGroup,
              elementCount: cluster.elements.length,
            })),
          }),
        }
        appendLog(
          job,
          "info",
          `[HumanLoop] Sending visual context to Laya: screenshot=${!!beforeScreenshotUrl}, features=${!!visualFeatures}, engine=${visualFeatures?.engine || "none"}`,
        )
      }

      const result = await layaPredict(layaUrl, {
        state: JSON.stringify(statePayload),
        questions: {
          next_test: {
            type: "choice",
            instructions: layaInstructions,
            criteria,
          },
        },
      })"""

if old_laya not in text:
    print("LAYA_BLOCK_NOT_FOUND", file=sys.stderr)
    sys.exit(1)
text = text.replace(old_laya, new_laya)

text = text.replace(
    " * Laya chooses the next candidate.\n",
    " * OpenCV scores visual prominence; Laya chooses the next candidate using DOM + vision.\n",
    1,
)

path.write_text(text)
print("OK: wired OpenCV into human-test-loop.ts")
print("runHumanLoopVision", "runHumanLoopVision" in text)
print("enrichCriteriaWithVision", "enrichCriteriaWithVision" in text)
print("visionEngine", "visionEngine" in text)
