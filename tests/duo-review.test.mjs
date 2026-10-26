import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const secret = 'duo-test-secret-'.repeat(4)
process.env.REPOSITORY_CONNECTION_SECRET = secret
const sha = 'a'.repeat(40)
const context = { userId: 'user-1', workflowId: '42', projectId: '7', baseBranch: 'main', baseCommit: sha, expiresAt: Date.now() + 3600000 }
const original = { blob_id: 'original-blob', last_commit_id: sha }
const fix = (id = 'fix-1', content = 'fixed content', path = 'src/app.ts') => ({ id, issue: 'Example issue', summary: 'Example fix', files: [{ path, content }] })
const trace = proposals => JSON.stringify({ message_type: 'ai', content: JSON.stringify({ proposals }) })

// Execute the actual route and helper modules, with only authentication/OAuth and
// outbound GitLab HTTP replaced. NextRequest and NextResponse remain real.
function loader(mocks = {}, fetcher = () => { throw new Error('Unexpected HTTP') }) {
  const cache = new Map()
  function load(path) {
    path = resolve(root, path)
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }
    cache.set(path, module)
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
      return require(name)
    }
    new Function('require', 'module', 'exports', 'fetch', 'console', compiled)(localRequire, module, module.exports, fetcher, { ...console, error() {} })
    return module.exports
  }
  return load
}
const loadPure = loader()
const { extractTraceProposals } = loadPure('lib/integrations/duo-proposals.ts')
const { sealDuoReview, openDuoReview } = loadPure('lib/integrations/duo-review-context.ts')

function harness(options = {}) {
  const proposals = options.proposals || [fix()]
  const mutations = []
  let current = options.current === undefined ? { ...original } : options.current
  let branchExists = options.branchExists ?? true
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
  const fetcher = async (address, init = {}) => {
    const url = new URL(address)
    if (options.throwHttp) throw new Error('Temporary network failure')
    if (init.method === 'POST') {
      mutations.push({ url, body: init.body })
      if (url.pathname.endsWith('/repository/branches')) { branchExists = true; return json({ name: 'fix-branch' }, 201) }
      if (url.pathname.endsWith('/repository/commits')) {
        const body = JSON.parse(init.body)
        assert.equal(body.branch, 'open-design-ai/duo-fixes-42')
        assert.equal(body.branch_name, undefined)
        for (const action of body.actions) {
          if (action.action === 'update') assert.equal(action.last_commit_id, current.last_commit_id)
        }
        if (options.commitConflict) return json({ message: 'File changed during approval' }, 400)
        current = { blob_id: 'changed-blob', last_commit_id: 'b'.repeat(40) }
        return json({ id: 'commit-1', short_id: 'commit-1' }, 201)
      }
      if (url.pathname.endsWith('/workflows')) return json({ id: 42, status: 'created' }, 201)
    }
    if (url.pathname.endsWith('/trace.jsonl')) return new Response(options.trace ?? trace(proposals), { status: options.traceStatus || 200 })
    if (url.pathname.endsWith('/agent_privileges')) return json({ all_privileges: [
      { id: 1, name: 'read_write_files' }, { id: 2, name: 'read_only_gitlab' }, { id: 4, name: 'run_commands' },
    ] }, options.privilegesStatus || 200)
    if (url.pathname.endsWith('/workflows/42')) return json({ id: 42, project_id: 7, status: options.status || 'finished' }, options.workflowStatus || 200)
    if (url.pathname.endsWith('/branches/main')) return json({ commit: { id: options.baseCommit || sha } })
    if (url.pathname.includes('/repository/branches/')) return json({}, branchExists ? 200 : 404)
    if (url.pathname.includes('/repository/files/')) {
      const file = url.searchParams.get('ref') === sha ? (options.snapshot === undefined ? original : options.snapshot) : current
      return json(file || {}, file ? 200 : 404)
    }
    if (url.pathname.endsWith('/user')) return json({ username: 'test-user' })
    throw new Error(`Unexpected request ${url}`)
  }
  const mocks = {
    '@/lib/auth/require-project-access': { requireUser: async () => ({ id: 'user-1' }) },
    '@/lib/integrations/repository-connections': {
      decryptConnection: () => ({ userId: 'user-1', accessToken: 'old-test-token' }),
      encryptConnection: () => 'rotated-cookie',
      refreshRepositoryConnection: async () => ({ connection: { userId: 'user-1', accessToken: 'new-test-token' }, refreshed: true }),
      oauthCookieOptions: maxAge => ({ httpOnly: true, sameSite: 'lax', path: '/', maxAge }),
      providerBaseUrl: () => 'https://gitlab.example', tokenCookieName: () => 'odai_gitlab_connection',
    },
  }
  const load = loader(mocks, fetcher)
  return {
    mutations,
    apply: async (changes = {}) => load('app/api/integrations/gitlab/duo-flows/apply/route.ts').POST(new NextRequest('https://app.example/api/apply', {
      method: 'POST', body: JSON.stringify({ approved: true, projectId: '7', workflowId: '42', baseBranch: 'main', reviewToken: sealDuoReview(context, secret), proposals, ...changes }),
    })),
    get: async () => load('app/api/integrations/gitlab/duo-flows/route.ts').GET(new NextRequest('https://app.example/api/duo?workflowId=42')),
    start: async () => load('app/api/integrations/gitlab/duo-flows/route.ts').POST(new NextRequest('https://app.example/api/duo', {
      method: 'POST', body: JSON.stringify({ projectId: '7', baseBranch: 'main', goal: 'Review findings', findings: [] }),
    })),
    readiness: async () => load('app/api/integrations/gitlab/duo-flows/readiness/route.ts').GET(new NextRequest('https://app.example/api/readiness')),
  }
}

