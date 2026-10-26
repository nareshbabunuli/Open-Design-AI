import { createHmac, timingSafeEqual } from "node:crypto"

export type DuoReviewContext = {
  userId: string
  workflowId: string
  projectId: string
  baseBranch: string
  baseCommit: string
  expiresAt: number
}

function signature(payload: string, secret: string) {
  if (secret.length < 32) throw new Error("Repository connection secret is not configured.")
  return createHmac("sha256", secret).update(`duo-review:v1:${payload}`).digest()
}

export function sealDuoReview(context: DuoReviewContext, secret: string) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url")
  return `${payload}.${signature(payload, secret).toString("base64url")}`
}

export function openDuoReview(token: unknown, secret: string, now = Date.now()): DuoReviewContext | null {
  if (typeof token !== "string" || token.length > 8000) return null
  try {
    const [payload, digest, extra] = token.split(".")
    if (!payload || !digest || extra !== undefined) return null
    const expected = signature(payload, secret)
    const received = Buffer.from(digest, "base64url")
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!value || typeof value.userId !== "string" || !/^\d+$/.test(value.workflowId) ||
        !/^\d+$/.test(value.projectId) || typeof value.baseBranch !== "string" || !value.baseBranch ||
        !/^[a-f0-9]{40,64}$/.test(value.baseCommit) || typeof value.expiresAt !== "number" || value.expiresAt <= now) return null
    return value as DuoReviewContext
  } catch { return null }
}
