// Self-check for hasLoginWall: real login form => true, multi-field page with email+password => false.
// Run: npx --yes tsx scripts/check-login-wall.ts   (needs static server: npx serve -l 3005 public)
import assert from "node:assert"
import puppeteer from "puppeteer"
import { hasLoginWall } from "../lib/ai-automation/full-app-discovery"

async function run() {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()

    await page.setContent(`<form><input type="email"><input type="password"><label><input type="checkbox"> Remember</label><button>Sign in</button></form>`)
    assert.strictEqual(await hasLoginWall(page), true, "plain login form should be a login wall")

    await page.goto(`http://localhost:${process.env.PORT || 3005}/test-inputs.html`, { waitUntil: "domcontentloaded" })
    assert.strictEqual(await hasLoginWall(page), false, "test-inputs fixture must not be a login wall")

    console.log("hasLoginWall checks passed")
  } finally {
    await browser.close()
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

