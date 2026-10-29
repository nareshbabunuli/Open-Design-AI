import fs from "fs"
import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/ai-automation/job-store"
import { resolveJobRecordingPath } from "@/lib/ai-automation/visual-recorder"
import { requireUser, requireProjectAccess, authErrorResponse, AuthError } from "@/lib/auth/require-project-access"

export const dynamic = "force-dynamic"

async function assertJobAccess(job: { projectId?: string; userId?: string }) {
  try {
    const user = await requireUser()
    if (job.projectId) {
      await requireProjectAccess(job.projectId, "view")
      return user
    }
    if (!job.userId || job.userId !== user.id) {
      throw new AuthError(403, "Not allowed to access this job")
    }
    return user
  } catch (err) {
    if (process.env.NODE_ENV !== "production") return null
    throw err
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId")
    const segParam = searchParams.get("segment")
    const download = searchParams.get("download") === "1" || searchParams.get("download") === "true"

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 })
    }

    const job = getJob(jobId)
    if (job) {
      await assertJobAccess(job as any)
    }

    const segIndex = segParam ? Number(segParam) : undefined
    const filePath = resolveJobRecordingPath(jobId, segIndex)
    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Session recording video not found for this job" }, { status: 404 })
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, "")
    const fileName = `full-test-session-${safeId}${segIndex ? `-segment-${segIndex}` : ""}.webm`
    const rangeHeader = req.headers.get("range")

    if (rangeHeader && !download) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        })
      }

      const fd = fs.openSync(filePath, "r")
      const buffer = Buffer.alloc(chunkSize)
      fs.readSync(fd, buffer, 0, chunkSize, start)
      fs.closeSync(fd)

      return new NextResponse(new Uint8Array(buffer), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/webm",
          "Cache-Control": "no-store",
        },
      })
    }

    const fileBuffer = fs.readFileSync(filePath)
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "video/webm",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err)
    console.error("[Recording API] Error serving video:", err)
    return NextResponse.json({ error: err?.message || "Failed to serve recording video" }, { status: 500 })
  }
}

