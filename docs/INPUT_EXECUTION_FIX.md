# Full App input execution corrections

This patch preserves the existing Puppeteer executor, discovery, screen map, review gate, and rescan loop. It changes operation execution and result checking. It does not migrate Full App Testing to Playwright or Stagehand.

## Behavior

- A click sends one browser activation. It checks that the intended target receives pointer events and does not follow a successful activation with DOM clicks or automatic repeat clicks.
- Selection handlers set a desired state. Radios select their intended option and verify native group exclusivity. Checkboxes, switches, and pressed buttons retain an already-correct state. Hidden native selection inputs use their associated visible label.
- Native selects resolve exact values or labels and verify the full selection set. Custom dropdowns use their associated option list and verify the resulting selection. Unsupported custom multiselects fail explicitly.
- Supplied selectors are authoritative. Missing or ambiguous targets fail instead of filling or selecting a different control elsewhere on the page.
- Text entry verifies the application value after blur. Native segmented values use Puppeteer's type-aware locator fill. Ordinary execution checks validity; intentional invalid-format form scenarios opt out of validity checks while still checking entered content.
- Public email fields use synthetic test data. Credential substitution in the fill handler is restricted to screens already classified as login screens.
- Tabs require both selected state and a visible associated panel. File operations verify attached file names/count; attachment is not presented as proof of server processing.
- Unexpected click effects fail. Suspected non-functional controls no longer receive a passed live action indicator.

## Browser regression suite

Install dependencies, then install the headless browser and run:

```sh
npx puppeteer browsers install chrome-headless-shell
npm run test:input-execution
npm run typecheck
```

The repository's npm lockfile was already out of sync with package.json at the reviewed base commit. If `npm ci` fails for that reason, validation can install without rewriting that lockfile:

```sh
PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts --legacy-peer-deps --package-lock=false
```

The suite loads `public/test-inputs.html` directly, adds focused custom-widget and broken-control scenarios, and executes an approved plan through the real `executeStructuredTestPlan` function on a browser-intercepted test page. No application credentials or external test server are required. It covers one-click behavior, idempotent state setting, all native radio options, hidden-label checkboxes, native single/multiple selects, a custom dropdown, text/textarea/editable HTML, numeric and date/time values, constraints, tabs, file attachment/removal/chooser behavior, rejected input, blocked controls, exact target resolution, unexpected effects, and the real Full App execution path.

Rerun only a failed category instead of the entire suite:

```sh
npx --yes tsx --test --test-name-pattern="radio" tests/input-execution.integration.test.ts
npx --yes tsx --test --test-name-pattern="actual Full App" tests/input-execution.integration.test.ts
```

## Limits

Passing this suite establishes these execution regressions on the bundled Chromium fixture. It does not establish that every custom widget on an arbitrary application works. Custom calendars, masked-value normalization, custom multiselects, drawing/reordering, and other widget-specific operations still require separate handlers/cases. Login-page classification, discovery completeness, and the existing approved-plan UI are outside this patch's scope. The full original input fixture is used for focused operations; the entire production discovery/UI workflow is not asserted to pass end to end.

## API references

- [Puppeteer locators and interactions](https://pptr.dev/guides/page-interactions)
- [Type-aware locator fill](https://pptr.dev/api/puppeteer.locator.fill)
- [Native select](https://pptr.dev/api/puppeteer.elementhandle.select)
- [File attachment](https://pptr.dev/api/puppeteer.elementhandle.uploadfile)
- [Playwright reference behavior for inputs](https://playwright.dev/docs/input)
