# Recording script (approximately two minutes)

Only quote metrics after the browser script has successfully generated them.

**0:00–0:20 — Problem and target**
“Open Design AI helps inspect application screens. Here is a small test shop with a working order flow. We created three deliberate visual defects so we can check the results against known ground truth.”

Show the baseline, enter a fictional email, and click Complete demo order. Point out that no payment occurs.

**0:20–0:45 — Deliberate changes**
Show the missing-button, shifted-card, and low-contrast URLs. Describe them as planted defects, not discoveries on a real customer's website.

**0:45–1:10 — Reproducible execution**
Run `npx --yes tsx@4.23.15 tests/opencv-demo/run.ts`, or show the completed GitHub Actions run. Explain that the runner captures real browser screenshots and uses the project's production OpenCV preprocessor. It refuses to accept the fallback engine as OpenCV evidence.

**1:10–1:45 — Image evidence and results**
Open `artifacts/report.html`. Show reference, candidate, binary difference mask, Canny edges, and the production annotation. Read the actual changed-pixel ratios and observed outcomes from the generated report. Explain that the unchanged page is the negative control.

**1:45–2:00 — Limits and deployment**
“This is a controlled demonstration at one viewport. It measures visual changes rather than inferring every usability defect. Here are our reproducible instructions and machine-readable results.”

If AWS has actually been deployed, show its live endpoint and explain which component executes there. Otherwise describe AWS deployment as pending. Do not use this local report as proof of a cloud deployment.
