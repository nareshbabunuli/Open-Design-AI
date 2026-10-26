import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { startDemoServer } from './server.mjs'
import { compareImages } from './compare'
import { preprocessWithOpenCV } from '../../lib/ai-automation/vision-preprocessor'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts')
const cases = [
  { id: 'unchanged', variant: 'baseline', expected: false, description: 'Negative control: the unchanged page' },
  { id: 'missing-button', variant: 'missing-button', expected: true, description: 'Known defect: the checkout button is hidden' },
  { id: 'shifted-card', variant: 'shifted-card', expected: true, description: 'Known defect: the summary card is displaced 85 pixels' },
  { id: 'low-contrast', variant: 'low-contrast', expected: true, description: 'Known defect: the button and its text become pale' },
]
async function main() {
const server = await startDemoServer(0)
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
try {
  browser = await puppeteer.launch({
    headless: true,
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: process.env.PUPPETEER_NO_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 })
  const capture = async (variant: string) => {
    await page.goto(`${server.url}/?variant=${variant}`, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    return Buffer.from(await page.screenshot({ type: 'png' }))
  }
  await mkdir(dir, { recursive: true })
  const baseline = await capture('baseline')
  await writeFile(path.join(dir, 'baseline.png'), baseline)
  const elements = await page.evaluate(() => ['#email', '#quantity', '#checkout'].map(selector => {
    const box = document.querySelector(selector)!.getBoundingClientRect()
    return { selector, bounds: { x: box.x, y: box.y, width: box.width, height: box.height } }
  }))
  const visual = await preprocessWithOpenCV(baseline, elements)
  if (visual.engine !== 'opencv-js') throw new Error('Production preprocessor used its fallback; refusing to claim OpenCV evidence')
  if (visual.annotatedImageBuffer) await writeFile(path.join(dir, 'production-annotation.png'), visual.annotatedImageBuffer)
  // A functional smoke check is kept distinct from visual regression evidence.
  await page.click('#checkout')
  const functionalPass = (await page.$eval('#confirmation', el => el.textContent))?.includes('Demo order complete') === true
  const results = []
  for (const scenario of cases) {
    const image = await capture(scenario.variant)
    const { mask, edges, ...metrics } = await compareImages(baseline, image)
    await writeFile(path.join(dir, `${scenario.id}.png`), image)
    await writeFile(path.join(dir, `${scenario.id}-mask.png`), mask)
    await writeFile(path.join(dir, `${scenario.id}-edges.png`), edges)
    results.push({ ...scenario, ...metrics, correct: metrics.flagged === scenario.expected })
  }
  const positives = results.filter(r => r.expected)
  const negatives = results.filter(r => !r.expected)
  const report = {
    generatedAt: new Date().toISOString(), source: 'Chromium screenshots of target.html',
    viewport: { width: 1200, height: 900 }, functionalPass,
    productionPreprocessor: { engine: visual.engine, features: visual.features },
    metrics: { detectedRegressions: positives.filter(r => r.flagged).length, knownRegressions: positives.length,
      falsePositives: negatives.filter(r => r.flagged).length, negativeControls: negatives.length },
    limitations: 'Four controlled fixtures, one viewport, one browser. Pixel differences do not prove accessibility or identify semantic root causes. Not an independent benchmark or AWS deployment proof.',
    results,
  }
  await writeFile(path.join(dir, 'results.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(dir, 'report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenCV 5 · Visual test evidence</title><style>body{font:16px Arial;background:#f3f6fa;color:#17263e;max-width:1200px;margin:40px auto;padding:20px}section{background:white;padding:24px;border-radius:12px;margin:24px 0}.images{display:flex;gap:12px}.images figure{margin:0;width:33%}img{width:100%;border:1px solid #ccd7e4}p{line-height:1.6}code{background:#e6edf7;padding:4px}</style><h1>OpenCV 5 · Visual regression evidence</h1><p>Measured from actual Chromium screenshots. Production preprocessor: <code>${visual.engine}</code>. Functional order smoke check: ${functionalPass ? 'PASS' : 'FAIL'}.</p><p>Detected ${report.metrics.detectedRegressions}/${positives.length} deliberate regressions; ${report.metrics.falsePositives} false positives across ${negatives.length} negative control.</p><p>${report.limitations}</p><p><a href="results.json">Machine-readable results</a> · <a href="production-annotation.png">Production pipeline annotation</a></p>${results.map(r => `<section><h2>${r.id} · ${r.correct ? 'Expected outcome' : 'Unexpected outcome'}</h2><p>${r.description}. OpenCV ${r.version}: ${(r.changedRatio * 100).toFixed(3)}% changed pixels; ${r.elapsedMs.toFixed(2)} ms CV processing. Threshold: ${(r.threshold * 100).toFixed(1)}%.</p><div class="images"><figure><img alt="Reference page" src="baseline.png"><figcaption>Reference</figcaption></figure><figure><img alt="Candidate page" src="${r.id}.png"><figcaption>Candidate</figcaption></figure><figure><img alt="Thresholded image difference" src="${r.id}-mask.png"><figcaption>OpenCV difference mask</figcaption></figure></div><p><a href="${r.id}-edges.png">Canny edge evidence</a></p></section>`).join('')}</html>`)
  console.table(results.map(r => ({ scenario: r.id, expectedChange: r.expected, detectedChange: r.flagged, changedPercent: (r.changedRatio * 100).toFixed(3), correct: r.correct })))
  console.log(`Report: ${path.join(dir, 'report.html')}`)
  if (!functionalPass || results.some(r => !r.correct)) process.exitCode = 1
} finally {
  await browser?.close()
  await server.close()
}

}
main().catch(error => { console.error("Demo failed:", error.message); process.exitCode = 1 })
