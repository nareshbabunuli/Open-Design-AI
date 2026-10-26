import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import puppeteer from 'puppeteer'
import { generateUploadFixtures } from '../lib/ai-automation/upload-fixtures'
import { scanUploadFolder, pickUploadFile } from '../lib/ai-automation/test-file-manager'
import { setSelection } from '../lib/ai-automation/control-interactions'
import { uploadControl } from '../lib/ai-automation/upload-interaction'

test('fixtures respect accept filters and contain contextual synthetic documents', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-upload-'))
  try {
    await generateUploadFixtures(folder, 'Resume', 'Upload your CV')
    const inventory = scanUploadFolder(folder)
    assert.throws(() => pickUploadFile(inventory, { acceptAttr: '.xlsx' }))
    const doc = pickUploadFile(inventory, { acceptAttr: '.docx' })
    const zip = await JSZip.loadAsync(await fs.readFile(doc.filePath))
    assert.match(await zip.file('word/document.xml')!.async('string'), /Fictional résumé/)
    const csv = pickUploadFile(inventory, { acceptAttr: 'text/csv' })
    assert.match(csv.fileName, /\.csv$/)
  } finally { await fs.rm(folder, { recursive: true, force: true }) }
})

test('hidden checkbox labels and radio groups reach desired state without toggling twice', async () => {
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']})
  try {
    const page = await browser.newPage()
    await page.setContent('<input hidden type=checkbox id=c><label for=c>Accept terms</label><input type=radio name=g id=a checked><input type=radio name=g id=b>')
    assert.equal((await setSelection(page,{selector:'#c'},true)).ok,true)
    assert.equal((await setSelection(page,{selector:'#c'},true)).ok,true)
    assert.equal((await setSelection(page,{selector:'#b'},true)).ok,true)
    assert.deepEqual(await page.$$eval('input',els=>els.map(e=>(e as HTMLInputElement).checked)),[true,false,true])
  } finally { await browser.close() }
})

test('custom chooser uses its linked hidden input and leaves unrelated input empty', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-chooser-'))
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']})
  try {
    await generateUploadFixtures(folder,'Customer CSV')
    const page = await browser.newPage()
    await page.setContent('<input type=file id=other><input hidden type=file id=data accept=".csv"><button id=choose onclick="document.querySelector(\'#data\').click()">Choose data</button>')
    const result = await uploadControl(page,{uploadFilesDir:folder} as any,{selector:'#choose'})
    assert.equal(result.state,'selected')
    assert.deepEqual(await page.$$eval('input',els=>els.map(e=>(e as HTMLInputElement).files?.length)),[0,1])
  } finally { await browser.close(); await fs.rm(folder,{recursive:true,force:true}) }
})
