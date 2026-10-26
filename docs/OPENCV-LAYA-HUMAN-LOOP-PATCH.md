# Restore human-test-loop.ts + wire OpenCV into Laya

## Why this doc exists

`lib/ai-automation/human-test-loop.ts` was accidentally truncated during an automated edit.
The OpenCV helper is already on the branch:

- `lib/ai-automation/human-loop-vision.ts` (uses `preprocessWithOpenCV` first)
- `lib/ai-automation/vision-preprocessor.ts` (already has real OpenCV Canny path)

## Restore the full file (required)

```bash
git fetch origin
git checkout security/production-hardening-2026-10

# Restore last known good full implementation
git checkout 21f68de81e7695240984c8c9fb9add50ec58095e -- lib/ai-automation/human-test-loop.ts
```

## Wire OpenCV into the human loop (apply these edits)

### 1) Replace the vision preprocessing block

Find the block that imports `preprocessScreenshotForLaya` and replace it with:

```ts
    // Capture screenshot + OpenCV vision for Laya
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
    }
```

### 2) Change `const criteria = chooseCriteria(...)` to later enrichment

Replace:

```ts
    const criteria = chooseCriteria(decisionCandidates)
```

with nothing at that spot (move criteria creation to just before Laya call).

### 3) Before `layaPredict`, enrich criteria + instructions

Insert:

```ts
    let criteria = chooseCriteria(decisionCandidates)
    let layaInstructions =
      "Choose the safest meaningful untested candidate. Prefer high-value coverage and do not choose escalate unless no candidate is useful."
    try {
      const { enrichCriteriaWithVision, LAYA_VISION_INSTRUCTIONS } = await import("./human-loop-vision")
      criteria = enrichCriteriaWithVision(criteria, decisionCandidates, visualFeatures)
      layaInstructions = LAYA_VISION_INSTRUCTIONS
    } catch {
      // helper unavailable
    }
```

And change the Laya question instructions to use `layaInstructions` instead of the hard-coded string.

Also add to `statePayload`:

```ts
        visionEngine: visualFeatures?.engine || null,
```

and under `statePayload.visual`:

```ts
          engine: visualFeatures?.engine || undefined,
```

## Resulting flow

1. Screenshot page
2. OpenCV (`preprocessWithOpenCV`) scores element prominence via edge density
3. Criteria sent to Laya include `visualRank` + `prominence`
4. Laya prefers visually prominent safe candidates
5. Fallback to deterministic selection if Laya is offline/unsure

## Verify

```bash
pnpm run typecheck
# Run a human-loop job and look for logs:
# [VisionPreprocessor] engine=opencv-js ...
# [HumanLoop] Sending visual context to Laya: ... engine=opencv-js
```
