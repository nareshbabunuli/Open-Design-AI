import fs from "fs"
import path from "path"
import os from "os"
import type { AutomationJob } from "./types"
import { appendLog } from "./job-store"

export type TestFileType = "image" | "pdf" | "document" | "csv" | "video" | "other"

export type TestFileEntry = {
  fileName: string
  filePath: string
  fileType: TestFileType
  extension: string
  sizeBytes: number
  mimeType: string
}

export type UploadFolderInventory = {
  folderPath: string
  files: TestFileEntry[]
  filesByType: Record<TestFileType, TestFileEntry[]>
}

export const EXTENSION_MAP: Record<string, { type: TestFileType; mime: string }> = {
  // Images
  ".png": { type: "image", mime: "image/png" },
  ".jpg": { type: "image", mime: "image/jpeg" },
  ".jpeg": { type: "image", mime: "image/jpeg" },
  ".webp": { type: "image", mime: "image/webp" },
  ".gif": { type: "image", mime: "image/gif" },
  ".svg": { type: "image", mime: "image/svg+xml" },
  ".bmp": { type: "image", mime: "image/bmp" },

  // PDF
  ".pdf": { type: "pdf", mime: "application/pdf" },

  // Data / Tables
  ".csv": { type: "csv", mime: "text/csv" },
  ".tsv": { type: "csv", mime: "text/tab-separated-values" },

  // Documents
  ".txt": { type: "document", mime: "text/plain" },
  ".doc": { type: "document", mime: "application/msword" },
  ".docx": { type: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ".json": { type: "document", mime: "application/json" },
  ".xml": { type: "document", mime: "application/xml" },
  ".md": { type: "document", mime: "text/markdown" },

  // Video
  ".mp4": { type: "video", mime: "video/mp4" },
  ".webm": { type: "video", mime: "video/webm" },
  ".mov": { type: "video", mime: "video/quicktime" },
  ".mkv": { type: "video", mime: "video/x-matroska" },
}

/**
 * Extracts a mentioned folder path from a user instruction / prompt string.
 * Supports patterns like:
 * - "folder: ./test-files"
 * - "upload folder 'C:\projects\files'"
 * - "use folder ./fixtures"
 * - "check files in tests/uploads"
 * - "files in ./test-assets"
 */
export function detectUploadFolderMention(text?: string): string | null {
  if (!text || typeof text !== "string") return null

  const patterns = [
    /(?:upload\s+folder|folder\s+to\s+upload|folder\s+for\s+files|files?\s+folder|check\s+files\s+in(?:\s+folder)?|files?\s+in\s+folder|files?\s+in|files\s+from|from\s+folder|use\s+folder|check\s+folder|test\s+folder|fixtures?\s+folder)\s*[:=]?\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.\-\/\\]+))/i,
    /(?:mention\s+(?:a\s+)?(?:upload\s+)?(?:folder|dir|directory))\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.\-\/\\]+))/i,
    /(?:folder|dir|directory)\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.\-\/\\]+))/i,
    /(?:folder|dir|directory)\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.\-\/\\]+))/i,
    /(?:folder\s+named|folder\s+called|folder\s+at|folder\s+path)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.\-\/\\]+))/i,
    /["']([A-Za-z0-9_.\-\/\\ ]*(?:test[-_]?files|fixtures|uploads|samples)[A-Za-z0-9_.\-\/\\ ]*)["']/i,
    /(?:^|\s)([A-Za-z0-9_.\-]+[\/\\](?:fixtures|test[-_]?files|uploads|samples)[A-Za-z0-9_.\-\/\\]*)/i,
  ]

  for (const re of patterns) {
    const match = text.match(re)
    if (match) {
      const raw = match[1] || match[2] || match[3] || match[4]
      if (raw) {
        const candidate = raw.trim().replace(/[.,;:!?]+$/, "")
        // Skip common stop-words
        if (/^(so|to|and|is|for|with|that|it|can|or|the|a|an|in|on|at|of|by|as|you|we|they|he|she|this)$/i.test(candidate)) {
          continue
        }
        // Skip pure file names with extensions
        if (!/\.[a-zA-Z0-9]{2,4}$/.test(candidate) && candidate.length > 0) {
          return candidate
        }
      }
    }
  }

  return null
}

/**
 * Resolves the upload files directory by inspecting:
 * 1. Explicitly provided directory (`uploadFilesDir`)
 * 2. Directory mentioned in user instructions / prompt
 * 3. Standard conventions in project directory (e.g. `test-files`, `fixtures`, `scripts/fixtures`)
 */
