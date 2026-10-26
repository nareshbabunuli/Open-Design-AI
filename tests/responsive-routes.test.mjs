import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
class AuthError extends Error { constructor(status, message) { super(message); this.status = status } }

function harness(options = {}) {
  const members = ['Desktop', 'Tablet', 'Mobile'].map((name, index) => ({ jobId: `job-${index}`, viewport: { name, width: [1440, 768, 390][index], height: [900, 1024, 844][index] } }))
  const group = { id: 'group-1', members }
  const jobs = members.map(member => ({ id: member.jobId, projectId: 'project-1', targetUrl: 'https://app.test', viewports: [member.viewport], status: 'running', progress: 1, currentStep: 'Discovery', screens: [], issues: [], logs: [], responsiveGroup: group }))
  if (options.crossProject) jobs[2].projectId = 'other-project'
  if (options.crossGroup) jobs[2].responsiveGroup = { ...group, id: 'other-group' }
  const started = [], stopped = [], cleared = [], permissions = []
  let comparisons = 0
  const mocks = {
    '@/lib/auth/require-project-access': {
      AuthError,
      requireProjectAccess: async (project, permission) => { permissions.push(permission); if (options.denied) throw new AuthError(403, 'Access denied'); return { user: { id: 'user-1' } } },
      authErrorResponse: error => Response.json({ error: error.message }, { status: error.status }),
    },
    '@/lib/ai-automation/job-store': { getJob: id => jobs.find(job => job.id === id) || null },
    '@/lib/ai-automation/runner': {
      createAndStartJob: async input => { started.push(input); return { ...jobs[0], id: `new-${started.length}`, responsiveGroup: input.responsiveGroup, viewports: input.viewports || members.slice(0, 1).map(member => member.viewport) } },
      cancelJob: id => stopped.push(id), saveJob() {},
    },
    '@/lib/ai-automation/job-secret-vault': { clearJobSecrets: id => cleared.push(id) },
    '@/lib/ai-automation/responsive-comparison': {
      summarizeResponsiveRun: job => ({ jobId: job.id, viewport: job.viewports[0], status: job.status, snapshots: 0, steps: [] }),
      buildResponsiveComparison: async () => { comparisons++; return { status: 'incomplete', runs: [], screens: [], limitations: [] } },
    },
    '@/lib/ai-automation/responsive-report': { renderResponsiveReport: () => '<!doctype html><p>Responsive report</p>' },
    '@/lib/browser/secure-browser': { sanitizeJobForClient: job => job },
    '@/lib/security/url-guard': { assertSafeTargetUrlWithDevBypass: url => url, UrlGuardError: class extends Error {} },
  }
  const cache = new Map()
  function load(path) {
    path = resolve(root, path)
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }; cache.set(path, module)
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const localRequire = name => mocks[name] || (name.startsWith('@/') ? load(`${name.slice(2)}.ts`) : name.startsWith('.') ? load(resolve(dirname(path), name) + '.ts') : require(name))
    new Function('require', 'module', 'exports', 'console', source)(localRequire, module, module.exports, { ...console, error() {} })
    return module.exports
  }
  const get = params => load('app/api/ai-automation/responsive/route.ts').GET(new NextRequest(`https://our-app.test/api/responsive?${params}`))
  const post = body => load('app/api/ai-automation/responsive/route.ts').POST(new NextRequest('https://our-app.test/api/responsive', { method: 'POST', body: JSON.stringify(body) }))
  const start = body => load('app/api/ai-automation/start/route.ts').POST(new NextRequest('https://our-app.test/api/start', { method: 'POST', body: JSON.stringify({ url: 'https://app.test', projectId: 'project-1', mode: 'full_app', ...body }) }))
  return { get, post, start, started, stopped, cleared, permissions, comparisonCount: () => comparisons }
}

test('comparison and stop endpoints reject unauthorized access before processing evidence or mutations', async () => {
  const h = harness({ denied: true })
  assert.equal((await h.get('jobId=job-0')).status, 403)
  assert.equal((await h.post({ jobId: 'job-0' })).status, 403)
  assert.equal(h.comparisonCount(), 0)
  assert.deepEqual(h.stopped, [])
})

test('cross-project and mixed-group references are rejected without partial stops', async () => {
  for (const options of [{ crossProject: true }, { crossGroup: true }]) {
    const h = harness(options)
    assert.equal((await h.get('jobId=job-0')).status, 409)
    assert.equal((await h.post({ jobId: 'job-0' })).status, 409)
    assert.deepEqual(h.stopped, [])
  }
})

test('summary polling avoids expensive image comparisons', async () => {
  const h = harness()
  const response = await h.get('jobId=job-0&summary=1')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).runs.length, 3)
  assert.equal(h.comparisonCount(), 0)
})

test('report and JSON exports use authorized data and no-store headers', async () => {
  const h = harness()
  const html = await h.get('jobId=job-0&format=html')
  assert.equal(html.status, 200)
  assert.match(html.headers.get('content-type'), /text\/html/)
  assert.match(html.headers.get('content-security-policy'), /default-src 'none'/)
  const json = await h.get('jobId=job-0&format=download')
  assert.equal(json.headers.get('cache-control'), 'no-store')
  assert.match(json.headers.get('content-disposition'), /attachment/)
  assert.equal((await json.json()).status, 'incomplete')
})

test('stop-all requires edit access and clears each independent credential vault', async () => {
  const h = harness()
  assert.equal((await h.post({ jobId: 'job-0' })).status, 200)
  assert.deepEqual(h.permissions, ['edit'])
  assert.deepEqual(h.stopped, ['job-0', 'job-1', 'job-2'])
  assert.deepEqual(h.cleared, h.stopped)
})

test('invalid identifiers cannot read arbitrary job files', async () => {
  const h = harness()
  assert.equal((await h.get('jobId=../../secret')).status, 400)
  assert.equal((await h.post({ jobId: '../secret' })).status, 400)
  assert.equal((await h.get('jobId=missing')).status, 404)
})

test('start endpoint creates three journeys only for the explicit boolean opt-in', async () => {
  const h = harness()
  const response = await h.start({ responsiveJourney: true, workflowPrompt: 'Same journey', recordVideo: false })
  assert.equal(response.status, 200)
  assert.equal(h.started.length, 3)
  assert.deepEqual(h.started.map(input => input.viewports[0].name), ['Desktop', 'Tablet', 'Mobile'])
  assert.ok(h.started.every(input => input.recordVideo === false && input.workflowPrompt === 'Same journey'))
  assert.equal((await response.json()).job.responsiveGroup.members.length, 3)
  const single = harness()
  assert.equal((await single.start({ responsiveJourney: false })).status, 200)
  assert.equal(single.started.length, 1)
  const invalid = harness()
  assert.equal((await invalid.start({ responsiveJourney: 'false' })).status, 400)
  assert.equal(invalid.started.length, 0)
})
