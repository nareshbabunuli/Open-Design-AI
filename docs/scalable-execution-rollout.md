# Scalable execution rollout

This branch is the isolated staging area for replacing process-local autonomous test execution.

## Existing constraints verified in main
- `lib/ai-automation/runner.ts` starts work using `setImmediate` in the Next.js process.
- Job status and results are stored in a process-global Map and local `.jobs` files.
- `app/api/journey/start/route.ts` maintains a separate process-local journey Map.
- Browser automation uses Puppeteer and Stagehand and may be long-running.

## Target topology
Next.js API -> authenticated job submission -> persistent queue -> dedicated browser workers -> durable status/event store -> Supabase object storage for artifacts.

## Safe migration sequence
1. Introduce a typed queue contract and worker lifecycle, including leases, retries, cancellation, heartbeat, and idempotency.
2. Add persistent job metadata and project/user authorization checks; keep secrets out of persisted job payloads.
3. Move execution out of API request processes into isolated workers.
4. Migrate status, events, screenshots, recordings and reports to shared storage.
5. Add per-tenant concurrency and provider-rate limits; reject or defer excess submissions.
6. Exercise crash/restart, cross-instance status polling, duplicate delivery, cancellation and tenant isolation tests.
7. Benchmark 10/25/50/100 concurrent jobs before enabling production traffic.

## Rollout constraints
- Keep existing `main` runtime untouched until workers and integration tests are validated.
- Do not enable distributed execution solely by changing the job-start route; its dependent status and interactive control endpoints also need shared state.
- Preserve manual-approval gates and redaction for credentials and destructive actions.
- Make rollout opt-in behind an explicit feature flag, with a rollback path.

This file documents the implementation plan; it does **not** claim the worker migration is complete.
