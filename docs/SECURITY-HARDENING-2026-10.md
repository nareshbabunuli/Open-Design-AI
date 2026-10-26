# Open Design AI — Security hardening notes

Date: 2026-10-26
Scope: static review of selected repository configuration and Supabase storage policy files. This is not a penetration test or a certification.

## Changes in this branch

- Restrict localhost simulator / Expo rewrites to development mode. Production and preview builds return no loopback rewrites.
- Remove Next.js `typescript.ignoreBuildErrors` so production builds no longer intentionally bypass TypeScript errors.
- Replace permissive anonymous storage writes with authenticated writes and owner-only update/delete policies for the `designs` bucket.
- Add a timestamped migration to reapply the storage policy hardening to databases where earlier migrations have already run.
- Update the legacy storage migration and the setup script fallback to use the same least-privilege policies.
- Remove process-wide TLS verification disabling and require PostgreSQL certificate verification in setup scripts.
- Keep Chromium web security enabled and prevent the localhost-target bypass from being enabled via an environment variable in production.
- Add a `typecheck` package script and GitHub Actions workflow for production dependency auditing and TypeScript checks.
- Add baseline HTTP security headers (content-type sniffing protection, referrer policy, same-origin framing policy, restricted browser permissions, and production HSTS).
- Enable Dependabot security-update pull requests for production and development dependencies.
- Make Supabase client factories build-safe: during the Next.js production-build phase (or when CI intentionally omits secrets) inert placeholders are used so `pnpm build` can complete. Runtime still requires real `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` values.
- CI `remediate-dependencies` workflow supplies placeholder Supabase environment variables for the production-build step.
- Fix the build-breaking reference to the nonexistent `picked.fileType` property.

## Important deployment notes

1. Review the intended sharing model before applying. The `designs` bucket remains publicly readable; anyone with an object URL may be able to read it. Use a private bucket and signed URLs if designs are confidential.
2. Storage uploads must be authenticated. Existing anonymous upload flows will stop working and must be migrated to authenticated sessions.
3. Owner-only object mutations may affect team workflows where one project member needs to edit another member's upload. If collaboration is required, implement explicit project-membership policies rather than restoring broad access.
4. Apply `supabase/migrations/20261026000000_harden_designs_storage_policies.sql` to the production Supabase database using the approved migration process. Repository changes do not alter a live database automatically.
5. PostgreSQL connections now verify certificates. If your provider uses a private CA, configure that CA rather than disabling verification.
6. Confirm the framing policy (`X-Frame-Options: SAMEORIGIN`) does not break intentional external embeds or public sharing flows. Review HSTS for all affected subdomains.
7. Run the new CI checks and resolve any dependency or TypeScript failures before merging.

## Dependency audit findings

The last recorded production dependency audit reported 103 advisories: 4 critical, 39 high, 48 moderate, and 12 low. This remains a release blocker until the dependency tree is remediated or remaining advisories are explicitly assessed and appropriately mitigated.

The critical findings included:
- `next` versions in the reported ranges; the audit identified patched versions at or above 16.4.1 for two unauthenticated RCE advisories and at or above 16.3.6 for a separate `next/og` RCE advisory. Confirm the installed version and lockfile resolution in CI.
- `proxy-addr` versions 1.1.0 through below 2.0.8; update the introducing dependency or override to a compatible patched version, then test proxy behavior.

Do not hand-edit lockfile integrity hashes. Regenerate `pnpm-lock.yaml` with the pinned pnpm version and review the resulting dependency diff. A prior CI/Vercel run failed frozen install because `package.json` overrides and `pnpm-lock.yaml` were out of sync; the lockfile check must be rerun.

## Remaining audit work

This static change set does not prove that every API route or server action performs authorization. Before production use, review all `app/api/**/route.ts` handlers and server actions for authentication, project-level authorization, input validation, rate limits, safe outbound URL restrictions, and secret handling. Test cross-account access using separate user accounts.

Also verify OAuth callback state validation and token encryption, browser automation target URL allowlists and network egress restrictions, download/report sharing permissions, secret scanning, Supabase table RLS policies beyond Storage, and production security headers. Review dynamic filesystem tracing warnings and restrict filesystem access to a controlled workspace before relying on cloud execution.

## Validation status

- TypeScript check: a previous run passed after correcting the `picked.fileType` reference; rerun against the updated branch.
- Production build: previously failed because `@supabase/ssr` requires URL + key at client-creation time. Build-phase placeholders and CI placeholder env vars were added; rerun to confirm.
- Dependency audit: previous run failed with 103 advisories. A clean post-lockfile-regeneration run is required.
- Storage migration: **not** applied to the live Supabase project.
- No live penetration test, production database query, or complete application test suite was run.

Do not merge or deploy until the lockfile is synchronized, required CI checks pass, remaining dependency advisories are remediated or assessed, and the storage migration and sharing model have been reviewed.
