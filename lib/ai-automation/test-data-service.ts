import fs from "fs"
import path from "path"
import { resolveProjectDirectory } from "./discover-routes"

export interface TestFileInfo {
  name: string
  size: number
  category: "pdf" | "csv" | "image" | "notes" | "json" | "other"
  lastModified?: string
}

export interface AvailableTestFolderInfo {
  label: string
  path: string
  filesCount: number
  projectName?: string
}

export interface TestDataStatus {
  success: boolean
  folderPath: string
  exists: boolean
  filesCount: number
  files: TestFileInfo[]
  availableFolders?: AvailableTestFolderInfo[]
  message?: string
}

function categorizeFile(filename: string): TestFileInfo["category"] {
  const ext = path.extname(filename).toLowerCase()
  if (ext === ".pdf") return "pdf"
  if (ext === ".csv" || ext === ".xlsx") return "csv"
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "image"
  if (ext === ".txt" || ext === ".md") return "notes"
  if (ext === ".json") return "json"
  return "other"
}

function makePdfBuffer(title: string, subtitle: string, body: string): Buffer {
  const content = `BT\n/F1 16 Tf\n50 720 Td\n(${title}) Tj\n/F1 12 Tf\n0 -28 Td\n(${subtitle}) Tj\n/F1 10 Tf\n0 -24 Td\n(${body}) Tj\nET`
  const len = Buffer.byteLength(content, "utf8")
  let pdf = "%PDF-1.4\n"
  const offs: number[] = []
  function add(s: string) {
    offs.push(Buffer.byteLength(pdf, "utf8"))
    pdf += s + "\n"
  }
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
  add("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj")
  add("3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj")
  add("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj")
  add(`5 0 obj\n<< /Length ${len} >>\nstream\n${content}\nendstream\nendobj`)
  const sx = Buffer.byteLength(pdf, "utf8")
  pdf += "xref\n0 6\n0000000000 65535 f \n"
  offs.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`
  })
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${sx}\n%%EOF\n`
  return Buffer.from(pdf, "utf8")
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

function countFilesInDir(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return 0
    return fs.readdirSync(dirPath, { withFileTypes: true }).filter((d) => d.isFile()).length
  } catch {
    return 0
  }
}

export function listAvailableTestFolders(projectDir?: string, baseUrl?: string): AvailableTestFolderInfo[] {
  const resolvedDir = resolveProjectDirectory(baseUrl, projectDir)
  const resolvedProjectName = path.basename(resolvedDir)
  const parentRoot = path.dirname(process.cwd())
  const seen = new Set<string>()
  const folders: AvailableTestFolderInfo[] = []

  const addFolder = (dirPath: string, labelPrefix: string, subLabel: string, includeIfEmpty = false) => {
    const normalized = path.resolve(dirPath).replace(/\\/g, "/")
    if (seen.has(normalized.toLowerCase())) return
    const exists = fs.existsSync(dirPath) && (() => { try { return fs.statSync(dirPath).isDirectory() } catch { return false } })()
    const filesCount = exists ? countFilesInDir(dirPath) : 0
    if (!exists && !includeIfEmpty) return
    seen.add(normalized.toLowerCase())
    folders.push({
      label: `${labelPrefix}/${subLabel}`,
      path: normalized,
      filesCount,
      projectName: labelPrefix,
    })
  }

  // 1. Target project's own test folders first (always include target project's test-files folder)
  addFolder(path.join(resolvedDir, "test-files"), resolvedProjectName, "test-files", true)
  for (const sub of ["scripts/fixtures", "fixtures", "test-assets", "cypress/fixtures"]) {
    addFolder(path.join(resolvedDir, sub), resolvedProjectName, sub, false)
  }

  // 2. Sibling projects' test-files and scripts/fixtures in workspace parent (e.g. D:/wamp64/www/*)
  try {
    const entries = fs.readdirSync(parentRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      const projPath = path.join(parentRoot, entry.name)
      addFolder(path.join(projPath, "test-files"), entry.name, "test-files", false)
      addFolder(path.join(projPath, "scripts", "fixtures"), entry.name, "scripts/fixtures", false)
    }
  } catch {
    // ignore
  }

  return folders
}

function resolveRequestedTestFolder(resolvedDir: string, customFolderPath?: string): string {
  const defaultDir = path.join(resolvedDir, "test-files")
  if (!customFolderPath || !customFolderPath.trim()) return defaultDir
  const raw = customFolderPath.trim()
  const candidates = [
    path.isAbsolute(raw) ? raw : path.resolve(resolvedDir, raw),
    path.resolve(process.cwd(), raw),
    path.resolve(path.dirname(process.cwd()), raw),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
        return c
      }
    } catch {
      // ignore
    }
  }
  return path.isAbsolute(raw) ? raw : defaultDir
}

