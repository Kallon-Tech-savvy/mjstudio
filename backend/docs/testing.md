# Workflow verification

`npm test` runs the backend unit and HTTP suites without a database. `npm run build` checks the production TypeScript sources.

`npm run test:database` runs the gallery journey against migrated PostgreSQL tables. Set `TEST_DATABASE_URL` explicitly to an isolated database whose name ends in `_test`; the command refuses to use another database name and never falls back to `DATABASE_URL`.

Apply the repository migrations to that test database first. CI does this in its PostgreSQL job, then runs the journey suite as a required step. The suite creates random fixture IDs and removes only its own studios and users afterward. It does not truncate shared tables.

The database suite exercises publication, verified client sessions, selection submission and retry, proofing, delivery preparation and release, permission checks, and access replacement. Credentials are generated in memory and never logged.

Selection concurrency checks use separate PostgreSQL connections and inspect actual blocking locks. An edit overlapping submission must wait and then reject without changing either selection table. Simultaneous submissions return the same receipt, including when neither request has created a shortlist yet. Reads, edits and submissions waiting on access revocation must reject once it commits. Selection operations lock access before the shortlist so access replacement cannot move the shortlist halfway through an operation.

The photo pipeline suite additionally writes synthetic image bytes through signed HTTP upload capabilities, processes them with Sharp and the real local storage adapter, and verifies preview/thumbnail bytes, original delivery, and cleanup against PostgreSQL. Fault injection covers interrupted storage verification, processing rollback and retry, stale derivative replacement, expired worker ownership, and permanent processing failure. Fixture cleanup removes only that suite’s jobs, rows and temporary files.

These are integration tests of the local development storage adapter. They do not configure or certify a cloud storage provider, email delivery, or production deployment.

Worker crash tests cover exhausted expired leases, concurrent polling, stale lease operations, configured retry limits, and a still-executing transaction. Each poll retires at most 50 expired final attempts of its job type, skipping locked jobs. Failure and the still-processing photo state commit together; originals, deleted photos, superseded sources and already-active photos are preserved. Recovery requires worker polling to resume. Heartbeats cannot revive expired leases. This does not add a production worker deployment or an operator retry interface.

Delivery checks cover concurrent retries after release, approval changes overlapping release, deleted items, unavailable originals, and explicitly rebuilding an unreleased set. Preparation, proofing edits and release serialize on the gallery row; release validates every prepared item and its original asset. Released items reject proofing edits and repeat preparation preserves the existing release. A withdrawal/revised-delivery workflow is not implemented; photo deletion and access revocation remain available independently.

Upload race tests pause storage verification while another request confirms, processes, or deletes the photo. A delayed result must return the newer persisted status or reject a deleted photo, without overwriting success or queuing duplicate processing. Both confirmation and reconciliation recover failed originals through the existing `failed → pending → uploaded` transitions. Reconciliation ignores deleted or already verified originals; it retries temporarily unavailable originals within the existing job retry limit. This recovery job is not a storage health monitor and does not restart terminal image-processing failures.

The Vite frontend runs `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:workflow`. Its browser tests use API fixtures and include keyboard focus, route races, recovery states, and responsive layouts. Install Chromium with Playwright before running them locally. The lint configuration targets React/Vite; Next.js-only rules do not apply to this application.

Client image recovery tests simulate expired image URLs, a refreshed URL that also fails, denied/unavailable API responses, and navigation during refresh. Each mounted image attempts one automatic authenticated refresh, then waits for an explicit retry. Gallery thumbnail failures can still open the full viewer. Choices and note drafts stay outside image state. The authenticated photo detail endpoint returns a fresh thumbnail as well as a preview; the real storage integration test verifies the returned thumbnail bytes. Images are refreshed on failure, without background timers or a page reload.

## Dependency security checks

Run `npm audit --audit-level=high` in both `backend` and `mj_shoot-it`. CI runs these checks for both application packages, including development dependencies, and fails on high/critical advisories or an unavailable audit service. Investigate failures; do not apply forced upgrades without compatibility checks.

On 2026-11-10, the backend moved from Zod 3.25.76 to 4.6.7 and Vitest 2.1.9 to 4.1.12. This removes the seven package entries reported by the backend audit, including the validator and test-tool dependency chains. Both application package audits reported zero known vulnerabilities at verification time. This is a time-bound registry result, not a guarantee that the application is secure, and is not a substitute for application security review. The root package now contains only orchestration scripts and has its own audit check; installed dependency files are no longer tracked.

The migration retains the existing schemas and error envelope. HTTP regression coverage accepts 500 valid photo-order IDs and rejects empty, oversized and malformed lists before calling the service, including a 10,000-element invalid list below the JSON body limit. Existing authentication, gallery creation, environment parsing and job tests also run with the new validator. Use Node 22 as in CI; the test runner upgrade does not require a production runtime dependency on Vitest.

Migration references: https://zod.dev/v4/changelog and https://v4.vitest.dev/guide/migration.html. Validator advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5.

## Repository entry point

From the repository root, `npm run install:all` installs both locked application packages. `npm run check` runs the generated-file guard, types/lint, both builds and the unit/HTTP/browser suites; PostgreSQL integration remains explicit through `npm run test:database`. `npm run audit:all` includes the dependency-free root manifest and both applications. CI verifies the root lockfile and rejects tracked dependency, build, coverage and browser-output directories. Git history still contains previously committed files; this cleanup changes the current tree only.

The studio gallery collection now uses the existing paginated API, shows the total and current page, and offers previous/next and refresh controls. Filtering is explicitly limited to the visible page. A failed request keeps the last successful page and filter; retry requests the failed target. Successful navigation clears the filter, and an out-of-range page is clamped after galleries are removed. Superseded requests are ignored. Phone and desktop browser regressions cover browsing beyond 20 galleries, failure/retry, page-specific filtering, disabled boundaries, collection shrinkage and horizontal overflow. Client picking still loads only the first 100 clients; gallery-wide text search is not implemented.
