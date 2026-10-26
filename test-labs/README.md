# Test Labs

Three isolated, generic playground routes are available in the Next.js app:

- `/test-labs/test-case-123` — visual detection fixture
- `/test-labs/test-case-456` — interaction and form fixture
- `/test-labs/test-case-789` — resilience and recovery fixture

The index is at `/test-labs`.

## Purpose

These pages provide deterministic UI elements and stable `data-testid` attributes for walking through browser automation scripts. They are local fixtures only: they do not use production data, call external model APIs, or claim that OpenCV has already analysed a screenshot.

Each page includes a primary action, tabs, a form, a modal, an interaction log, and deliberate defect toggles. The controls are useful for testing screenshot capture, element visibility, DOM inspection, clicks, typing, validation, and state transitions. Use the same captured screenshots as input to the OpenCV pipeline when wiring visual analysis.

## Run

Start the application using the repository's normal development command, then open `http://localhost:3000/test-labs`.

Run browser tests with:

```bash
pnpm exec playwright test e2e/test-labs.spec.ts
```

The current Playwright configuration uses the `e2e/` directory and starts the Next.js development server. Tests use stable selectors and can be run repeatedly. Screenshot evidence and traces are controlled by `playwright.config.ts`.

## Safety

Defects are client-side visual toggles only. They do not modify application data or invoke destructive actions. The playground is not an access-control boundary and should not be used as a production test target with real customer data.
