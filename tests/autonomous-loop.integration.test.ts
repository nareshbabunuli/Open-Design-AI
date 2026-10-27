import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import puppeteer, { type Browser, type Page } from "puppeteer"
import sharp from "sharp"
import { AutonomousDecisionController } from "../lib/ai-automation/autonomous-decision"
import { configurePageReasoning, classifyVisibleForms, isBlockingLoginForm } from "../lib/ai-automation/form-intent"
import { hasLoginWall } from "../lib/ai-automation/full-app-discovery"
import { prepareDecisionImage } from "../lib/ai-automation/human-loop-vision"
import { executeCandidate, runHumanLikeDecisionLoop } from "../lib/ai-automation/human-test-loop"
import type { AutomationJob } from "../lib/ai-automation/types"
import type { CandidateTest } from "../lib/ai-automation/interaction-pattern-engine"

let browser: Browser, page: Page
before(async () => {
  browser = await puppeteer.launch({ headless: "shell", pipe: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  page = await browser.newPage()
  await page.setViewport({ width: 800, height: 600 })
})
after(async () => { await browser?.close() })
function job(): AutomationJob {
  return { id: `autonomous-loop-${Date.now()}`, projectId: "test", targetUrl: "https://autonomous.test/", status: "running",
    progress: 0, currentStep: "test", startedAt: new Date().toISOString(), credentialsProvided: false,
    viewports: [{ name: "Desktop", width: 800, height: 600 }], maxScreens: 1, logs: [], screens: [], issues: [], mode: "autonomous" }
}
function candidate(pattern: CandidateTest["pattern"], selector: string): CandidateTest {
  return { id: selector, pattern, category: "actions", title: "Select control", goal: "Verify control", target: { selector }, targets: [{ selector }],
    preconditions: [], actions: [], expectedOutcome: "Intended state", risk: "safe", priority: 1, stateKey: "fixture", generatedAt: new Date().toISOString() }
}

test("form intent distinguishes login, signup, reset, and ordinary password forms", async () => {
  const cases: Array<[string, boolean, string]> = [
    ['<form><input type="email"><input type="password"><button>Sign in</button><a>Create account</a></form>', true, "login"],
    ['<form><input type="email"><input type="password"><button>Create account</button></form>', false, "signup"],
    ['<form><input type="email"><input type="password"><input type="password" aria-label="Confirm password"><button>Continue</button></form>', false, "signup"],
    ['<form><input type="email"><button>Send reset link</button></form>', false, "password_reset"],
    ['<form><input type="email"><input type="password"><textarea></textarea><button>Submit</button></form>', false, "ordinary_form"],
    ['<header><a href="/login">Sign in</a></header><form><input type="email"><button>Subscribe</button></form>', false, "ordinary_form"],
    ['<form><input type="email"><input type="password"><button>Continue</button></form>', false, "unknown"],
  ]
  for (const [html, blocked, purpose] of cases) {
    await page.setContent(html)
    assert.equal(await hasLoginWall(page), blocked, purpose)
    assert.equal((await classifyVisibleForms(page))[0].purpose, purpose)
  }
  await page.setContent('<form><input type="email"><input type="password"><button>Login</button></form><form><input type="email"><button>Contact us</button></form>')
  assert.equal(await hasLoginWall(page), false, "Public form beside login widget must remain testable")
  await page.setContent('<form><input type="email"><input type="password"><button>Login</button></form><form><input type="email"><input type="password"><button>Continue</button></form>')
  assert.equal(await hasLoginWall(page), false, "Unknown alternate form must not become a page-wide credential block")
})

test("ambiguous forms use validated gateway fallback without sending password values", async () => {
  await page.setContent('<form><input type="email" value="private@example.com"><input type="password" value="must-never-leave-browser"><button>Continue</button></form>')
  const controller = new AutonomousDecisionController({ baseUrl: "http://localhost:8001/v1", layaBaseUrl: "http://laya.test" }, {
    laya: async () => ({ answers: { decision: { choice: "login", confidence: 0.1 } } }),
    fetch: async (_url, request) => {
      assert.ok(!String(request?.body).includes("must-never-leave-browser"))
      assert.ok(!String(request?.body).includes("private@example.com"))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"choice":"ordinary_form","confidence":0.95}' } }] }))
    },
  })
  configurePageReasoning(page, controller)
  assert.equal(await isBlockingLoginForm(page), false)
  assert.equal((await classifyVisibleForms(page))[0].source, "gateway")
})

test("decision images are cropped, bounded, and sent as real image data", async () => {
  const screenshot = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "white" } }).png().toBuffer()
  const image = await prepareDecisionImage(screenshot, [{ x: 100, y: 100, width: 300, height: 200 }], 1600)
  assert.ok(image.startsWith("data:image/jpeg;base64,"))
  const metadata = await sharp(Buffer.from(image.split(",")[1], "base64")).metadata()
  assert.equal(metadata.width, 380)
  assert.equal(metadata.height, 280)
})

