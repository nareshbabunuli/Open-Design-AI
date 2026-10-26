import { readFileSync, writeFileSync } from "fs"
import { gunzipSync } from "zlib"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const b64 = readFileSync(join(__dirname, "restore-human-test-loop-data.b64"), "utf8").trim()
const buf = gunzipSync(Buffer.from(b64, "base64"))
const out = join(__dirname, "..", "lib", "ai-automation", "human-test-loop.ts")
writeFileSync(out, buf)
console.log("Restored", out, "bytes=", buf.length)
