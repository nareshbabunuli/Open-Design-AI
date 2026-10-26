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
- Add a `typecheck` package script and GitHub Actions workflow for production dependency auditing and TypeScript checks.

## Important deployment notes

1. Review the intended sharing model before applying. The `designs` bucket remains publicly readable; anyone with an object URL may be able to read it. Use a private bucket and signed URLs if designs are confidential.
2. Storage uploads must be authenticated. Existing anonymous upload flows will stop working and must be migrated to authenticated sessions.
3. Owner-only object mutations may affect team workflows where one project member needs to edit another member's upload. If collaboration is required, implement explicit project-membership policies rather than restoring broad access.
4. Apply `supabase/migrations/20261026000000_harden_designs_storage_policies.sql` to the production Supabase database using the approved migration process. Repository changes do not alter a live database automatically.
5. PostgreSQL connections now verify certificates. If your provider uses a private CA, configure that CA rather than disabling verification.
6. Run the new CI checks and resolve any dependency or TypeScript failures before merging.

## Remaining audit work

This static change set does not prove that every API route or server action performs authorization. Before production use, review all `app/api/**/route.ts` handlers and server actions for authentication, project-level authorization, input validation, rate limits, safe outbound URL restrictions, and secret handling. Test cross-account access using separate user accounts.

Also verify OAuth callback state validation and token encryption, browser automation target URL allowlists and network egress restrictions, download/report sharing permissions, secret scanning, Supabase table RLS policies beyond Storage, and production security headers.

## Validation status

No live penetration test, production database query, dependency audit, or complete application test suite was run by this change. CI is added to make dependency and TypeScript checks repeatable.
