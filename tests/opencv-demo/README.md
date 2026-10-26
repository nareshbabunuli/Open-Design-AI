# OpenCV 5 demonstration target

This folder contains a basic test website and a repeatable evidence script for Open Design AI. It uses the project's existing OpenCV 5 package and imports its production `preprocessWithOpenCV` pipeline. It does not require an AI key, Supabase account, or payment service.

## Run the test website

From the repository root, after installing dependencies:

```bash
node tests/opencv-demo/server.mjs
```

Open `http://127.0.0.1:4173/`. The baseline has an email field, quantity field, and working demo-order button. These variants deliberately introduce defects:

- `/?variant=missing-button`: hidden checkout button.
- `/?variant=shifted-card`: order-summary card displaced 85 pixels.
- `/?variant=low-contrast`: pale checkout button and text.

Use these URLs as targets in Open Design AI in local development. Suggested manual test instruction:

> Inspect this product page. Enter a fictional delivery email and quantity, complete the demo order, and verify the confirmation. Capture the screen and show the OpenCV-backed visual evidence. Do not use real credentials or payment details.

Production automation's network restrictions may block localhost; host the fixture on an approved public target for a deployed demonstration. The fixture itself contains no external assets or credentials.

## Generate measured evidence

The script starts its own local fixture server. No separate server terminal is required:

```bash
pnpm install --frozen-lockfile
pnpm exec puppeteer browsers install chrome
npx --yes tsx@4.23.15 --test tests/opencv-demo/self-test.ts
npx --yes tsx@4.23.15 tests/opencv-demo/run.ts
```

If an existing Chrome installation is required, set `PUPPETEER_EXECUTABLE_PATH` to its executable. Linux containers that cannot use Chrome's sandbox may need `PUPPETEER_NO_SANDBOX=true`; use that option only in an isolated test environment.

Open `tests/opencv-demo/artifacts/report.html` after a successful run. It includes:

1. Baseline and candidate screenshots for one negative control and three known regressions.
2. Real OpenCV 5 `absdiff`, binary threshold masks, changed-pixel counts and ratios, and Canny edge maps.
3. An annotation and feature ranking from Open Design AI's production preprocessor. A heuristic fallback is rejected.
4. JSON results with the actual engine version, viewport, CV processing times, known-label outcomes, and a separate functional smoke check.

A grayscale intensity difference greater than 18 contributes to the change mask. The candidate is flagged when more than 0.2% of screenshot pixels change. These fixed demo thresholds are not a universal visual-testing standard. CV timings exclude decoding and report generation and are not end-to-end latency.

The script exits nonzero if a deliberate regression is missed, the unchanged control is flagged, the order confirmation fails, or OpenCV 5 is unavailable. It does not silently substitute another vision engine.

## Automated run

The `OpenCV demo evidence` GitHub Actions workflow runs on this folder's pull requests and can be run manually after merging. Download its `opencv-demo-evidence` artifact to view the report and images. Evidence is generated from that actual run, not committed as fabricated benchmark output.

## What this establishes

The self-test runs OpenCV 5 and the production preprocessing pipeline on synthetic images: an identical image must produce zero differences, and a removed 120×40 rectangle must produce exactly 4,800 changed pixels. This verifies the analysis path without requiring Chrome.

The browser script additionally tests the real website rendering. Its four fixtures are a controlled demonstration, not an independent accuracy benchmark. Pixel changes do not prove WCAG compliance or automatically identify the semantic cause of a defect. Cross-browser testing, a larger labeled evaluation set, and AWS deployment evidence remain separate work.