test('complete proposals survive the 12,000-character progress preview and 80-message window', async () => {
  const proposal = fix('large', 'x'.repeat(13000))
  const oldOutput = trace([proposal]) + '\n' + Array.from({ length: 85 }, () => JSON.stringify({ message_type: 'ai', content: 'Progress' })).join('\n')
  const response = await harness({ trace: oldOutput }).get()
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.proposals[0].files[0].content.length, 13000)
  assert.equal(data.messages.length, 80)
})

test('only completed workflows expose approvable proposals', async () => {
  const h = harness({ status: 'input_required' })
  assert.deepEqual((await (await h.get()).json()).proposals, [])
  assert.equal((await h.apply()).status, 409)
  assert.equal(h.mutations.length, 0)
})

test('trace failure is visible and preserves the refreshed cookie', async () => {
  const response = await harness({ traceStatus: 503 }).get()
  assert.equal(response.status, 502)
  assert.match(response.headers.get('set-cookie'), /rotated-cookie/)
})

test('workflow creation signs the exact resolved commit and includes it in agent context', async () => {
  const h = harness()
  const response = await h.start()
  assert.equal(response.status, 201)
  const data = await response.json()
  assert.equal(openDuoReview(data.workflow.reviewToken, secret).baseCommit, sha)
  const payload = JSON.parse(h.mutations[0].body)
  assert.equal(payload.source_branch, "main")
  assert.match(payload.goal, new RegExp(sha))
  assert.equal(JSON.parse(payload.additional_context[0].Content).baseCommit, sha)
  assert.deepEqual(payload.agent_privileges, [1, 2, 4])
})

test('new fix branches start at the reviewed commit; updates use GitLab version guards', async () => {
  const h = harness({ branchExists: false })
  assert.equal((await h.apply()).status, 201)
  assert.equal(new URLSearchParams(h.mutations[0].body).get('ref'), sha)
  assert.equal(JSON.parse(h.mutations[1].body).actions[0].last_commit_id, sha)
})

test('separate approvals cannot erase an earlier replacement of the same file', async () => {
  const first = fix('one', 'first fix'), second = fix('two', 'second fix')
  const h = harness({ proposals: [first, second] })
  assert.equal((await h.apply({ proposals: [first] })).status, 201)
  const response = await h.apply({ proposals: [second] })
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /changed since the review/)
  assert.equal(h.mutations.length, 1)
})

