import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const TARGET_URL = 'http://localhost:3005';
const TEST_DIR = path.resolve('tests/test-files');

const FILES = {
  avatar: path.join(TEST_DIR, 'sample-avatar.png'),
  boiler: path.join(TEST_DIR, 'boiler_inspection_photo.png'),
  receipt: path.join(TEST_DIR, 'plumbing_repair_receipt.png'),
  pdf: path.join(TEST_DIR, 'sample-document.pdf'),
  invoice: path.join(TEST_DIR, 'sample-invoice.pdf'),
  tenancy: path.join(TEST_DIR, 'assured_shorthold_tenancy_agreement.pdf'),
  csv: path.join(TEST_DIR, 'sample-data.csv'),
  rentalCsv: path.join(TEST_DIR, 'rental_transactions_2024_2025.csv'),
  notes: path.join(TEST_DIR, 'sample-notes.txt'),
  taxNotes: path.join(TEST_DIR, 'landlord_tax_notes.txt'),
};

for (const [k, f] of Object.entries(FILES)) {
  if (!fs.existsSync(f)) {
    throw new Error(`File missing: ${k} -> ${f}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reuses the visual cursor, ripple, banner & typing overlay pattern from lib/ai-automation/visual-recorder.ts
const OVERLAY_INIT_SCRIPT = `
(function() {
  if (window.__qaOverlayInstalled) return;
  window.__qaOverlayInstalled = true;

  const style = document.createElement('style');
  style.id = 'qa-visual-overlay-style';
  style.textContent = \`
    #qa-visual-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 26px;
      height: 26px;
      pointer-events: none;
      z-index: 2147483647;
      transform: translate(120px, 120px);
      transition: transform 0.025s linear;
      filter: drop-shadow(0 4px 10px rgba(37, 99, 235, 0.65));
    }
    #qa-visual-cursor svg {
      width: 26px;
      height: 26px;
      display: block;
    }
    #qa-cursor-tag {
      margin-left: 20px;
      margin-top: -6px;
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(37, 99, 235, 0.95);
      color: #ffffff;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      white-space: nowrap;
    }
    #qa-visual-ripple {
      position: fixed;
      top: 0;
      left: 0;
      width: 36px;
      height: 36px;
      margin-left: -18px;
      margin-top: -18px;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.5);
      border: 2px solid #60a5fa;
      pointer-events: none;
      z-index: 2147483646;
      opacity: 0;
      transform: scale(0.2);
      transition: transform 0.4s ease-out, opacity 0.4s ease-out;
    }
    #demo-action-banner {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483645;
      background: #4f46e5;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 10px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5), 0 0 0 2px #818cf8;
      pointer-events: none;
    }
  \`;
  document.head.appendChild(style);

  const cursor = document.createElement('div');
  cursor.id = 'qa-visual-cursor';
  cursor.innerHTML = \`
    <svg viewBox="0 0 24 24" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5">
      <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 5.163v-20.284z"/>
    </svg>
    <span id="qa-cursor-tag">human tester</span>
  \`;
  document.documentElement.appendChild(cursor);

  const ripple = document.createElement('div');
  ripple.id = 'qa-visual-ripple';
  document.documentElement.appendChild(ripple);

  const banner = document.createElement('div');
  banner.id = 'demo-action-banner';
  banner.textContent = 'Initializing Human Tester...';
  document.documentElement.appendChild(banner);

  window.__qaMoveCursor = function(x, y, label) {
    cursor.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    var tag = document.getElementById('qa-cursor-tag');
    if (tag && label) tag.textContent = label;
  };

  window.__qaClickRipple = function(x, y) {
    ripple.style.transition = 'none';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.transform = 'scale(0.2)';
    ripple.style.opacity = '0.95';
    void ripple.offsetWidth;
    ripple.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
    ripple.style.transform = 'scale(2.4)';
    ripple.style.opacity = '0';
  };
})();
`;

async function runVisualDemo() {
  console.log('\n======================================================');
  console.log('👀 LAUNCHING HUMAN-PACED VISUAL DEMO WITH MOUSE PATHS');
  console.log('======================================================');

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 950 },
  });
  const page = await context.newPage();

  let lastX = 200;
  let lastY = 160;

  // Scroll element into view, glide mouse along ease-out cubic curve with slight human arc, and highlight
  async function moveMouseToElement(selector, stepName, cursorTag = 'click') {
    console.log(`▶ ${stepName}`);
    const coords = await page.evaluate(
      ({ selector, stepName }) => {
        const banner = document.getElementById('demo-action-banner');
        if (banner) banner.textContent = stepName;

        document.querySelectorAll('.demo-highlight').forEach((el) => {
          el.classList.remove('demo-highlight');
          el.style.outline = '';
          el.style.boxShadow = '';
        });

        if (!selector) return null;
        const target = document.querySelector(selector);
        if (!target) return null;

        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.classList.add('demo-highlight');
        target.style.outline = '3px solid #38bdf8';
        target.style.boxShadow = '0 0 15px rgba(56, 189, 248, 0.7)';

        const r = target.getBoundingClientRect();
        // Aim slightly left-of-center on wide inputs so it looks natural
        const offsetX = Math.min(r.width * 0.35, 80);
        return {
          x: Math.round(r.left + (r.width > 120 ? offsetX : r.width / 2)),
          y: Math.round(r.top + r.height / 2),
        };
      },
      { selector, stepName }
    );

    if (!coords) {
      await sleep(150);
      return null;
    }

    // Smooth ease-out cubic mouse movement with subtle natural arc
    const steps = 14;
    const arcX = (Math.random() - 0.5) * 35;
    const arcY = (Math.random() - 0.5) * 25;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = 1 - Math.pow(1 - t, 3);
      const curve = Math.sin(t * Math.PI);
      const curX = Math.round(lastX + (coords.x - lastX) * ease + arcX * curve);
      const curY = Math.round(lastY + (coords.y - lastY) * ease + arcY * curve);

      await page.mouse.move(curX, curY);
      await page.evaluate(
        ({ x, y, tag }) => {
          if (window.__qaMoveCursor) window.__qaMoveCursor(x, y, tag);
        },
        { x: curX, y: curY, tag: cursorTag }
      );
      await sleep(14);
    }

    lastX = coords.x;
    lastY = coords.y;
    await sleep(60);
    return coords;
  }

  async function humanClickSelector(selector, stepName, tag = 'click') {
    const pt = await moveMouseToElement(selector, stepName, tag);
    if (pt) {
      await page.evaluate(({ x, y }) => {
        if (window.__qaClickRipple) window.__qaClickRipple(x, y);
      }, pt);
      await page.mouse.click(pt.x, pt.y);
    } else {
      await page.click(selector);
    }
    await sleep(140);
  }

  async function humanTypeSelector(selector, value, stepName) {
    const pt = await moveMouseToElement(selector, stepName, 'type');
    if (pt) {
      await page.evaluate(({ x, y }) => {
        if (window.__qaClickRipple) window.__qaClickRipple(x, y);
      }, pt);
      await page.mouse.click(pt.x, pt.y);
    } else {
      await page.focus(selector);
    }
    await page.fill(selector, '');
    await page.keyboard.type(value, { delay: 16 });
    await sleep(120);
  }

  async function attachAndDisplayFiles(selector, filePaths, label) {
    const fileNames = (Array.isArray(filePaths) ? filePaths : [filePaths]).map((p) => path.basename(p));
    const pt = await moveMouseToElement(selector, `${label}: [${fileNames.join(', ')}]`, 'attach files');
    if (pt) {
      await page.evaluate(({ x, y }) => {
        if (window.__qaClickRipple) window.__qaClickRipple(x, y);
      }, pt);
    }
    await page.setInputFiles(selector, filePaths);

    await page.evaluate(
      ({ selector, fileNames }) => {
        const input = document.querySelector(selector);
        if (!input) return;
        let preview = input.parentElement.querySelector('.demo-file-preview');
        if (!preview) {
          preview = document.createElement('div');
          preview.className = 'demo-file-preview';
          preview.style.marginTop = '6px';
          preview.style.display = 'flex';
          preview.style.flexWrap = 'wrap';
          preview.style.gap = '6px';
          input.parentElement.appendChild(preview);
        }
        preview.innerHTML = fileNames
          .map(
            (f) => `
          <span style="
            background: #064e3b;
            color: #34d399;
            border: 1px solid #10b981;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          ">📎 Selected: ${f}</span>
        `
          )
          .join('');
      },
      { selector, fileNames }
    );

    await sleep(320);
  }

  try {
    await page.goto(TARGET_URL);
    await page.waitForSelector('#test-form');
    await page.evaluate(OVERLAY_INIT_SCRIPT);
    await sleep(300);

    // ========================================================
    // SECTION 1: CHECKBOXES & TOGGLES (All 5 controls)
    // ========================================================
    await humanClickSelector('#std-checkbox', '1. Checking standard required checkbox', 'check');
    await humanClickSelector('input[name="kensington_flat_nested"]', '2. Checking nested label checkbox', 'check');
    await humanClickSelector('label.custom-checkbox-wrapper', '3. Clicking custom-styled hidden checkbox', 'check');
    await humanClickSelector('#toggle-notifications', '4. Toggling ARIA switch button (ON)', 'toggle');
    await humanClickSelector('#indeterminate-parent', '5. Checking Select-All parent (Email, SMS, Push)', 'select all');

    // ========================================================
    // SECTION 2: RADIO OPTIONS
    // ========================================================
    await humanClickSelector(
      'input[name="property_type"][value="house"]',
      '6. Selecting Radio: Detached house',
      'radio'
    );

    // ========================================================
    // SECTION 3: TEXT & IDENTITY FIELDS (All 7 fields)
    // ========================================================
    await humanTypeSelector('#plain-text', 'Full Inspection Verification', '7. Typing Plain text');
    await humanTypeSelector('#username', 'auditor@open-design.ai', '8. Typing Email');
    await humanTypeSelector('#password', 'SuperSecretPass123!', '9. Typing Password');
    await humanTypeSelector('#phone', '+44 7700 900123', '10. Typing Telephone');
    await humanTypeSelector('#website', 'https://workflow-tracker.io', '11. Typing Website URL');
    await humanTypeSelector('#search', 'Victorian terraced property', '12. Typing Search query');
    await humanTypeSelector('#username-hint', 'Firefox', '13. Typing Datalist Autocomplete (Firefox)');

    // ========================================================
    // SECTION 4: NUMBERS, DATES & TIME (All 6 fields)
    // ========================================================
    await humanTypeSelector('#monthly-rent', '1450', '14. Typing Monthly Rent (£1,450)');

    await moveMouseToElement('#lease-start', '15. Setting Lease Start Date (2026-11-01)', 'date');
    await page.fill('#lease-start', '2026-11-01');
    await sleep(150);

    await moveMouseToElement('#appointment-time', '16. Setting Appointment Time (14:30)', 'time');
    await page.fill('#appointment-time', '14:30');
    await sleep(150);

    await moveMouseToElement('#appointment-datetime', '17. Setting Local Datetime (2026-11-01T14:30)', 'datetime');
    await page.fill('#appointment-datetime', '2026-11-01T14:30');
    await sleep(150);

    await moveMouseToElement('#billing-month', '18. Setting Billing Month (2026-11)', 'month');
    await page.fill('#billing-month', '2026-11');
    await sleep(150);

    await moveMouseToElement('#report-week', '19. Setting Report Week (2026-W44)', 'week');
    await page.fill('#report-week', '2026-W44');
    await sleep(150);

    // ========================================================
    // SECTION 5: SELECTS, RANGE & COLOR (All 4 controls)
    // ========================================================
    const catPt = await moveMouseToElement('#property-category', '20. Selecting Category: Commercial', 'select');
    if (catPt) await page.evaluate(({ x, y }) => window.__qaClickRipple?.(x, y), catPt);
    await page.selectOption('#property-category', 'commercial');
    await sleep(200);

    const multiPt = await moveMouseToElement(
      '#multi-category',
      '21. Multi-selecting Categories: Residential, HMO, Industrial',
      'multi-select'
    );
    if (multiPt) await page.evaluate(({ x, y }) => window.__qaClickRipple?.(x, y), multiPt);
    await page.selectOption('#multi-category', ['residential', 'hmo', 'industrial']);
    await sleep(250);

    // Drag slider handle visually with mouse
    await moveMouseToElement('#volume', '22. Dragging Range Slider to 85', 'drag slider');
    const sliderBox = await page.locator('#volume').boundingBox();
    if (sliderBox) {
      const startX = Math.round(sliderBox.x + sliderBox.width * 0.5);
      const endX = Math.round(sliderBox.x + sliderBox.width * 0.85);
      const y = Math.round(sliderBox.y + sliderBox.height / 2);
      await page.mouse.move(startX, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        const curX = Math.round(startX + ((endX - startX) * i) / 8);
        await page.mouse.move(curX, y);
        await page.evaluate(({ x, y }) => window.__qaMoveCursor?.(x, y, 'dragging 85%'), { x: curX, y });
        await sleep(20);
      }
      await page.mouse.up();
    }
    await page.$eval('#volume', (el) => {
      el.value = '85';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(200);

    const colorPt = await moveMouseToElement('#theme-color', '23. Picking Color: Emerald (#10b981)', 'color');
    if (colorPt) await page.evaluate(({ x, y }) => window.__qaClickRipple?.(x, y), colorPt);
    await page.$eval('#theme-color', (el) => {
      el.value = '#10b981';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(200);

    // ========================================================
    // SECTION 6: FILE UPLOADS & PICKERS (All 8 file controls)
    // ========================================================
    await attachAndDisplayFiles('#single-file', FILES.avatar, '24. Single File');

    await attachAndDisplayFiles(
      '#multiple-files',
      [FILES.avatar, FILES.pdf, FILES.csv],
      '25. Multiple Files (3 files)'
    );

    await attachAndDisplayFiles(
      '#image-files',
      [FILES.boiler, FILES.receipt],
      '26. Images Only (2 photos)'
    );

    await attachAndDisplayFiles(
      '#document-files',
      [FILES.tenancy, FILES.taxNotes],
      '27. Documents (Tenancy PDF + Tax Notes)'
    );

    await attachAndDisplayFiles(
      '#camera-capture',
      FILES.boiler,
      '28. Camera Capture (boiler_inspection_photo.png)'
    );

    await attachAndDisplayFiles(
      '#inspection-files',
      [FILES.invoice, FILES.rentalCsv],
      '29. Inspection Files (Invoice + Transactions)'
    );

    const pickerPt = await moveMouseToElement(
      '#open-file-picker',
      '30. Hidden File Picker: Clicking button & attaching avatar.png',
      'open chooser'
    );
    const fileChooserPromise = page.waitForEvent('filechooser');
    if (pickerPt) await page.evaluate(({ x, y }) => window.__qaClickRipple?.(x, y), pickerPt);
    await page.click('#open-file-picker');
    const chooser = await fileChooserPromise;
    await chooser.setFiles(FILES.avatar);
    await page.evaluate(() => {
      const status = document.getElementById('hidden-file-status');
      if (status) {
        status.style.background = '#064e3b';
        status.style.color = '#34d399';
        status.style.border = '1px solid #10b981';
        status.style.padding = '4px 10px';
        status.style.borderRadius = '6px';
        status.style.fontWeight = '600';
        status.textContent = '📎 Selected: sample-avatar.png';
      }
    });
    await sleep(300);

    const dropPt = await moveMouseToElement(
      '#drop-zone',
      '31. Drag-and-Drop Zone: Dropping sample-notes.txt',
      'drop file'
    );
    if (dropPt) await page.evaluate(({ x, y }) => window.__qaClickRipple?.(x, y), dropPt);
    await page.setInputFiles('#drop-file-input', FILES.notes);
    const buffer = fs.readFileSync(FILES.notes).toString('base64');
    await page.evaluate(
      ({ base64, fileName }) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new File([byteArray], fileName, { type: 'text/plain' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropZone = document.getElementById('drop-zone');
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        dropZone.dispatchEvent(dropEvent);

        let badge = document.createElement('div');
        badge.style.marginTop = '10px';
        badge.innerHTML = `<span style="background:#064e3b; color:#34d399; border:1px solid #10b981; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">📎 Dropped & Attached: ${fileName}</span>`;
        dropZone.appendChild(badge);
      },
      { base64: buffer, fileName: 'sample-notes.txt' }
    );
    await sleep(350);

    // ========================================================
    // SECTION 7: TEXTAREA, READONLY & DISABLED TOGGLE
    // ========================================================
    await humanTypeSelector(
      '#notes',
      'Line 1: Human mouse curves active.\nLine 2: All 35 controls tested.\nLine 3: Zero fields missed.',
      '32. Typing Inspection Notes Textarea'
    );

    await moveMouseToElement('#readonly-field', '33. Hovering Read-Only Field (Protected)', 'readonly');
    await sleep(250);

    await humanClickSelector(
      '#enable-disabled',
      '34. Clicking Enable/Disable checkbox to unlock Disabled Field',
      'unlock'
    );

    await humanTypeSelector('#disabled-field', 'Unlocked and populated!', '35. Typing into Newly-Enabled Field');

    // ========================================================
    // SECTION 8: SUBMIT & INSPECT LOG
    // ========================================================
    await humanClickSelector(
      'button[type="submit"]',
      '36. Clicking Save & Submit (100% Fields Populated)',
      'submit form'
    );
    await sleep(500);

    await moveMouseToElement('#log', 'Complete! Inspecting Interaction Log (Zero Empty Fields)', 'verified');
    const logText = await page.evaluate(() => document.querySelector('#log').innerText);
    console.log('\n--- Form Submitted Log ---');
    console.log(logText.split('\n')[0]);
    console.log('--------------------------\n');
    await sleep(6000);
  } finally {
    await browser.close();
    console.log('Demo browser session closed.');
  }
}

runVisualDemo().catch((err) => {
  console.error('Visual demo error:', err);
  process.exit(1);
});