test("autonomous candidates reuse verified radio, switch and dropdown execution", async () => {
  await page.setContent(`<label><input id="flat" type="radio" name="property" checked>Flat</label><label><input id="house" type="radio" name="property">House</label>
    <button id="switch" role="switch" aria-checked="false" onclick="window.clicks=(window.clicks||0)+1;this.setAttribute('aria-checked','true')">Notifications</button>
    <select id="category"><option value="">Choose</option><option value="house">House</option></select>`)
  const currentJob = job()
  assert.equal((await executeCandidate(page, candidate("radio", "#house"), currentJob)).ok, true)
  assert.equal((await executeCandidate(page, candidate("radio", "#house"), currentJob)).ok, true)
  assert.equal(await page.$eval("#flat", el => (el as HTMLInputElement).checked), false)
  assert.equal((await executeCandidate(page, candidate("toggle", "#switch"), currentJob)).ok, true)
  assert.equal((await executeCandidate(page, candidate("toggle", "#switch"), currentJob)).ok, true)
  assert.equal(await page.evaluate(() => (window as any).clicks), 1)
  assert.equal((await executeCandidate(page, candidate("dropdown", "#category"), currentJob)).ok, true)
  assert.equal(await page.$eval("#category", el => (el as HTMLSelectElement).value), "house")
  await page.setContent(`<button id="custom" role="combobox" aria-controls="choices" onclick="window.opens=(window.opens||0)+1;document.querySelector('#choices').hidden=false">Choose</button>
    <div role="listbox" id="choices" hidden><div role="option" onclick="this.setAttribute('aria-selected','true');document.querySelector('#custom').textContent=this.textContent">House</div></div>`)
  assert.equal((await executeCandidate(page, candidate("dropdown", "#custom"), currentJob)).ok, true)
  assert.equal(await page.evaluate(() => (window as any).opens), 1)
})

test("real DOM/OpenCV/Laya loop selects one candidate and records independently verified execution", async () => {
  const isolated = await browser.newPage()
  await isolated.setViewport({ width: 600, height: 400 })
  await isolated.setRequestInterception(true)
  isolated.on("request", request => { void request.respond({ contentType: "text/html", body:
    '<main><h1>Test controls</h1><label><input id="check" type="checkbox" onclick="window.clicks=(window.clicks||0)+1">Choose house</label></main>' }) })
  let sawImage = false
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test" }, {
    laya: async (_url, payload) => {
      sawImage = typeof payload.state === "object" && Boolean(payload.state.image?.startsWith("data:image/jpeg;base64,"))
      const choice = Object.entries(payload.questions.decision.type === "choice" ? (payload.questions.decision as any).criteria : {})
        .find(([, text]) => String(text).includes("pattern=checkbox"))?.[0]
      assert.ok(choice, "Checkbox must be in the bounded candidate list")
      return { answers: { decision: { choice, confidence: 0.98 } } }
    },
    fetch: async () => { throw new Error("Confident Laya should not call remote AI") },
  })
  try {
    await isolated.goto("https://autonomous.test/")
    const currentJob = job()
    const result = await runHumanLikeDecisionLoop(currentJob, isolated, { maxSteps: 1, decisionController: controller })
    assert.equal(sawImage, true)
    assert.equal(result.actions.length, 1)
    assert.equal(result.actions[0].status, "passed")
    assert.equal(await isolated.$eval("#check", el => (el as HTMLInputElement).checked), true)
    assert.equal(await isolated.evaluate(() => (window as any).clicks), 1)
    assert.equal(currentJob.autonomousDecisionTrace?.[0].decision.source, "laya")
    assert.equal(currentJob.autonomousDecisionTrace?.[0].decision.gatewayRequests, 0)
    assert.ok(currentJob.actionLedger?.entries.some(entry => entry.status === "passed"))
  } finally { await isolated.close() }
})

test("abstained untested coverage remains executable on a later loop", async () => {
  const isolated = await browser.newPage()
  await isolated.setViewport({ width: 600, height: 400 })
  await isolated.setRequestInterception(true)
  isolated.on("request", request => { void request.respond({ contentType: "text/html", body:
    '<main><h1>Queued controls</h1><label><input id="queued" type="checkbox">Choose house</label></main>' }) })
  const abstain = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test", baseUrl: "http://localhost:8001/v1" }, {
    laya: async () => ({ answers: { decision: { choice: "escalate", confidence: 0.9 } } }),
    fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"choice":"escalate","confidence":0.9}' } }] })),
  })
  const resume = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test" }, {
    laya: async (_url, payload) => {
      const choice = Object.entries((payload.questions.decision as any).criteria).find(([, text]) => String(text).includes("pattern=checkbox"))?.[0]
      return { answers: { decision: { choice, confidence: 0.9 } } }
    },
  })
  try {
    await isolated.goto("https://autonomous.test/")
    const currentJob = job()
    const paused = await runHumanLikeDecisionLoop(currentJob, isolated, { maxSteps: 1, decisionController: abstain })
    assert.equal(paused.actions.length, 0)
    assert.ok(paused.missedCoverage.length > 0)
    const resumed = await runHumanLikeDecisionLoop(currentJob, isolated, { maxSteps: 1, decisionController: resume })
    assert.equal(resumed.actions.length, 1)
    assert.equal(resumed.actions[0].status, "passed")
  } finally { await isolated.close() }
})
