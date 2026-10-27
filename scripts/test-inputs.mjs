import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

function getSystemChromePath() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
    localAppData ? path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') : null,
    path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function testInputs() {
  const chromePath = getSystemChromePath();
  console.log('System browser found at:', chromePath);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const port = process.env.PORT || '3005';
  await page.goto(`http://localhost:${port}/test-inputs.html`, { waitUntil: 'domcontentloaded' });

  console.log('\n--- 1. Testing Standard Checkbox ---');
  const stdCheck = await page.$('#std-checkbox');
  const stdBefore = await page.evaluate(el => el.checked, stdCheck);
  await stdCheck.click();
  const stdAfter = await page.evaluate(el => el.checked, stdCheck);
  console.log(`Standard Checkbox: before=${stdBefore}, after=${stdAfter}, toggled=${stdAfter !== stdBefore}`);

  console.log('\n--- 2. Testing Kensington Flat (Nested input inside label) ---');
  const kensingtonNestedInput = await page.$('input[name="kensington_flat_nested"]');
  const nestedBefore = await page.evaluate(el => el.checked, kensingtonNestedInput);
  
  const labelParent = await page.evaluateHandle(el => el.closest('label'), kensingtonNestedInput);
  if (labelParent) {
    await labelParent.asElement().click();
  } else {
    await kensingtonNestedInput.click();
  }
  const nestedAfter = await page.evaluate(el => el.checked, kensingtonNestedInput);
  console.log(`Kensington Nested: before=${nestedBefore}, after=${nestedAfter}, toggled=${nestedAfter !== nestedBefore}`);

  console.log('\n--- 3. Testing Kensington Flat Custom (opacity: 0, sr-only) ---');
  const kensingtonCustomInput = await page.$('input[name="kensington_flat_custom"]');
  const customBefore = await page.evaluate(el => el.checked, kensingtonCustomInput);
  
  // Test our delegation strategy implemented in full-app-engine.ts
  const customTarget = await page.evaluateHandle(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const isHidden = rect.width <= 2 || rect.height <= 2 || style.opacity === '0' || style.visibility === 'hidden';
    if (isHidden) {
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel;
      if (el.id) {
        const matching = document.querySelector(`label[for="${el.id}"]`);
        if (matching) return matching;
      }
    }
    return el;
  }, kensingtonCustomInput);

  await customTarget.asElement().click();
  const customAfter = await page.evaluate(el => el.checked, kensingtonCustomInput);
  console.log(`Kensington Custom (opacity: 0): before=${customBefore}, after=${customAfter}, toggled=${customAfter !== customBefore}`);

  console.log('\n--- 4. Testing Role Switch ---');
  const switchBtn = await page.$('#toggle-notifications');
  const switchBefore = await page.evaluate(el => el.getAttribute('aria-checked') || el.getAttribute('data-state'), switchBtn);
  await switchBtn.click();
  const switchAfter = await page.evaluate(el => el.getAttribute('aria-checked') || el.getAttribute('data-state'), switchBtn);
  console.log(`Role Switch: before=${switchBefore}, after=${switchAfter}, toggled=${switchAfter !== switchBefore}`);

  console.log('\n--- 5. Testing Radio Buttons ---');
  const radio = await page.$('input[value="house"]');
  const radioBefore = await page.evaluate(el => el.checked, radio);
  await radio.click();
  const radioAfter = await page.evaluate(el => el.checked, radio);
  console.log(`Radio House: before=${radioBefore}, after=${radioAfter}, toggled=${radioAfter !== radioBefore}`);

  console.log('\n--- 6. Testing Text & Email Inputs ---');
  const usernameInput = await page.$('#username');
  await usernameInput.type('testuser@example.com');
  const usernameVal = await page.evaluate(el => el.value, usernameInput);
  console.log(`Username Input: val="${usernameVal}", typed=${usernameVal === 'testuser@example.com'}`);

  console.log('\n--- 7. Verifying On-Page Interaction Log ---');
  const logContent = await page.evaluate(() => {
    return document.getElementById('log') ? document.getElementById('log').innerText : '';
  });
  console.log('On-page log output:\n' + logContent);

  await browser.close();

  const allPassed = (
    stdAfter !== stdBefore &&
    nestedAfter !== nestedBefore &&
    customAfter !== customBefore &&
    switchAfter !== switchBefore &&
    radioAfter !== radioBefore &&
    usernameVal === 'testuser@example.com'
  );

  console.log(`\n=================================================`);
  console.log(`ALL INPUTS VERIFICATION: ${allPassed ? 'ALL PASSED (100%)' : 'FAILED'}`);
  console.log(`=================================================`);
  process.exit(allPassed ? 0 : 1);
}

testInputs().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