export function verifyTargetTestData(
  projectDir?: string,
  baseUrl?: string,
  customFolderPath?: string
): TestDataStatus {
  const resolvedDir = resolveProjectDirectory(baseUrl, projectDir)
  const testFilesDir = resolveRequestedTestFolder(resolvedDir, customFolderPath)
  const availableFolders = listAvailableTestFolders(projectDir, baseUrl)

  if (!fs.existsSync(testFilesDir)) {
    return {
      success: true,
      folderPath: testFilesDir.replace(/\\/g, "/"),
      exists: false,
      filesCount: 0,
      files: [],
      availableFolders,
      message: "No test-files folder found in target project.",
    }
  }

  try {
    const dirents = fs.readdirSync(testFilesDir, { withFileTypes: true })
    const files: TestFileInfo[] = dirents
      .filter((d) => d.isFile())
      .map((d) => {
        const fullPath = path.join(testFilesDir, d.name)
        const stat = fs.statSync(fullPath)
        return {
          name: d.name,
          size: stat.size,
          category: categorizeFile(d.name),
          lastModified: stat.mtime.toISOString(),
        }
      })

    return {
      success: true,
      folderPath: testFilesDir.replace(/\\/g, "/"),
      exists: true,
      filesCount: files.length,
      files,
      availableFolders,
      message: `Verified ${files.length} test files in ${testFilesDir.replace(/\\/g, "/")}.`,
    }
  } catch (err: any) {
    return {
      success: false,
      folderPath: testFilesDir.replace(/\\/g, "/"),
      exists: false,
      filesCount: 0,
      files: [],
      availableFolders,
      message: err?.message || "Failed to read test-files folder.",
    }
  }
}

export function generateTargetTestData(projectDir?: string, baseUrl?: string): TestDataStatus {
  const resolvedDir = resolveProjectDirectory(baseUrl, projectDir)
  const testFilesDir = path.join(resolvedDir, "test-files")

  if (!fs.existsSync(testFilesDir)) {
    fs.mkdirSync(testFilesDir, { recursive: true })
  }

  const pngBuf = Buffer.from(TINY_PNG_BASE64, "base64")

  // 1. PDF documents
  fs.writeFileSync(
    path.join(testFilesDir, "sample-document.pdf"),
    makePdfBuffer("SAMPLE VERIFICATION DOCUMENT", "Automated QA Testing Asset", "This document is generated for autonomous file upload tests.")
  )
  fs.writeFileSync(
    path.join(testFilesDir, "sample-invoice.pdf"),
    makePdfBuffer("TEST INVOICE #1001", "Total Due: USD 250.00", "Status: Paid | Date: 2026-10-09")
  )
  fs.writeFileSync(
    path.join(testFilesDir, "assured_shorthold_tenancy_agreement.pdf"),
    makePdfBuffer("ASSURED SHORTHOLD TENANCY AGREEMENT", "Property: 14 High Street, Abingdon", "Rent: GBP 1,650 pcm | Tenant: Sarah Connor | Term: 12 Months")
  )

  // 2. CSV tabular data
  fs.writeFileSync(
    path.join(testFilesDir, "sample-data.csv"),
    "id,name,category,amount,status,date\n1,Item Alpha,Hardware,150.00,Active,2026-10-01\n2,Item Beta,Software,99.00,Pending,2026-10-02\n3,Item Gamma,Services,45.00,Completed,2026-10-03\n"
  )
  fs.writeFileSync(
    path.join(testFilesDir, "rental_transactions_2024_2025.csv"),
    "Date,Property,Type,Description,Amount_GBP,Category\n2024-05-01,\"14 High Street\",Income,\"Rent - Sarah Connor\",1650.00,Rental Income\n2024-05-15,\"14 High Street\",Expense,\"Boiler Service\",-180.00,Repairs & Maintenance\n"
  )

  // 3. Images
  fs.writeFileSync(path.join(testFilesDir, "sample-avatar.png"), pngBuf)
  fs.writeFileSync(path.join(testFilesDir, "boiler_inspection_photo.png"), pngBuf)
  fs.writeFileSync(path.join(testFilesDir, "plumbing_repair_receipt.png"), pngBuf)

  // 4. Notes
  fs.writeFileSync(
    path.join(testFilesDir, "sample-notes.txt"),
    "Sample testing notes and input data.\nGenerated for autonomous browser QA tests.\n"
  )
  fs.writeFileSync(
    path.join(testFilesDir, "landlord_tax_notes.txt"),
    "LANDLORD ACCOUNTING CLIENT NOTES - 2024/25 TAX YEAR\nClient: John Smith\n14 High Street, Abingdon\n"
  )

  return verifyTargetTestData(projectDir, baseUrl)
}

export function saveUploadedTargetTestFiles(
  uploadedFiles: Array<{ name: string; buffer: Buffer }>,
  projectDir?: string,
  baseUrl?: string
): TestDataStatus {
  const resolvedDir = resolveProjectDirectory(baseUrl, projectDir)
  const testFilesDir = path.join(resolvedDir, "test-files")

  if (!fs.existsSync(testFilesDir)) {
    fs.mkdirSync(testFilesDir, { recursive: true })
  }

  for (const item of uploadedFiles) {
    const safeName = path.basename(item.name || "uploaded-test-file.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    if (!safeName) continue
    fs.writeFileSync(path.join(testFilesDir, safeName), item.buffer)
  }

  return verifyTargetTestData(projectDir, baseUrl)
}
