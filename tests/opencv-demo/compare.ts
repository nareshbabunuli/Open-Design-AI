import sharp from 'sharp'
import { loadOpenCvForLayout } from '../../lib/ai-automation/opencv-layout-optimizer'

/** Pixel evidence only: detects visual changes, does not infer their semantic cause. */
export async function compareImages(reference: Buffer, candidate: Buffer) {
  const cv = await loadOpenCvForLayout()
  const build = cv.getBuildInformation()
  if (!/OpenCV 5\./.test(build)) throw new Error('This demo requires an actual OpenCV 5 runtime')
  const decode = (image: Buffer) => sharp(image).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const [a, b] = await Promise.all([decode(reference), decode(candidate)])
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error('Screenshot dimensions must match')
  const mats: any[] = []
  const mat = (...args: any[]) => { const m = new cv.Mat(...args); mats.push(m); return m }
  const start = performance.now()
  try {
    const left = mat(a.info.height, a.info.width, cv.CV_8UC1)
    const right = mat(b.info.height, b.info.width, cv.CV_8UC1)
    left.data.set(a.data); right.data.set(b.data)
    const diff = mat(), mask = mat(), edges = mat()
    cv.absdiff(left, right, diff)
    cv.threshold(diff, mask, 18, 255, cv.THRESH_BINARY)
    cv.Canny(right, edges, 50, 120)
    const changedPixels = cv.countNonZero(mask)
    const ratio = changedPixels / (a.info.width * a.info.height)
    const elapsedMs = performance.now() - start
    const png = (data: Uint8Array) => sharp(Buffer.from(data), { raw: { width: a.info.width, height: a.info.height, channels: 1 } }).png().toBuffer()
    return {
      engine: 'opencv-js', version: build.match(/OpenCV ([\d.]+)/)?.[1],
      changedPixels, totalPixels: a.info.width * a.info.height, changedRatio: ratio,
      flagged: ratio > 0.002, threshold: 0.002, elapsedMs,
      mask: await png(mask.data), edges: await png(edges.data),
    }
  } finally { for (const m of mats.reverse()) m.delete() }
}