test('a changed base branch blocks approval before any mutation', async () => {
  const h = harness({ baseCommit: 'b'.repeat(40) })
  assert.equal((await h.apply()).status, 409)
  assert.equal(h.mutations.length, 0)
})

test('modified/deleted/new files on the fix branch block stale replacements', async () => {
  for (const options of [{ current: { ...original, blob_id: 'new' } }, { current: null }, { snapshot: null }]) {
    const h = harness(options)
    assert.equal((await h.apply()).status, 409)
    assert.equal(h.mutations.length, 0)
  }
})

test('new files use create actions, which cannot overwrite an existing file', async () => {
  const h = harness({ snapshot: null, current: null })
  assert.equal((await h.apply()).status, 201)
  assert.equal(JSON.parse(h.mutations[0].body).actions[0].action, 'create')
})

test('commit conflicts are not reported as success and preserve refreshed credentials', async () => {
  const response = await harness({ commitConflict: true }).apply()
  assert.equal(response.status, 502)
  assert.match(response.headers.get('set-cookie'), /rotated-cookie/)
})

test('explicit approval and exact server-side file content are required', async () => {
  for (const changes of [{ approved: false }, { proposals: [fix('fix-1', 'tampered')] }, { proposals: [fix(), fix()] }, { reviewToken: 'invalid' }]) {
    const h = harness()
    assert.notEqual((await h.apply(changes)).status, 201)
    assert.equal(h.mutations.length, 0)
  }
})

test('duplicate paths cannot substitute for missing files in trace verification', async () => {
  const proposal = fix()
  proposal.files.push({ path: 'src/other.ts', content: 'other' })
  const h = harness({ proposals: [proposal] })
  assert.equal((await h.apply({ proposals: [{ ...proposal, files: [proposal.files[0], proposal.files[0]] }] })).status, 400)
  assert.equal(h.mutations.length, 0)
})

test('post-refresh errors and network exceptions keep rotated credentials on all Duo routes', async () => {
  for (const [options, method] of [[{ privilegesStatus: 403 }, 'start'], [{ workflowStatus: 503 }, 'get'], [{ workflowStatus: 503 }, 'apply'], [{ throwHttp: true }, 'start'], [{ throwHttp: true }, 'get'], [{ throwHttp: true }, 'apply'], [{ throwHttp: true }, 'readiness']]) {
    const response = await harness(options)[method]()
    assert.ok(response.status >= 400)
    assert.match(response.headers.get('set-cookie'), /rotated-cookie/)
  }
})

test('signed context rejects tampering, expiration and a different signing secret', () => {
  const token = sealDuoReview(context, secret)
  assert.deepEqual(openDuoReview(token, secret), context)
  assert.equal(openDuoReview(token + 'x', secret), null)
  assert.equal(openDuoReview(token, 'different-secret'.repeat(4)), null)
  assert.equal(openDuoReview(token, secret, context.expiresAt), null)
})

test('parser accepts fenced AI output and rejects tool output, duplicate IDs, paths and unsafe replacements', () => {
  const fenced = JSON.stringify({ message_type: 'ai', content: '```json\n' + JSON.stringify({ proposals: [fix()] }) + '\n```' })
  assert.equal(extractTraceProposals(fenced).length, 1)
  assert.equal(extractTraceProposals(JSON.stringify({ message_type: 'tool', content: JSON.stringify({ proposals: [fix()] }) })), null)
  assert.equal(extractTraceProposals(trace([fix(), fix()])), null)
  const duplicate = fix(); duplicate.files.push(duplicate.files[0])
  assert.equal(extractTraceProposals(trace([duplicate])), null)
  for (const path of ['../escape', '/absolute', 'src//app.ts', ' src/app.ts', '.git/config']) assert.equal(extractTraceProposals(trace([fix('bad', 'x', path)])), null)
  assert.deepEqual(extractTraceProposals(trace([])), [])
})
