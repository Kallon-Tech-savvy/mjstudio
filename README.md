# MJ Studio

MJ Studio helps photographers prepare private galleries, collect client selections and notes, and release approved photographs for delivery. Clients can review on a phone or desktop, with server-enforced access and download permissions.

## Local setup

Use Node.js 22 and npm. The repository contains two independently locked application packages: `backend` (Express, PostgreSQL and Sharp) and `mj_shoot-it` (React and Vite). The root package only provides convenience commands; it has no runtime dependencies. There is no root application server.

From the repository root:

```sh
npm ci
npm run install:all
```

Create `backend/.env` with your development `DATABASE_URL`, `NODE_ENV=development`, `APP_BASE_URL=http://localhost:3001`, `FRONTEND_ORIGINS=http://localhost:3000`, and a private, randomly generated `SESSION_SECRET` of at least 32 characters. Do not commit credentials. Use a separate development database and apply its migrations with `npm run migrate --prefix backend`. See [development fixtures](backend/docs/development-seeding.md) before seeding; seeding is not production account setup.

Start the API and frontend in separate terminals:

```sh
npm run dev:backend
```

```sh
npm run dev:frontend
```

Open http://localhost:3000. The frontend defaults to http://localhost:3001/api; override it through `VITE_API_BASE_URL` in local frontend configuration when needed. Development mode uses local photo storage and in-process workers. Production storage, delivery providers and worker operations still require configuration and verification.

## Verification

Install the browser once from `mj_shoot-it` with `npx playwright install chromium` (Linux CI uses `--with-deps`). Then run these commands from the repository root:

| Command | Checks |
| --- | --- |
| `npm run check` | Repository hygiene, backend types, frontend lint/types, both builds, backend and browser tests |
| `npm test` | Backend unit/HTTP tests and frontend browser workflows |
| `npm run test:database` | PostgreSQL integration tests; requires explicit isolated test database |
| `npm run migrate:check --prefix backend` | Read-only check that the target database has all expected migrations |
| `npm run audit:all` | All three package manifests, including development dependencies; fails on high/critical advisories |

The database suite is intentionally separate: set `TEST_DATABASE_URL` to a migrated database whose name ends in `_test`. It never falls back to `DATABASE_URL`. See [workflow verification](backend/docs/testing.md) for database setup, coverage and test limitations.

Commit source files and lockfiles. Install dependencies with `npm ci`; do not commit `node_modules`, build output, browser reports, local photo storage or credentials. The repository check runs in CI to prevent generated dependency/output files from returning. Removing tracked dependencies affects the current tree; it does not erase Git history.

## Project guidance

- [Agent and contributor principles](AGENTS.md)
- [Backend API](backend/docs/api.md)
- [Security review](backend/docs/security-review.md)
- [Frontend setup](mj_shoot-it/README.md)

Automated checks cover synthetic image storage and API fixtures; they do not replace a real-client usability pilot or production infrastructure verification.
