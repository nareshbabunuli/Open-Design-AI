import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { detectVisualElements, matchVisualToDom } from "../lib/ai-automation/opencv-element-detector"
import { calculateAiOpenCvLayout, loadOpenCvForLayout } from "../lib/ai-automation/opencv-layout-optimizer"

async function fixture(width = 640, height = 480, alpha = false) {
  const box = width < 320 ? { x: 30, y: 30, width: 90, height: 40 } : { x: 100, y: 80, width: 120, height: 50 }
  const image = await sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#ffffff" } })
    .composite([{ input: await sharp({ create: { width: box.width, height: box.height, channels: 3, background: "#205fe0" } }).png().toBuffer(), left: box.x, top: box.y }]).png().toBuffer()
  return { image, box }
}

function assertDetected(candidates: Awaited<ReturnType<typeof detectVisualElements>>, box: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const matching = candidates.find(candidate => Math.abs(candidate.x - box.x) < 8 && Math.abs(candidate.y - box.y) < 8 && Math.abs(candidate.width - box.width) < 12 && Math.abs(candidate.height - box.height) < 12)
  assert.ok(matching, `No correctly positioned visual region: ${JSON.stringify(candidates)}`)
  for (const candidate of candidates) {
    assert.ok(candidate.x >= 0 && candidate.y >= 0)
    assert.ok(candidate.x + candidate.width <= width && candidate.y + candidate.height <= height)
    assert.ok(Number.isFinite(candidate.prominence) && candidate.prominence >= 0 && candidate.prominence <= 1)
  }
  assert.equal(matchVisualToDom(matching, [box]), 0)
}

test("actual OpenCV 5 detects a PNG region and maps it to its DOM bounds", async () => {
  const cv = await loadOpenCvForLayout()
  assert.match(cv.getBuildInformation(), /OpenCV 5\./)
  const { image, box } = await fixture()
  for (const scale of [1, 0.6, 0.4]) assertDetected(await detectVisualElements(image, { scale }), box, 640, 480)
})

test("JPEG and transparent PNG screenshots also produce visual regions", async () => {
  const { image, box } = await fixture()
  assertDetected(await detectVisualElements(await sharp(image).jpeg().toBuffer()), box, 640, 480)
  const transparent = await fixture(640, 480, true)
  assertDetected(await detectVisualElements(transparent.image), transparent.box, 640, 480)
})

test("small screenshots use their actual scale instead of inflating detection coordinates", async () => {
  const { image, box } = await fixture(180, 120)
  assertDetected(await detectVisualElements(image), box, 180, 120)
})

test("blank screenshots have no regions and invalid screenshots fail safely", async () => {
  const blank = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#ffffff" } }).png().toBuffer()
  assert.deepEqual(await detectVisualElements(blank), [])
  assert.deepEqual(await detectVisualElements(Buffer.from("invalid screenshot")), [])
})

test("candidate limits and invalid scaling do not produce misleading coordinates", async () => {
  const { image } = await fixture()
  assert.deepEqual(await detectVisualElements(image, { maxCandidates: 0 }), [])
  for (const scale of [0, -1, NaN, Infinity, 2]) assert.deepEqual(await detectVisualElements(image, { scale }), [])
})

test("repeated contour detections remain stable", async () => {
  const { image, box } = await fixture()
  for (let i = 0; i < 15; i++) assertDetected(await detectVisualElements(image), box, 640, 480)
})

test("OpenCV graph auto-layout remains enabled and returns finite positions", async () => {
  const graph: Parameters<typeof calculateAiOpenCvLayout>[0] = { nodes: [{ id: "a", title: "Start", url: "https://example.test/start" }, { id: "b", title: "Finish", url: "https://example.test/finish" }], edges: [{ from: "a", to: "b", label: "Continue" }] }
  const result = await calculateAiOpenCvLayout(graph)
  assert.equal(result.metrics.opencvEnhanced, true)
  assert.equal(result.metrics.cardCollisions, 0)
  for (const id of ["a", "b"]) {
    assert.ok(Number.isFinite(result.positions[id].x) && Number.isFinite(result.positions[id].y))
  }
})
