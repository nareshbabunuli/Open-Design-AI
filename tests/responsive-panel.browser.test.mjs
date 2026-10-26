import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

test('actual React panel switches device jobs, approves the selected plan and exports the comparison', { timeout: 90000 }, async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'responsive-panel-'))
  const loader = path.join(folder, 'loader.cjs')
  const entry = path.join(folder, 'entry.tsx')
  const bundle = path.join(folder, 'bundle.js')
  fs.writeFileSync(loader, `module.exports = source => require(${JSON.stringify(path.join(root, 'node_modules/typescript'))}).transpileModule(source,{compilerOptions:{target:7,module:99,jsx:4}}).outputText`)
  const members = ['Desktop', 'Tablet', 'Mobile'].map((name, index) => ({ jobId: `panel-job-${index}`, viewport: { name, width: [1440, 768, 390][index], height: [900, 1024, 844][index] } }))
  const jobs = members.map(member => ({ id: member.jobId, projectId: 'project-1', targetUrl: 'https://fixture.test', status: 'running', viewports: [member.viewport], responsiveGroup: { id: 'panel-group', members }, planApprovalState: 'awaiting_review', fullAppTestPlan: { steps: [{ id: 'step-1', targetName: 'Save' }] } }))
  fs.writeFileSync(entry, `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ResponsiveJourneyPanel}from${JSON.stringify(path.join(root, 'components/design-review/responsive-journey-panel'))};function Fixture(){const[job,setJob]=useState(${JSON.stringify(jobs[0])});const[enabled,setEnabled]=useState(true);return <><p data-testid="selected-job">{job.id}:{job.planApprovalState}</p><p data-testid="selected-status">{job.status}</p><ResponsiveJourneyPanel job={job} enabled={enabled} onEnabledChange={setEnabled} onSelectJob={setJob}/></>}createRoot(document.getElementById('app')).render(<Fixture/>);`)
  const { webpack } = require('next/dist/compiled/webpack/webpack')
  await new Promise((resolve, reject) => {
    webpack({ mode: 'development', devtool: false, context: root, entry, output: { path: folder, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] }, module: { rules: [{ test: /\.tsx?$/, use: loader }] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve())
  })
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    const approvals = [], stops = []
    await page.setRequestInterception(true)
    page.on('request', async request => {
      const url = new URL(request.url())
      if (url.pathname === '/bundle.js') return request.respond({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(bundle, 'utf8') })
      if (url.pathname === '/api/ai-automation/status') {
        const body = request.method() === 'POST' ? JSON.parse(request.postData()) : null
        const job = jobs.find(item => item.id === (body?.jobId || url.searchParams.get('jobId')))
        if (body) { approvals.push(body); job.planApprovalState = 'approved' }
        return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, job }) })
      }
      if (url.pathname === '/api/ai-automation/responsive') {
        if (request.method() === 'POST') {
          stops.push(JSON.parse(request.postData()))
          jobs.forEach(job => { job.status = 'stopped' })
          return request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' })
        }
        const data = url.searchParams.get('summary') === '1'
          ? { runs: jobs.map(job => ({ jobId: job.id, viewport: job.viewports[0], status: job.status, approval: job.planApprovalState, snapshots: 0 })) }
          : { status: 'incomplete', screens: [], runs: [], limitations: ['Fixture captures are not available.'] }
        return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      }
      return request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="app"></div><script src="/bundle.js"></script></body></html>' })
    })
    await page.goto('https://our-app.test/', { waitUntil: 'networkidle0' })
    await page.waitForSelector('[role=tab]')
    assert.equal(await page.$$eval('[role=tab]', tabs => tabs.length), 4)
    await page.evaluate(() => Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.startsWith('Mobile')).click())
    await page.waitForFunction(() => document.querySelector('[data-testid=selected-job]')?.textContent.startsWith('panel-job-2:'))
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent.startsWith('Approve Mobile plan')).click())
    await page.waitForFunction(() => document.querySelector('[data-testid=selected-job]')?.textContent === 'panel-job-2:approved')
    assert.equal(approvals[0].jobId, 'panel-job-2')
    assert.equal(approvals[0].action, 'approve_test_plan')
    await page.evaluate(() => Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent === 'Compare').click())
    await page.waitForFunction(() => document.querySelector('[role=tabpanel]')?.textContent.includes('No journey states captured yet'))
    assert.match(await page.$eval('[role=tabpanel]', element => element.textContent), /incomplete/)
    const exports = await page.$$eval('[role=tabpanel] a', anchors => anchors.map(anchor => anchor.getAttribute('href')))
    assert.ok(exports.some(url => url.includes('format=html') && url.includes('jobId=panel-job-0')))
    assert.ok(exports.some(url => url.includes('format=download')))
    await page.evaluate(() => Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.startsWith('Desktop')).click())
    await page.waitForFunction(() => document.querySelector('[data-testid=selected-job]')?.textContent.startsWith('panel-job-0:'))
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Stop all journeys').click())
    await page.waitForFunction(() => document.querySelector('[data-testid=selected-status]')?.textContent === 'stopped')
    assert.equal(stops[0]?.jobId, 'panel-job-0')
    assert.deepEqual(failures, [])
  } finally { await browser.close(); fs.rmSync(folder, { recursive: true, force: true }) }
})
