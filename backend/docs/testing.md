# Workflow verification

`npm test` runs the backend unit and HTTP suites without a database. `npm run build` checks the production TypeScript sources.

`npm run test:database` runs the gallery journey against migrated PostgreSQL tables. Set `TEST_DATABASE_URL` explicitly to an isolated database whose name ends in `_test`; the command refuses to use another database name and never falls back to `DATABASE_URL`.

Apply the repository migrations to that test database first. CI does this in its PostgreSQL job, then runs the journey suite as a required step. The suite creates random fixture IDs and removes only its own studios and users afterward. It does not truncate shared tables.

The database suite exercises publication, verified client sessions, selection submission and retry, proofing, delivery preparation and release, permission checks, and access replacement. Credentials are generated in memory and never logged.

The photo pipeline suite additionally writes synthetic image bytes through signed HTTP upload capabilities, processes them with Sharp and the real local storage adapter, and verifies preview/thumbnail bytes, original delivery, and cleanup against PostgreSQL. Fault injection covers interrupted storage verification, processing rollback and retry, stale derivative replacement, expired worker ownership, and permanent processing failure. Fixture cleanup removes only that suite’s jobs, rows and temporary files.

These are integration tests of the local development storage adapter. They do not configure or certify a cloud storage provider, email delivery, or production deployment.

The Vite frontend runs `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:workflow`. Its browser tests use API fixtures and include keyboard focus, route races, recovery states, and responsive layouts. Install Chromium with Playwright before running them locally. The lint configuration targets React/Vite; Next.js-only rules do not apply to this application.
