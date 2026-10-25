import test from "node:test"
import assert from "node:assert/strict"
import {
  generateStructuredTestPlan,
  prioritizePendingStepsForScreen,
  pickUploadFile,
  scanUploadFolder,
  resolveUploadFolder,
} from "../lib/ai-automation/full-app-engine"
import { detectInteractionPatterns } from "../lib/ai-automation/interaction-pattern-engine"
import type { AppScreenNode, AppWorkflowTransition } from "../lib/ai-automation/types"

const loginWall: AppScreenNode = {
  id: "S001",
  name: "Sign In",
  url: "http://localhost:3000/login",
  path: "/login",
  isLoginWall: true,
  discoveredAt: "2026-10-13T00:00:00.000Z",
  actionableElements: [],
  forms: [],
}

const dashboard: AppScreenNode = {
  id: "S002",
  name: "Dashboard",
  url: "http://localhost:3000/dashboard",
  path: "/dashboard",
  screenshotUrl: "data:image/jpeg;base64,AAAA",
  discoveredAt: "2026-10-13T00:00:00.000Z",
  actionableElements: [
    { type: "input", name: "Email", inputType: "email", selector: "#email" } as any,
    { type: "input", name: "Password", inputType: "password", selector: "#pw" } as any,
  ],
  forms: [],
}

const loginTransition: AppWorkflowTransition = {
  id: "tr-1",
  fromScreenId: "S001",
  toScreenId: "S002",
  action: "Submit Login Form",
  actionType: "form_submit",
}

test("auth step passes only with post-login evidence", () => {
  const plan = generateStructuredTestPlan("http://localhost:3000", [loginWall, dashboard], [loginTransition], {
    isAuthenticated: true,
  })
  const auth = plan.steps.find((s) => s.targetName === "User Authentication")!
  assert.equal(auth.status, "passed")
  assert.equal(auth.screenshotUrl, dashboard.screenshotUrl)
  assert.match(auth.actualResult || "", /S002/)
})

test("auth step is blocked, not passed, without evidence", () => {
  const plan = generateStructuredTestPlan("http://localhost:3000", [loginWall, dashboard], [], {
    isAuthenticated: true,
  })
  const auth = plan.steps.find((s) => s.targetName === "User Authentication")!
  assert.equal(auth.status, "blocked")
  assert.equal(auth.screenshotUrl, undefined)
})

test("plan never embeds real credentials", () => {
  const plan = generateStructuredTestPlan("http://localhost:3000", [loginWall, dashboard], [loginTransition], {
    isAuthenticated: true,
    // Extra field simulates an old caller still passing credentials.
    ...({ credentials: { username: "real.user@corp.com", password: "S3cret-Real-Pass" } } as object),
  })
  const serialized = JSON.stringify(plan)
  assert.ok(!serialized.includes("real.user@corp.com"))
  assert.ok(!serialized.includes("S3cret-Real-Pass"))
})

test("pickUploadFile handles empty and whitespace-padded accept attributes and picks folder files", () => {
  const folder = resolveUploadFolder({ uploadFilesDir: "scripts/fixtures" })
  assert.ok(folder, "Expected scripts/fixtures folder to resolve")
  const inventory = scanUploadFolder(folder!)
  assert.ok(inventory.files.length > 0, "Expected fixtures inventory to have files")

  // Empty acceptAttr should still pick from requested category in folder
  const pickEmptyAccept = pickUploadFile(inventory, {
    fileTypeRequired: "pdf",
    acceptAttr: "",
    targetName: "Upload Agreement",
  })
  assert.equal(pickEmptyAccept.isFromFolder, true)
  assert.match(pickEmptyAccept.fileName, /\.pdf$/i)

  // Whitespace-padded acceptAttr tokens (e.g. "image/*, .pdf, .csv")
  const pickSpacedAccept = pickUploadFile(inventory, {
    fileTypeRequired: "csv",
    acceptAttr: "image/*, .pdf, .csv",
    targetName: "Import Spreadsheet",
  })
  assert.equal(pickSpacedAccept.isFromFolder, true)
  assert.match(pickSpacedAccept.fileName, /\.csv$/i)
})

