import assert from "node:assert/strict"
import { test } from "node:test"
import { AutonomousDecisionController, summarizeAutonomousCoverage, withAutonomousExecutor } from "../lib/ai-automation/autonomous-decision"
import { secretRedactor } from "../lib/ai-automation/secure-credentials-manager"
import { layaPredict } from "../lib/journey/laya-client"

const input = { context: { route: "/properties", vision: { engine: "opencv-js", prominence: 0.8 } },
  choices: { test_0: "Checkbox", test_1: "Details tab", escalate: "Abstain" }, instruction: "Choose the next test", fallbackChoice: "test_0" }
const response = (choice: string, confidence = 0.95) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ choice, confidence }) } }], usage: { prompt_tokens: 45, completion_tokens: 12 },
}), { status: 200 })

test("confident Laya receives actual image payload and avoids gateway requests", async () => {
  let calls = 0
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test" }, {
    laya: async (_url, payload) => {
      calls++
      assert.equal(typeof payload.state, "object")
      assert.equal((payload.state as any).image, "data:image/jpeg;base64,TEST")
      assert.match((payload.state as any).note, /opencv-js/)
      return { answers: { decision: { choice: "test_1", confidence: 0.9 } } }
    }, fetch: async () => { throw new Error("Gateway must not be called") },
  })
  const result = await controller.decide({ ...input, image: "data:image/jpeg;base64,TEST" })
  assert.equal(result.source, "laya")
  assert.equal(result.choice, "test_1")
  assert.equal(result.gatewayRequests, 0)
  assert.equal(calls, 1)
})

test("low-confidence Laya escalates once to configured gateway with bounded redacted context", async () => {
  secretRedactor.register("test-secret-never-send")
  let calls = 0
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test", baseUrl: "http://localhost:8001/v1", model: "configured-model" }, {
    laya: async () => ({ answers: { decision: { choice: "test_0", confidence: 0.1 } } }),
    fetch: async (url, request) => {
      calls++
      assert.equal(url, "http://localhost:8001/v1/chat/completions")
      assert.ok(request?.signal)
      const body = JSON.parse(String(request?.body))
      assert.equal(body.model, "configured-model")
      assert.equal(body.max_tokens, 180)
      assert.ok(!String(request?.body).includes("test-secret-never-send"))
      assert.ok(!String(request?.body).includes("image_url"))
      return response("test_1")
    },
  })
  const result = await controller.decide({ ...input, context: { ...input.context, error: "test-secret-never-send" } })
  assert.equal(result.source, "gateway")
  assert.equal(result.choice, "test_1")
  assert.equal(result.promptTokens, 45)
  assert.equal(result.completionTokens, 12)
  assert.equal(calls, 1)
})

test("explicit Laya escalation invokes gateway rather than prematurely ending coverage", async () => {
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test", baseUrl: "http://localhost:8001/v1" }, {
    laya: async () => ({ answers: { decision: { choice: "escalate", confidence: 0.99 } } }),
    fetch: async () => response("test_1"),
  })
  const decision = await controller.decide(input)
  assert.equal(decision.source, "gateway")
  assert.equal(decision.choice, "test_1")
})

test("invented targets, missing confidence, and invalid scores cannot escape the whitelist", async () => {
  for (const answer of [{ choice: "click #delete", confidence: 1 }, { choice: "test_0" }, { choice: "test_1", confidence: 4 }]) {
    const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test", baseUrl: "http://localhost:8001/v1" }, {
      laya: async () => ({ answers: { decision: answer } }), fetch: async () => response("invented_selector"),
    })
    const result = await controller.decide(input)
    assert.equal(result.source, "fallback")
    assert.equal(result.choice, "test_0")
  }
})

test("identical decisions are cached but changed context invalidates the cache", async () => {
  let calls = 0
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test" }, {
    laya: async () => { calls++; return { answers: { decision: { choice: "test_0", confidence: 0.9 } } } },
  })
  await controller.decide(input)
  const cached = await controller.decide(input)
  assert.equal(cached.cached, true)
  assert.equal(cached.layaRequests, 0)
  assert.equal(cached.gatewayRequests, 0)
  await controller.decide({ ...input, context: { route: "/different-tab" } })
  assert.equal(calls, 2)
})

test("unavailable services abstain for classification and use cooldown without pretending AI succeeded", async () => {
  let calls = 0
  const controller = new AutonomousDecisionController({ layaBaseUrl: "http://laya.test", baseUrl: "http://localhost:8001/v1" }, {
    laya: async () => { calls++; return null }, fetch: async () => { throw new Error("offline") },
  })
  const unknown = { ...input, fallbackChoice: undefined }
  assert.equal((await controller.decide(unknown)).source, "abstain")
  const changed = await controller.decide({ ...unknown, context: { route: "/another-form" } })
  assert.equal(changed.choice, null)
  assert.equal(changed.layaRequests, 0)
  assert.equal(calls, 1)
})

test("execution ownership prevents overlapping Puppeteer and Stagehand controllers", async () => {
  const job: { autonomousExecutionOwner?: "puppeteer" | "stagehand" } = {}
  await withAutonomousExecutor(job, "puppeteer", async () => {
    await assert.rejects(withAutonomousExecutor(job, "stagehand", async () => "must not run"), /already owned/)
  })
  assert.equal(job.autonomousExecutionOwner, undefined)
  await assert.rejects(withAutonomousExecutor(job, "stagehand", async () => { throw new Error("failed action") }))
  assert.equal(job.autonomousExecutionOwner, undefined)
})

test("coverage handoff distinguishes resolved, pending, and previous scenarios", () => {
  const summary = JSON.parse(summarizeAutonomousCoverage({
    actionLedger: { entries: [{ name: "Select House", status: "passed" }, { name: "Details tab", status: "untested" }] },
    testCases: [{ name: "Journey", status: "failed" }],
  }))
  assert.equal(summary.resolved[0].status, "passed")
  assert.equal(summary.pending[0].name, "Details tab")
  assert.equal(summary.scenarios[0].status, "failed")
})

test("Laya endpoint fallback and busy responses share one bounded time budget", async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response("busy", { status: 503 }) }
  try {
    const started = Date.now()
    assert.equal(await layaPredict("http://laya.test", { state: "test", questions: {} }, 40), null)
    // Timers may wake just before the deadline; any retries must remain in budget.
    assert.ok(calls >= 1 && calls <= 3)
    assert.ok(Date.now() - started < 500)
  } finally { globalThis.fetch = previous }
})
