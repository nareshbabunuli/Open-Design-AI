import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/ai-automation/job-store"
import { requireProjectAccess, authErrorResponse, AuthError } from "@/lib/auth/require-project-access"
import { buildResponsiveComparison, summarizeResponsiveRun } from "@/lib/ai-automation/responsive-comparison"
import { renderResponsiveReport } from "@/lib/ai-automation/responsive-report"

export const dynamic = "force-dynamic"
export const maxDuration = 120
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("jobId")
    if (!validId(id)) return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 })
    const job = getJob(id)
    if (!job?.projectId) return NextResponse.json({ error: "Journey not found." }, { status: 404 })
    await requireProjectAccess(job.projectId, "view")
    const group = job.responsiveGroup
    if (!group || group.members.length !== 3 || new Set(group.members.map(member => member.jobId)).size !== 3) return NextResponse.json({ error: "This job has no complete responsive journey group." }, { status: 409 })
    const jobs = group.members.map(member => validId(member.jobId) ? getJob(member.jobId) : null)
    if (jobs.some(member => !member || member.projectId !== job.projectId || member.responsiveGroup?.id !== group.id)) {
      return NextResponse.json({ error: "One or more responsive journeys are unavailable. Coverage cannot be verified." }, { status: 409 })
    }
    const available = jobs.filter((member): member is NonNullable<typeof member> => member !== null)
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ groupId: group.id, runs: available.map(member => ({ ...summarizeResponsiveRun(member), steps: [] })) }, { headers: { "Cache-Control": "no-store" } })
    }
    const report = await buildResponsiveComparison(available)
    const format = request.nextUrl.searchParams.get("format")
    if (format === "html") return new NextResponse(renderResponsiveReport(report), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'", "X-Content-Type-Options": "nosniff" } })
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store", ...(format === "download" ? { "Content-Disposition": 'attachment; filename="responsive-comparison.json"' } : {}) } })
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error)
    console.error("[Responsive comparison]", error)
    return NextResponse.json({ error: "Responsive comparison failed. No passing verdict was recorded." }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!validId(body?.jobId)) return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 })
    const job = getJob(body.jobId)
    if (!job?.projectId || !job.responsiveGroup) return NextResponse.json({ error: "Responsive journey not found." }, { status: 404 })
    await requireProjectAccess(job.projectId, "edit")
    const members = job.responsiveGroup.members
    if (members.length !== 3 || members.some(member => !validId(member.jobId))) return NextResponse.json({ error: "Invalid responsive group." }, { status: 409 })
    const jobs = members.map(member => getJob(member.jobId))
    if (jobs.some(member => !member || member.projectId !== job.projectId || member.responsiveGroup?.id !== job.responsiveGroup?.id)) return NextResponse.json({ error: "Responsive group cannot be verified." }, { status: 409 })
    const { cancelJob } = await import("@/lib/ai-automation/runner")
    const { clearJobSecrets } = await import("@/lib/ai-automation/job-secret-vault")
    for (const member of jobs) if (member) { clearJobSecrets(member.id); cancelJob(member.id) }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error)
    return NextResponse.json({ error: "Could not stop responsive journeys." }, { status: 502 })
  }
}