export function resolveUploadFolder(opts?: {
  uploadFilesDir?: string
  projectDir?: string
  prompt?: string
}): string | null {
  const explicitCandidates: string[] = []

  if (opts?.uploadFilesDir) {
    explicitCandidates.push(opts.uploadFilesDir)
  }

  const mentioned = detectUploadFolderMention(opts?.prompt)
  if (mentioned) {
    explicitCandidates.push(mentioned)
  }

  const baseDirs = [opts?.projectDir, process.cwd()].filter(Boolean) as string[]

  for (const base of baseDirs) {
    if (mentioned) {
      explicitCandidates.push(path.resolve(base, mentioned))
    }
    if (opts?.uploadFilesDir) {
      explicitCandidates.push(path.resolve(base, opts.uploadFilesDir))
    }
  }

  // 1. Check explicitly mentioned or provided folders first
  for (const cand of explicitCandidates) {
    try {
      const absPath = path.isAbsolute(cand) ? cand : path.resolve(process.cwd(), cand)
      if (fs.existsSync(absPath)) {
        const stat = fs.statSync(absPath)
        if (stat.isDirectory()) {
          return absPath
        }
      }
    } catch {}
  }

  // 2. Fall back to standard project conventions if they exist and contain test files
  const conventionDirs = ["test-files", "test_files", "tests/fixtures", "fixtures", "scripts/fixtures"]
  for (const base of baseDirs) {
    for (const sub of conventionDirs) {
      try {
        const absPath = path.resolve(base, sub)
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath)
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(absPath)
            const hasTestFiles = entries.some((e) =>
              /\.(png|jpg|jpeg|webp|pdf|csv|tsv|txt|doc|docx|json|xml|mp4)$/i.test(e)
            )
            if (hasTestFiles) {
              return absPath
            }
          }
        }
      } catch {}
    }
  }

  return null
}

/**
 * Scans a folder for valid test files, categorizing them by type and MIME.
 */
export function scanUploadFolder(folderPath: string): UploadFolderInventory {
  const inventory: UploadFolderInventory = {
    folderPath,
    files: [],
    filesByType: {
      image: [],
      pdf: [],
      document: [],
      csv: [],
      video: [],
      other: [],
    },
  }

  if (!folderPath || !fs.existsSync(folderPath)) {
    return inventory
  }

  try {
    const readEntries = (dir: string, depth = 0) => {
      if (depth > 2) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue // Skip hidden
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          readEntries(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          const stat = fs.statSync(fullPath)
          const meta = EXTENSION_MAP[ext] || { type: "other", mime: "application/octet-stream" }

          const item: TestFileEntry = {
            fileName: entry.name,
            filePath: fullPath,
            fileType: meta.type,
            extension: ext,
            sizeBytes: stat.size,
            mimeType: meta.mime,
          }

          inventory.files.push(item)
          inventory.filesByType[meta.type].push(item)
        }
      }
    }

    readEntries(folderPath)
  } catch (err: any) {
    console.warn(`[test-file-manager] Error scanning folder "${folderPath}":`, err?.message)
  }

  return inventory
}

/**
 * Selects the best matching file for an upload input based on:
 * 1. The input element's HTML `accept` attribute (e.g. "image/*,.pdf,.csv")
 * 2. The required file category (image, pdf, document, csv, video)
 * 3. Fallback to generating a synthetic dummy buffer if no real file exists
 */
export function pickUploadFile(
  inventory: UploadFolderInventory | null,
  criteria: {
    fileTypeRequired?: TestFileType
    acceptAttr?: string
    targetName?: string
  }
): {
  filePath: string
  fileName: string
  isFromFolder: boolean
  fileSizeKB?: number
  cleanUp?: () => void
} {
  const tokens = (criteria.acceptAttr || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
  const candidates = (inventory?.files || []).filter(file => file.sizeBytes > 0 &&
    (!tokens.length || tokens.some(token => token.startsWith(".") ? file.extension.toLowerCase() === token :
      token.endsWith("/*") ? file.mimeType.toLowerCase().startsWith(token.slice(0, -1)) : file.mimeType.toLowerCase() === token)))
  const category = criteria.fileTypeRequired
  const selected = candidates.find(f => f.fileName.toLowerCase() === (criteria.targetName || "").toLowerCase()) ||
    candidates.find(f => category && f.fileType === category) || candidates[0]
  if (!selected) throw new Error(`Compatible test file required (${criteria.acceptAttr || category || "any supported file"})`)
  return { filePath: selected.filePath, fileName: selected.fileName, isFromFolder: true, fileSizeKB: Math.round(selected.sizeBytes / 1024) }

}

/**
 * Generates realistic dummy file buffers (PNG, PDF, CSV, TXT) when no user files are provided.
 */
export function createDummyFileBuffer(type: TestFileType): {
  buffer: Buffer
  fileName: string
  mimeType: string
} {
  switch (type) {
    case "image": {
      const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      return {
        buffer: Buffer.from(pngBase64, "base64"),
        fileName: "dummy_test_image.png",
        mimeType: "image/png",
      }
    }
    case "csv": {
      const csv = "id,name,value,status\n1,Synthetic Item A,100,active\n2,Synthetic Item B,200,pending\n"
      return {
        buffer: Buffer.from(csv, "utf8"),
        fileName: "dummy_test_data.csv",
        mimeType: "text/csv",
      }
    }
    case "pdf": {
      const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n200\n%%EOF"
      return {
        buffer: Buffer.from(pdf, "utf8"),
        fileName: "dummy_test_document.pdf",
        mimeType: "application/pdf",
      }
    }
    default: {
      const doc = "Synthetic automated test document content.\nCreated for automated UI file upload verification."
      return {
        buffer: Buffer.from(doc, "utf8"),
        fileName: "dummy_test_document.txt",
        mimeType: "text/plain",
      }
    }
  }
}
