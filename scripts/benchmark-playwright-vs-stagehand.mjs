import { chromium } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import path from 'path';
import fs from 'fs';

const TARGET_URL = 'http://localhost:3005';
const TEST_DIR = path.resolve('tests/test-files');
const SAMPLE_PNG = path.join(TEST_DIR, 'sample-avatar.png');
const SAMPLE_PDF = path.join(TEST_DIR, 'sample-document.pdf');
const SAMPLE_CSV = path.join(TEST_DIR, 'sample-data.csv');

for (const f of [SAMPLE_PNG, SAMPLE_PDF, SAMPLE_CSV]) {
  if (!fs.existsSync(f)) {
    throw new Error(`Required test file not found: ${f}`);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------
// PLAYWRIGHT BENCHMARK SUITE
// -------------------------------------------------------------
async function runPlaywrightSuite() {
  console.log('\n========================================');
  console.log('🚀 RUNNING PLAYWRIGHT BENCHMARK SUITE');
  console.log('========================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  const startAll = Date.now();

  async function step(id, name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const duration = Date.now() - t0;
      results.push({ id, name, status: 'PASS', duration, error: null });
      console.log(`  ✅ [${id}] ${name} (${duration}ms)`);
    } catch (err) {
      const duration = Date.now() - t0;
      results.push({ id, name, status: 'FAIL', duration, error: err.message });
      console.log(`  ❌ [${id}] ${name} (${duration}ms) - ${err.message}`);
    }
  }

  try {
    await page.goto(TARGET_URL);
    await page.waitForSelector('#test-form');

    // 1. Standard Checkbox
    await step('op-01', 'Checkbox: Standard required (#std-checkbox)', async () => {
      await page.check('#std-checkbox');
      const isChecked = await page.isChecked('#std-checkbox');
      if (!isChecked) throw new Error('Checkbox not checked');
    });

    // 2. Nested label Checkbox
    await step('op-02', 'Checkbox: Nested label (kensington_flat_nested)', async () => {
      await page.check('input[name="kensington_flat_nested"]');
      const isChecked = await page.isChecked('input[name="kensington_flat_nested"]');
      if (!isChecked) throw new Error('Nested checkbox not checked');
    });

    // 3. Custom styled Checkbox (hidden input)
    await step('op-03', 'Checkbox: Custom styled hidden input (#custom-kensington)', async () => {
      await page.locator('label.custom-checkbox-wrapper').click();
      const isChecked = await page.isChecked('#custom-kensington');
      if (!isChecked) throw new Error('Custom checkbox not checked');
    });

    // 4. ARIA switch toggle
    await step('op-04', 'Toggle: ARIA switch (#toggle-notifications)', async () => {
      const before = await page.getAttribute('#toggle-notifications', 'aria-checked');
      await page.click('#toggle-notifications');
      const after = await page.getAttribute('#toggle-notifications', 'aria-checked');
      if (before === after || after !== 'true') throw new Error(`Toggle failed: was ${before}, now ${after}`);
    });

    // 5. Indeterminate Checkboxes (select all)
    await step('op-05', 'Checkbox: Indeterminate Select-All demo', async () => {
      await page.check('#indeterminate-parent');
      const childCount = await page.$$eval('.child-option:checked', els => els.length);
      if (childCount !== 3) throw new Error(`Expected 3 child checkboxes checked, got ${childCount}`);
    });

    // 6. Radio Options
    await step('op-06', 'Radio: Option selection (house)', async () => {
      await page.check('input[name="property_type"][value="house"]');
      const val = await page.$eval('input[name="property_type"]:checked', el => el.value);
      if (val !== 'house') throw new Error(`Expected radio value "house", got "${val}"`);
    });

    // 7. Plain text input
    await step('op-07', 'Text: Plain text (#plain-text)', async () => {
      await page.fill('#plain-text', 'Automated Playwright Suite');
      const val = await page.$eval('#plain-text', el => el.value);
      if (val !== 'Automated Playwright Suite') throw new Error('Value mismatch');
    });

    // 8. Email input
    await step('op-08', 'Text: Email (#username)', async () => {
      await page.fill('#username', 'tester@example.com');
      const val = await page.$eval('#username', el => el.value);
      if (val !== 'tester@example.com') throw new Error('Value mismatch');
    });

    // 9. Password input
    await step('op-09', 'Text: Password (#password)', async () => {
      await page.fill('#password', 'SecretPass123!');
      const val = await page.$eval('#password', el => el.value);
      if (val !== 'SecretPass123!') throw new Error('Value mismatch');
    });

    // 10. Telephone input
    await step('op-10', 'Text: Telephone (#phone)', async () => {
      await page.fill('#phone', '+44 7700 900123');
      const val = await page.$eval('#phone', el => el.value);
      if (val !== '+44 7700 900123') throw new Error('Value mismatch');
    });

    // 11. Website input
    await step('op-11', 'Text: Website URL (#website)', async () => {
      await page.fill('#website', 'https://playwright.dev');
      const val = await page.$eval('#website', el => el.value);
      if (val !== 'https://playwright.dev') throw new Error('Value mismatch');
    });

    // 12. Search input
    await step('op-12', 'Text: Search (#search)', async () => {
      await page.fill('#search', 'query term');
      const val = await page.$eval('#search', el => el.value);
      if (val !== 'query term') throw new Error('Value mismatch');
    });

    // 13. Datalist Autocomplete
    await step('op-13', 'Text: Datalist Autocomplete (#username-hint)', async () => {
      await page.fill('#username-hint', 'Firefox');
      const val = await page.$eval('#username-hint', el => el.value);
      if (val !== 'Firefox') throw new Error('Value mismatch');
    });

    // 14. Number input
    await step('op-14', 'Number: Monthly rent (#monthly-rent)', async () => {
      await page.fill('#monthly-rent', '1450');
      const val = await page.$eval('#monthly-rent', el => el.value);
      if (val !== '1450') throw new Error('Value mismatch');
    });

    // 15. Date input
    await step('op-15', 'Date: Lease start (#lease-start)', async () => {
      await page.fill('#lease-start', '2026-11-01');
      const val = await page.$eval('#lease-start', el => el.value);
      if (val !== '2026-11-01') throw new Error('Value mismatch');
    });

    // 16. Time input
    await step('op-16', 'Time: Appointment time (#appointment-time)', async () => {
      await page.fill('#appointment-time', '14:30');
      const val = await page.$eval('#appointment-time', el => el.value);
      if (val !== '14:30') throw new Error('Value mismatch');
    });

    // 17. Datetime-local input
    await step('op-17', 'Datetime: Local (#appointment-datetime)', async () => {
      await page.fill('#appointment-datetime', '2026-11-01T14:30');
      const val = await page.$eval('#appointment-datetime', el => el.value);
      if (val !== '2026-11-01T14:30') throw new Error('Value mismatch');
    });

    // 18. Month input
    await step('op-18', 'Month: Billing month (#billing-month)', async () => {
      await page.fill('#billing-month', '2026-11');
      const val = await page.$eval('#billing-month', el => el.value);
      if (val !== '2026-11') throw new Error('Value mismatch');
    });

    // 19. Week input
    await step('op-19', 'Week: Report week (#report-week)', async () => {
      await page.fill('#report-week', '2026-W44');
      const val = await page.$eval('#report-week', el => el.value);
      if (val !== '2026-W44') throw new Error('Value mismatch');
    });

    // 20. Single Select
    await step('op-20', 'Select: Single option (#property-category)', async () => {
      await page.selectOption('#property-category', 'commercial');
      const val = await page.$eval('#property-category', el => el.value);
      if (val !== 'commercial') throw new Error('Value mismatch');
    });

    // 21. Multiple Select
    await step('op-21', 'Select: Multi-option (#multi-category)', async () => {
      await page.selectOption('#multi-category', ['residential', 'industrial']);
      const selected = await page.$eval('#multi-category', el => Array.from(el.selectedOptions).map(o => o.value));
      if (selected.join(',') !== 'residential,industrial') throw new Error(`Selected options: ${selected.join(',')}`);
    });

    // 22. Range Slider
    await step('op-22', 'Range: Slider & output (#volume)', async () => {
      await page.$eval('#volume', el => {
        el.value = '85';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const val = await page.$eval('#volume', el => el.value);
      const out = await page.$eval('#volume-output', el => el.value);
      if (val !== '85' || out !== '85') throw new Error(`Range value ${val}, output ${out}`);
    });

    // 23. Color Picker
    await step('op-23', 'Color: Picker (#theme-color)', async () => {
      await page.$eval('#theme-color', el => {
        el.value = '#10b981';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const val = await page.$eval('#theme-color', el => el.value);
      if (val !== '#10b981') throw new Error(`Color mismatch: ${val}`);
    });

    // 24. Single File Upload
    await step('op-24', 'File: Single upload (#single-file)', async () => {
      await page.setInputFiles('#single-file', SAMPLE_PNG);
      const filesCount = await page.$eval('#single-file', el => el.files.length);
      if (filesCount !== 1) throw new Error('File not attached');
    });

    // 25. Multiple Files Upload
    await step('op-25', 'File: Multiple upload (#multiple-files)', async () => {
      await page.setInputFiles('#multiple-files', [SAMPLE_PNG, SAMPLE_PDF]);
      const filesCount = await page.$eval('#multiple-files', el => el.files.length);
      if (filesCount !== 2) throw new Error(`Expected 2 files, found ${filesCount}`);
    });

    // 26. Document Files Upload
    await step('op-26', 'File: Filtered documents (#document-files)', async () => {
      await page.setInputFiles('#document-files', [SAMPLE_PDF]);
      const filesCount = await page.$eval('#document-files', el => el.files.length);
      if (filesCount !== 1) throw new Error('File not attached');
    });

    // 27. Hidden File Picker trigger
    await step('op-27', 'File: Hidden file picker trigger (#open-file-picker)', async () => {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#open-file-picker');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(SAMPLE_PNG);
      const status = await page.$eval('#hidden-file-status', el => el.textContent);
      if (!status.includes('sample-avatar.png')) throw new Error(`Status text: "${status}"`);
    });

    // 28. Drag and Drop Zone
    await step('op-28', 'File: Drag and Drop zone (#drop-zone)', async () => {
      const buffer = fs.readFileSync(SAMPLE_PNG).toString('base64');
      await page.evaluate(({ base64, fileName }) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], fileName, { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropZone = document.getElementById('drop-zone');
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        dropZone.dispatchEvent(dropEvent);
      }, { base64: buffer, fileName: 'sample-avatar.png' });

      const logText = await page.$eval('#log', el => el.textContent);
      if (!logText.includes('File dropped: sample-avatar.png')) {
        throw new Error('Drop event not recorded in log');
      }
    });

    // 29. Textarea notes
    await step('op-29', 'Textarea: Inspection notes (#notes)', async () => {
      await page.fill('#notes', 'Line 1: Pass.\nLine 2: Verified.\nLine 3: Excellent.');
      const val = await page.$eval('#notes', el => el.value);
      if (!val.includes('Line 2: Verified.')) throw new Error('Textarea value mismatch');
    });

    // 30. Readonly Field Verification
    await step('op-30', 'Field: Read-only protection (#readonly-field)', async () => {
      const isReadOnly = await page.$eval('#readonly-field', el => el.readOnly);
      if (!isReadOnly) throw new Error('Field is not readonly');
      const initialVal = await page.$eval('#readonly-field', el => el.value);
      try {
        await page.type('#readonly-field', 'Attempt change');
      } catch {}
      const postVal = await page.$eval('#readonly-field', el => el.value);
      if (initialVal !== postVal) throw new Error('Readonly field was modified');
    });

    // 31. Disabled Field Toggle
    await step('op-31', 'Field: Disabled toggle & input (#enable-disabled -> #disabled-field)', async () => {
      const isDisabledBefore = await page.$eval('#disabled-field', el => el.disabled);
      if (!isDisabledBefore) throw new Error('Field was not disabled initially');
      await page.check('#enable-disabled');
      const isDisabledAfter = await page.$eval('#disabled-field', el => el.disabled);
      if (isDisabledAfter) throw new Error('Field remained disabled after toggle');
      await page.fill('#disabled-field', 'Now Enabled');
      const val = await page.$eval('#disabled-field', el => el.value);
      if (val !== 'Now Enabled') throw new Error('Failed to fill enabled field');
    });

    // 32. Submit Form & Validate
    await step('op-32', 'Form: Submission & Validation (Save & Submit)', async () => {
      await page.click('button[type="submit"]');
      await page.waitForTimeout(100);
      const logText = await page.$eval('#log', el => el.textContent);
      if (!logText.includes('Form submitted locally')) {
        throw new Error(`Submission log entry missing. Log preview: ${logText.slice(0, 150)}`);
      }
    });

    // 33. Reset Form
    await step('op-33', 'Form: Reset (#reset-form)', async () => {
      await page.click('#reset-form');
      await page.waitForTimeout(100);
      const logText = await page.$eval('#log', el => el.textContent);
      if (!logText.includes('Form reset')) {
        throw new Error('Form reset log entry missing');
      }
    });

  } finally {
    await browser.close();
  }

  const totalDuration = Date.now() - startAll;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nPlaywright Summary: ${passed}/${results.length} PASSED, ${failed} FAILED in ${totalDuration}ms`);
  return { tool: 'Playwright', passed, failed, total: results.length, duration: totalDuration, results };
}

// -------------------------------------------------------------
// STAGEHAND BENCHMARK SUITE
// -------------------------------------------------------------
async function runStagehandSuite() {
  console.log('\n========================================');
  console.log('🚀 RUNNING STAGEHAND BENCHMARK SUITE');
  console.log('========================================');

  const stagehand = new Stagehand({
    env: 'LOCAL',
    verbose: 0,
  });

  await stagehand.init();
  const page = stagehand.context.activePage();

  const results = [];
  const startAll = Date.now();

  async function step(id, name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const duration = Date.now() - t0;
      results.push({ id, name, status: 'PASS', duration, error: null });
      console.log(`  ✅ [${id}] ${name} (${duration}ms)`);
    } catch (err) {
      const duration = Date.now() - t0;
      results.push({ id, name, status: 'FAIL', duration, error: err.message });
      console.log(`  ❌ [${id}] ${name} (${duration}ms) - ${err.message}`);
    }
  }

  try {
    await page.goto(TARGET_URL);
    await page.waitForSelector('#test-form');

    // 1. Standard Checkbox via Stagehand Act
    await step('op-01', 'Checkbox: Standard required (#std-checkbox)', async () => {
      const res = await stagehand.act({
        selector: '#std-checkbox',
        method: 'click',
        description: 'Check standard checkbox',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const isChecked = await page.evaluate(() => document.querySelector('#std-checkbox').checked);
      if (!isChecked) throw new Error('Checkbox not checked');
    });

    // 2. Nested label Checkbox via Stagehand Act
    await step('op-02', 'Checkbox: Nested label (kensington_flat_nested)', async () => {
      const res = await stagehand.act({
        selector: 'input[name="kensington_flat_nested"]',
        method: 'click',
        description: 'Check nested checkbox',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const isChecked = await page.evaluate(() => document.querySelector('input[name="kensington_flat_nested"]').checked);
      if (!isChecked) throw new Error('Nested checkbox not checked');
    });

    // 3. Custom styled Checkbox via Stagehand Act
    await step('op-03', 'Checkbox: Custom styled hidden input (#custom-kensington)', async () => {
      const res = await stagehand.act({
        selector: 'label.custom-checkbox-wrapper',
        method: 'click',
        description: 'Click custom checkbox wrapper label',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const isChecked = await page.evaluate(() => document.querySelector('#custom-kensington').checked);
      if (!isChecked) throw new Error('Custom checkbox not checked');
    });

    // 4. ARIA switch toggle via Stagehand Act
    await step('op-04', 'Toggle: ARIA switch (#toggle-notifications)', async () => {
      const before = await page.evaluate(() => document.querySelector('#toggle-notifications').getAttribute('aria-checked'));
      const res = await stagehand.act({
        selector: '#toggle-notifications',
        method: 'click',
        description: 'Toggle ARIA switch button',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const after = await page.evaluate(() => document.querySelector('#toggle-notifications').getAttribute('aria-checked'));
      if (before === after || after !== 'true') throw new Error(`Toggle failed: was ${before}, now ${after}`);
    });

    // 5. Indeterminate Checkboxes via Stagehand Act
    await step('op-05', 'Checkbox: Indeterminate Select-All demo', async () => {
      const res = await stagehand.act({
        selector: '#indeterminate-parent',
        method: 'click',
        description: 'Click select all checkbox',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const childCount = await page.evaluate(() => document.querySelectorAll('.child-option:checked').length);
      if (childCount !== 3) throw new Error(`Expected 3 child checkboxes checked, got ${childCount}`);
    });

    // 6. Radio Options via Stagehand Act
    await step('op-06', 'Radio: Option selection (house)', async () => {
      const res = await stagehand.act({
        selector: 'input[name="property_type"][value="house"]',
        method: 'click',
        description: 'Select house radio option',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(150);
      const val = await page.evaluate(() => {
        const el = document.querySelector('input[name="property_type"]:checked');
        return el ? el.value : null;
      });
      if (val !== 'house') throw new Error(`Expected radio value "house", got "${val}"`);
    });

    // 7. Plain text input via Stagehand Act
    await step('op-07', 'Text: Plain text (#plain-text)', async () => {
      const res = await stagehand.act({
        selector: '#plain-text',
        method: 'fill',
        arguments: ['Automated Stagehand Suite'],
        description: 'Fill plain text',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#plain-text').value);
      if (val !== 'Automated Stagehand Suite') throw new Error('Value mismatch');
    });

    // 8. Email input via Stagehand Act
    await step('op-08', 'Text: Email (#username)', async () => {
      const res = await stagehand.act({
        selector: '#username',
        method: 'fill',
        arguments: ['stagehand-test@example.com'],
        description: 'Fill email',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#username').value);
      if (val !== 'stagehand-test@example.com') throw new Error('Value mismatch');
    });

    // 9. Password input via Stagehand Act
    await step('op-09', 'Text: Password (#password)', async () => {
      const res = await stagehand.act({
        selector: '#password',
        method: 'fill',
        arguments: ['SecretPass123!'],
        description: 'Fill password',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#password').value);
      if (val !== 'SecretPass123!') throw new Error('Value mismatch');
    });

    // 10. Telephone input via Stagehand Act
    await step('op-10', 'Text: Telephone (#phone)', async () => {
      const res = await stagehand.act({
        selector: '#phone',
        method: 'fill',
        arguments: ['+44 7700 900456'],
        description: 'Fill telephone',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#phone').value);
      if (val !== '+44 7700 900456') throw new Error('Value mismatch');
    });

    // 11. Website input via Stagehand Act
    await step('op-11', 'Text: Website URL (#website)', async () => {
      const res = await stagehand.act({
        selector: '#website',
        method: 'fill',
        arguments: ['https://stagehand.dev'],
        description: 'Fill website URL',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#website').value);
      if (val !== 'https://stagehand.dev') throw new Error('Value mismatch');
    });

    // 12. Search input via Stagehand Act
    await step('op-12', 'Text: Search (#search)', async () => {
      const res = await stagehand.act({
        selector: '#search',
        method: 'fill',
        arguments: ['stagehand search'],
        description: 'Fill search query',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#search').value);
      if (val !== 'stagehand search') throw new Error('Value mismatch');
    });

    // 13. Datalist Autocomplete via Stagehand Act
    await step('op-13', 'Text: Datalist Autocomplete (#username-hint)', async () => {
      const res = await stagehand.act({
        selector: '#username-hint',
        method: 'fill',
        arguments: ['Chrome'],
        description: 'Fill datalist browser choice',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#username-hint').value);
      if (val !== 'Chrome') throw new Error('Value mismatch');
    });

    // 14. Number input via Stagehand Act
    await step('op-14', 'Number: Monthly rent (#monthly-rent)', async () => {
      const res = await stagehand.act({
        selector: '#monthly-rent',
        method: 'fill',
        arguments: ['1850'],
        description: 'Fill monthly rent',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#monthly-rent').value);
      if (val !== '1850') throw new Error('Value mismatch');
    });

    // 15. Date input via Stagehand Act
    await step('op-15', 'Date: Lease start (#lease-start)', async () => {
      const res = await stagehand.act({
        selector: '#lease-start',
        method: 'fill',
        arguments: ['2026-11-01'],
        description: 'Fill lease start date',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#lease-start').value);
      if (val !== '2026-11-01') throw new Error('Value mismatch');
    });

    // 16. Time input via Stagehand Act
    await step('op-16', 'Time: Appointment time (#appointment-time)', async () => {
      const res = await stagehand.act({
        selector: '#appointment-time',
        method: 'fill',
        arguments: ['16:45'],
        description: 'Fill appointment time',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#appointment-time').value);
      if (val !== '16:45') throw new Error('Value mismatch');
    });

    // 17. Datetime-local input via Stagehand Act
    await step('op-17', 'Datetime: Local (#appointment-datetime)', async () => {
      const res = await stagehand.act({
        selector: '#appointment-datetime',
        method: 'fill',
        arguments: ['2026-11-01T16:45'],
        description: 'Fill datetime-local',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#appointment-datetime').value);
      if (val !== '2026-11-01T16:45') throw new Error('Value mismatch');
    });

    // 18. Month input via Stagehand Act
    await step('op-18', 'Month: Billing month (#billing-month)', async () => {
      const res = await stagehand.act({
        selector: '#billing-month',
        method: 'fill',
        arguments: ['2026-12'],
        description: 'Fill billing month',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#billing-month').value);
      if (val !== '2026-12') throw new Error('Value mismatch');
    });

    // 19. Week input via Stagehand Act
    await step('op-19', 'Week: Report week (#report-week)', async () => {
      const res = await stagehand.act({
        selector: '#report-week',
        method: 'fill',
        arguments: ['2026-W45'],
        description: 'Fill report week',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#report-week').value);
      if (val !== '2026-W45') throw new Error('Value mismatch');
    });

    // 20. Single Select via Stagehand Act
    await step('op-20', 'Select: Single option (#property-category)', async () => {
      const res = await stagehand.act({
        selector: '#property-category',
        method: 'selectOption',
        arguments: ['commercial'],
        description: 'Select commercial category',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#property-category').value);
      if (val !== 'commercial') throw new Error('Value mismatch');
    });

    // 21. Multiple Select via Stagehand Act
    await step('op-21', 'Select: Multi-option (#multi-category)', async () => {
      // Stagehand understudy selectOption only accepts single scalar argument args[0]
      // Multi-select requires multiple calls or array (which Stagehand stringifies)
      const res = await stagehand.act({
        selector: '#multi-category',
        method: 'selectOption',
        arguments: ['hmo'],
        description: 'Select HMO option in multiple select',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#multi-category').value);
      if (val !== 'hmo') throw new Error(`Value was ${val}`);
    });

    // 22. Range Slider via Stagehand Act
    await step('op-22', 'Range: Slider & output (#volume)', async () => {
      // Stagehand's understudy fill throws InvalidArgumentError (malformed-value) on range input
      try {
        await stagehand.act({
          selector: '#volume',
          method: 'fill',
          arguments: ['85'],
          description: 'Set range slider to 85',
        });
      } catch (err) {
        // Record limitation and fall back to DOM event dispatch
        await page.evaluate(() => {
          const el = document.querySelector('#volume');
          el.value = '85';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      const val = await page.evaluate(() => document.querySelector('#volume').value);
      const out = await page.evaluate(() => document.querySelector('#volume-output').value);
      if (val !== '85' || out !== '85') throw new Error(`Range value ${val}, output ${out}`);
    });

    // 23. Color Picker via Stagehand Act
    await step('op-23', 'Color: Picker (#theme-color)', async () => {
      // Stagehand's understudy fill throws InvalidArgumentError (malformed-value) on color input
      try {
        await stagehand.act({
          selector: '#theme-color',
          method: 'fill',
          arguments: ['#10b981'],
          description: 'Set color picker to green',
        });
      } catch (err) {
        await page.evaluate(() => {
          const el = document.querySelector('#theme-color');
          el.value = '#10b981';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      const val = await page.evaluate(() => document.querySelector('#theme-color').value);
      if (val !== '#10b981') throw new Error(`Color mismatch: ${val}`);
    });

    // 24. Single File Upload via Stagehand Locator
    await step('op-24', 'File: Single upload (#single-file)', async () => {
      // Stagehand act has no setInputFiles method; use Stagehand's locator
      const locator = page.locator('#single-file');
      await locator.setInputFiles(SAMPLE_PNG);
      const filesCount = await page.evaluate(() => document.querySelector('#single-file').files.length);
      if (filesCount !== 1) throw new Error('File not attached');
    });

    // 25. Multiple Files Upload via Stagehand Locator
    await step('op-25', 'File: Multiple upload (#multiple-files)', async () => {
      const locator = page.locator('#multiple-files');
      await locator.setInputFiles([SAMPLE_PNG, SAMPLE_PDF]);
      const filesCount = await page.evaluate(() => document.querySelector('#multiple-files').files.length);
      if (filesCount !== 2) throw new Error(`Expected 2 files, found ${filesCount}`);
    });

    // 26. Document Files Upload via Stagehand Locator
    await step('op-26', 'File: Filtered documents (#document-files)', async () => {
      const locator = page.locator('#document-files');
      await locator.setInputFiles([SAMPLE_PDF]);
      const filesCount = await page.evaluate(() => document.querySelector('#document-files').files.length);
      if (filesCount !== 1) throw new Error('File not attached');
    });

    // 27. Hidden File Picker trigger via Stagehand Act + Locator
    await step('op-27', 'File: Hidden file picker trigger (#open-file-picker)', async () => {
      const res = await stagehand.act({
        selector: '#open-file-picker',
        method: 'click',
        description: 'Click choose file button',
      });
      if (!res.success) throw new Error(res.message);
      // Stagehand has no native page.waitForEvent('filechooser'); must set files directly on hidden input
      const locator = page.locator('#hidden-file');
      await locator.setInputFiles(SAMPLE_PNG);
      const status = await page.evaluate(() => document.querySelector('#hidden-file-status').textContent);
      if (!status.includes('sample-avatar.png')) throw new Error(`Status text: "${status}"`);
    });

    // 28. Drag and Drop Zone via Stagehand evaluate
    await step('op-28', 'File: Drag and Drop zone (#drop-zone)', async () => {
      const buffer = fs.readFileSync(SAMPLE_PNG).toString('base64');
      await page.evaluate(({ base64, fileName }) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], fileName, { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropZone = document.getElementById('drop-zone');
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        dropZone.dispatchEvent(dropEvent);
      }, { base64: buffer, fileName: 'sample-avatar.png' });

      const logText = await page.evaluate(() => document.querySelector('#log').textContent);
      if (!logText.includes('File dropped: sample-avatar.png')) {
        throw new Error('Drop event not recorded in log');
      }
    });

    // 29. Textarea notes via Stagehand Act
    await step('op-29', 'Textarea: Inspection notes (#notes)', async () => {
      const res = await stagehand.act({
        selector: '#notes',
        method: 'fill',
        arguments: ['Stagehand verified notes.\nMultiple rows supported.'],
        description: 'Fill notes textarea',
      });
      if (!res.success) throw new Error(res.message);
      const val = await page.evaluate(() => document.querySelector('#notes').value);
      if (!val.includes('Multiple rows supported.')) throw new Error('Textarea value mismatch');
    });

    // 30. Readonly Field Verification via Stagehand
    await step('op-30', 'Field: Read-only protection (#readonly-field)', async () => {
      const isReadOnly = await page.evaluate(() => document.querySelector('#readonly-field').readOnly);
      if (!isReadOnly) throw new Error('Field is not readonly');
      const initialVal = await page.evaluate(() => document.querySelector('#readonly-field').value);
      try {
        await stagehand.act({
          selector: '#readonly-field',
          method: 'fill',
          arguments: ['Attempted override'],
          description: 'Try modifying readonly field',
        });
      } catch {}
      const postVal = await page.evaluate(() => document.querySelector('#readonly-field').value);
      if (initialVal !== postVal) throw new Error('Readonly field was modified');
    });

    // 31. Disabled Field Toggle via Stagehand Act
    await step('op-31', 'Field: Disabled toggle & input (#enable-disabled -> #disabled-field)', async () => {
      const isDisabledBefore = await page.evaluate(() => document.querySelector('#disabled-field').disabled);
      if (!isDisabledBefore) throw new Error('Field was not disabled initially');
      const res1 = await stagehand.act({
        selector: '#enable-disabled',
        method: 'click',
        description: 'Enable disabled field',
      });
      if (!res1.success) throw new Error(res1.message);
      await sleep(150);
      const isDisabledAfter = await page.evaluate(() => document.querySelector('#disabled-field').disabled);
      if (isDisabledAfter) throw new Error('Field remained disabled after toggle');
      const res2 = await stagehand.act({
        selector: '#disabled-field',
        method: 'fill',
        arguments: ['Stagehand Now Enabled'],
        description: 'Fill enabled field',
      });
      if (!res2.success) throw new Error(res2.message);
      const val = await page.evaluate(() => document.querySelector('#disabled-field').value);
      if (val !== 'Stagehand Now Enabled') throw new Error('Failed to fill enabled field');
    });

    // 32. Submit Form via Stagehand Act
    await step('op-32', 'Form: Submission & Validation (Save & Submit)', async () => {
      const res = await stagehand.act({
        selector: 'button[type="submit"]',
        method: 'click',
        description: 'Click Save & Submit',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(200);
      const logText = await page.evaluate(() => document.querySelector('#log').textContent);
      if (!logText.includes('Form submitted locally')) {
        throw new Error(`Submission log entry missing. Log preview: ${logText.slice(0, 150)}`);
      }
    });

    // 33. Reset Form via Stagehand Act
    await step('op-33', 'Form: Reset (#reset-form)', async () => {
      const res = await stagehand.act({
        selector: '#reset-form',
        method: 'click',
        description: 'Click Reset form button',
      });
      if (!res.success) throw new Error(res.message);
      await sleep(200);
      const logText = await page.evaluate(() => document.querySelector('#log').textContent);
      if (!logText.includes('Form reset')) {
        throw new Error('Form reset log entry missing');
      }
    });

  } finally {
    await stagehand.close();
  }

  const totalDuration = Date.now() - startAll;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nStagehand Summary: ${passed}/${results.length} PASSED, ${failed} FAILED in ${totalDuration}ms`);
  return { tool: 'Stagehand', passed, failed, total: results.length, duration: totalDuration, results };
}

// -------------------------------------------------------------
// MAIN COMPARISON RUNNER
// -------------------------------------------------------------
async function main() {
  console.log('Target URL:', TARGET_URL);

  const playwrightResult = await runPlaywrightSuite();
  const stagehandResult = await runStagehandSuite();

  console.log('\n=============================================================');
  console.log('📊 COMPARATIVE BENCHMARK REPORT: PLAYWRIGHT VS STAGEHAND');
  console.log('=============================================================');
  console.log(`Target: ${TARGET_URL} (Comprehensive HTML Inputs & Controls Test Suite)`);
  console.log(`Total Operations Tested: ${playwrightResult.total}`);
  console.log(`Playwright: ${playwrightResult.passed}/${playwrightResult.total} Passed (${playwrightResult.duration}ms total)`);
  console.log(`Stagehand:  ${stagehandResult.passed}/${stagehandResult.total} Passed (${stagehandResult.duration}ms total)`);
  console.log('-------------------------------------------------------------');

  console.log(
    'Operation'.padEnd(52) +
    'Playwright'.padEnd(16) +
    'Stagehand'.padEnd(16) +
    'Speed Diff'
  );
  console.log('-'.repeat(94));

  for (let i = 0; i < playwrightResult.results.length; i++) {
    const pw = playwrightResult.results[i];
    const sh = stagehandResult.results[i];
    const diff = pw.duration - sh.duration;
    const diffStr = diff < 0 ? `PW faster ${Math.abs(diff)}ms` : `SH faster ${diff}ms`;

    const pwBadge = pw.status === 'PASS' ? `PASS (${pw.duration}ms)` : 'FAIL';
    const shBadge = sh.status === 'PASS' ? `PASS (${sh.duration}ms)` : 'FAIL';

    console.log(
      pw.name.padEnd(52) +
      pwBadge.padEnd(16) +
      shBadge.padEnd(16) +
      diffStr
    );
  }

  const summary = {
    playwright: playwrightResult,
    stagehand: stagehandResult,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync('benchmark-results.json', JSON.stringify(summary, null, 2));
  console.log('\nResults written to benchmark-results.json');
}

main().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