test("detectInteractionPatterns generates valid_input candidate for file inputs without required_validation", () => {
  const matches = detectInteractionPatterns({
    stateKey: "http://localhost:3000/upload::ui-1",
    url: "http://localhost:3000/upload",
    origin: "http://localhost:3000",
    elements: [
      {
        selector: "#doc-upload",
        tag: "input",
        type: "file",
        label: "Upload Document",
        visible: true,
        enabled: true,
        required: true,
      },
    ],
    forms: [],
    tables: [],
    dialogs: [],
  })
  assert.ok(matches.some((m) => m.pattern === "valid_input" && m.targets.some((t) => t.selector === "#doc-upload")))
  assert.ok(!matches.some((m) => m.pattern === "required_validation" && m.targets.some((t) => t.selector === "#doc-upload")))
})


test("authenticated login wall does not plan duplicate form_scenario or pre-auth button steps", () => {
  const loginWallWithForm: AppScreenNode = {
    ...loginWall,
    actionableElements: [
      { id: "e1", type: "input", name: "Email Address", inputType: "email", selector: "#email", isRequired: true, formId: "form-1" } as any,
      { id: "e2", type: "input", name: "Password", inputType: "password", selector: "#pass", isRequired: true, formId: "form-1" } as any,
      { id: "e3", type: "button", name: "Show", selector: "#show-pass", formId: "form-1" } as any,
      { id: "e4", type: "button", name: "Sign in to Portal", selector: "#submit", formId: "form-1" } as any,
      { id: "e5", type: "button", name: "Forgot password?", selector: "#forgot" } as any,
    ],
    forms: [
      { id: "form-1", name: "Form #1", selector: "form:nth-of-type(1)", fields: ["email", "password"], submitButton: "Sign in to Portal" },
    ],
  }
  const plan = generateStructuredTestPlan("http://localhost:3000", [loginWallWithForm, dashboard], [loginTransition], {
    isAuthenticated: true,
  })
  const s001Pending = plan.steps.filter((s) => s.screenId === "S001" && s.status === "pending")
  assert.equal(s001Pending.length, 0, "Expected no pending steps on pre-authenticated login wall S001")
})

test("prioritizePendingStepsForScreen orders upload before fields, fields before submit, and submit before cancel", () => {
  const plan = generateStructuredTestPlan("http://localhost:3000", [dashboard], [])
  plan.steps.push(
    {
      id: "m-cancel",
      screenId: "S003",
      screenName: "Add a document (Modal)",
      stepIndex: plan.steps.length + 1,
      actionType: "click",
      targetName: "Cancel",
      expectedResult: "",
      status: "pending",
    },
    {
      id: "m-submit",
      screenId: "S003",
      screenName: "Add a document (Modal)",
      stepIndex: plan.steps.length + 2,
      actionType: "click",
      targetName: "Add document",
      expectedResult: "",
      status: "pending",
    },
    {
      id: "m-select",
      screenId: "S003",
      screenName: "Add a document (Modal)",
      stepIndex: plan.steps.length + 3,
      actionType: "select",
      targetName: "Which property?",
      expectedResult: "",
      status: "pending",
    },
    {
      id: "m-upload",
      screenId: "S003",
      screenName: "Add a document (Modal)",
      stepIndex: plan.steps.length + 4,
      actionType: "upload",
      targetName: "Choose a file",
      expectedResult: "",
      status: "pending",
    }
  )

  prioritizePendingStepsForScreen(plan, "S003", 0)
  const modalOrder = plan.steps.filter((s) => s.screenId === "S003").map((s) => s.targetName)
  assert.deepEqual(modalOrder, ["Choose a file", "Which property?", "Add document", "Cancel"])
})
