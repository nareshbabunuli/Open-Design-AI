import { NextRequest, NextResponse } from "next/server"
import {
  verifyTargetTestData,
  generateTargetTestData,
  saveUploadedTargetTestFiles,
} from "@/lib/ai-automation/test-data-service"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectDir = searchParams.get("projectDir") || undefined
    const baseUrl = searchParams.get("baseUrl") || undefined
    const folderPath = searchParams.get("folderPath") || undefined

    const result = verifyTargetTestData(projectDir, baseUrl, folderPath)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to inspect target project test data.",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const projectDir = String(formData.get("projectDir") || "").trim() || undefined
      const baseUrl = String(formData.get("baseUrl") || "").trim() || undefined
      const rawFiles = formData.getAll("files")
      const uploaded: Array<{ name: string; buffer: Buffer }> = []

      for (const entry of rawFiles) {
        if (entry && typeof (entry as File).arrayBuffer === "function") {
          const f = entry as File
          const buf = Buffer.from(await f.arrayBuffer())
          uploaded.push({ name: f.name, buffer: buf })
        }
      }

      const result = saveUploadedTargetTestFiles(uploaded, projectDir, baseUrl)
      return NextResponse.json(result)
    }

    const body = await req.json().catch(() => ({}))
    const projectDir = body?.projectDir || undefined
    const baseUrl = body?.baseUrl || undefined

    const result = generateTargetTestData(projectDir, baseUrl)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to generate target project test data.",
      },
      { status: 500 }
    )
  }
}
