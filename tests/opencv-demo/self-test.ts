import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { compareImages } from './compare'
import { preprocessWithOpenCV } from '../../lib/ai-automation/vision-preprocessor'

test('actual OpenCV 5 detects a known image change and passes an identical negative control', async () => {
  const blank = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const button = await sharp({ create: { width: 120, height: 40, channels: 3, background: '#205fe0' } }).png().toBuffer()
  const reference = await sharp(blank).composite([{ input: button, left: 100, top: 80 }]).png().toBuffer()
  const same = await compareImages(reference, reference)
  const changed = await compareImages(reference, blank)
  assert.match(same.version || '', /^5\./)
  assert.equal(same.changedPixels, 0)
  assert.equal(same.flagged, false)
  assert.equal(changed.flagged, true)
  assert.equal(changed.changedPixels, 4800)
  assert.equal(changed.changedRatio, 4800 / 64000)
  const production = await preprocessWithOpenCV(reference, [{ selector: '#button', bounds: { x: 100, y: 80, width: 120, height: 40 } }])
  assert.equal(production.engine, 'opencv-js', 'Heuristic fallback is not accepted as OpenCV evidence')
  assert.equal(production.features.elementBoundingBoxes.length, 1)
  assert.ok(production.annotatedImageBuffer?.length)
})

test('mismatched input sizes are rejected rather than compared misleadingly', async () => {
  const image = (width: number) => sharp({ create: { width, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer()
  await assert.rejects(compareImages(await image(100), await image(120)), /dimensions must match/)
})
