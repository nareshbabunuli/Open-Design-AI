import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { createDummyFileBuffer } from './test-file-manager'

export async function generateUploadFixtures(folder: string, label = 'Test upload', context = '') {
  await fs.mkdir(folder, { recursive: true })
  for (const type of ['image', 'pdf', 'csv', 'document'] as const) {
    const file = createDummyFileBuffer(type)
    await fs.writeFile(path.join(folder, file.fileName), file.buffer)
  }
  const hint = `${label} ${context}`.slice(0, 500)
  const text = /resume|résumé|cv\b/i.test(hint) ? 'Fictional résumé: Alex Example. QA tester. Skills: testing and documentation. This is synthetic test data.' :
    /invoice|receipt/i.test(hint) ? 'Fictional invoice: TEST-001. Customer: Example Company. Item: Demo service. Amount: 100.00. Currency: USD.' :
    `Fictional QA document for ${hint}. Generated only to test this upload control.`
  await fs.writeFile(path.join(folder, 'dummy_test_document.txt'), text)
  if (/contact|customer|employee/i.test(hint)) await fs.writeFile(path.join(folder, 'dummy_test_data.csv'), 'id,name,email\n1,Alex Example,alex@example.com\n')
  // Build a PDF with accurate object offsets and visible contextual text.
  const safe = text.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')
  const stream = `BT /F1 10 Tf 30 740 Td (${safe.slice(0, 100)}) Tj ET`
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const object of ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]) {
    offsets.push(Buffer.byteLength(pdf)); pdf += `${offsets.length} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  await fs.writeFile(path.join(folder, 'dummy_test_document.pdf'), pdf)
  const xmlText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${xmlText}</w:t></w:r></w:p></w:body></w:document>`)
  await fs.writeFile(path.join(folder, 'sample-document.docx'), await zip.generateAsync({ type: 'nodebuffer' }))
  for (const [name, content] of Object.entries({ 'sample.json': '{"example":true}', 'sample.js': 'export const example = true;\n', 'sample.ts': 'export const example: boolean = true;\n', 'sample.py': 'example = True\n', 'sample.html': '<!doctype html><title>Test fixture</title>', 'sample.css': 'body { color: black; }', 'sample.md': '# Fictional QA fixture\n' })) await fs.writeFile(path.join(folder, name), content)
}
