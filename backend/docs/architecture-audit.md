# Architecture Audit

## 1. Current stack

### EXISTING
- TypeScript
- Node.js
- Express
- PostgreSQL client via `pg`
- Zod validation
- Vitest for tests
- dotenv for environment loading
- Pino for logging
- custom app bootstrap with middleware and request IDs

### REQUIRED
- Preserve the TypeScript + Node.js + Express foundation
- Keep backend responsibilities separate from the frontend app
- Continue to prefer explicit typed domain boundaries over framework-driven code

### RECOMMENDED
- Keep the current backend in a dedicated `backend/` folder while the Next.js app remains in `mj_shoot-it/`
- Continue using Express routes, services, and middleware in a modular structure

## 2. Current application structure

### EXISTING
- `backend/src/app.ts`
- `backend/src/server.ts`
- `backend/src/routes/auth.ts`
- `backend/src/routes/studio.ts`
- `backend/src/middleware/authentication.ts`
- `backend/src/services/studio-service.ts`
- `backend/src/db/client.ts`
- `backend/src/db/migrate.ts`
- `backend/src/db/seed.ts`
- `backend/tests/*.test.ts`

### REQUIRED
- Keep route code thin
- Keep auth context resolution server-side
- Keep service logic separated from HTTP framework concerns
- Keep persistence behind repository and DB abstractions

### RECOMMENDED
- Introduce a more explicit `application/`, `domain/`, `infrastructure/`, and `interfaces/` boundary as implementation grows

## 3. Existing infrastructure

### EXISTING
- `.env.example` contains environment keys
- `src/config/env.ts` loads env values
- `src/logging/logger.ts` provides structured logging
- `src/middleware/error-handler.ts` standardizes API errors
- `src/utils/response.ts` provides API envelopes

### REQUIRED
- Preserve configuration validation
- Keep secrets out of source and logs

### RECOMMENDED
- Add a stronger environment schema for DB, storage, session, and rate limiting config as the app expands

## 4. Existing database layer

### EXISTING
- PostgreSQL client is initialized in `src/db/client.ts`
- Migration script exists in `src/db/migrate.ts`
- A minimal seed script exists in `src/db/seed.ts`

### REQUIRED
- Continue to use a modern Postgres-backed approach
- Keep migration logic versioned and reviewable
- Preserve the database as the source of structural truth

### RECOMMENDED
- Add a full schema migration sequence for the required tables and constraints before deeper business features

## 5. Existing authentication

### EXISTING
- A development auth context exists in `src/auth/context.ts`
- Middleware enforces bearer token presence for protected routes
- `/api/auth/login`, `/api/auth/me`, and `/api/studio` are active

### REQUIRED
- Preserve the separation between authentication and authorization
- Do not trust browser-supplied role or permission values
- Keep auth resolution server-side

### RECOMMENDED
- Replace the development-only auth placeholder with a real session or token implementation when moving to concrete production auth

## 6. Existing storage

### EXISTING
- No real storage adapter exists yet

### REQUIRED
- Introduce a provider-independent storage abstraction before production use

### RECOMMENDED
- Keep storage integration behind a `StorageService`-like interface and avoid direct bucket logic in controllers or services

## 7. Existing API layer

### EXISTING
- Health route exists
- Auth routes exist
- Studio route exists

### REQUIRED
- Keep routing thin and validation-driven
- Apply auth and authorization outside generic route logic

### RECOMMENDED
- Introduce route groups for photographers vs clients as the domain grows

## 8. Existing tests

### EXISTING
- Basic auth validation tests
- integration tests for health and auth/studio access

### REQUIRED
- Keep tests verifying request behavior and auth boundaries
- Add architecture-level tests for typing and policy boundaries as needed

### RECOMMENDED
- Continue adding small, focused tests around security-sensitive behavior rather than large UI suites

## 9. Architectural problems discovered

### EXISTING
- The project has a backend foundation but not yet the full domain layer described in the product architecture
- Authentication is currently a development placeholder and not production-grade
- Database schema is not yet implemented at full domain depth
- Storage abstraction is missing
- Repository interfaces are not yet formalized
- Domain types and authorization policies are not fully segregated yet

### REQUIRED
- Fix the architecture gaps before expanding into HTTP-heavy endpoints

### RECOMMENDED
- Keep this phase focused on contracts and boundaries, not feature implementation

## 10. Recommended changes

### REQUIRED
- Define explicit domain types for `StudioRole`, `GalleryPermission`, `GalleryWorkflowStatus`, `GalleryPublicationStatus`, `PhotoStatus`, and `Selection`
- Define trusted contexts for `PhotographerContext` and `ClientContext`
- Define core entities and application errors
- Introduce repository contracts and transaction abstraction
- Introduce storage abstraction and services contracts
- Add architecture-oriented tests for contract boundaries and typed domain behavior

### RECOMMENDED
- Shift route definitions to a more structured `interfaces/http` layout later, but do not force it prematurely

## 11. Files that will be created

- `backend/src/application/...`
- `backend/src/domain/...`
- `backend/src/infrastructure/...`
- `backend/src/interfaces/...`
- `backend/src/shared/...`
- architecture and contract definition files for types/errors/repositories/storage/transactions
- additional small tests for boundary validation

## 12. Files that will be modified

- `backend/src/app.ts` (continue to register routes in a controlled way)
- `backend/src/routes/auth.ts` and `backend/src/routes/studio.ts` (only as needed to maintain thin route behavior)
- `backend/src/config/env.ts` (if stricter env rules are needed)
- `backend/tests/*.test.ts` (for architecture-focused tests)

## 13. Files that must not be touched

- `mj_shoot-it/` frontend app visuals and UI files
- existing Next.js workspace unless required for backend integration documentation
- security-critical real auth and session logic should not be relaxed for convenience

## Final assessment

The repository is not yet at the full domain architecture required by the product, but it does have a valid starting point: a TypeScript backend, explicit app bootstrap, environment config, request/error handling, and a protected auth foundation. The correct next move is to formalize the domain contracts and infrastructure boundaries before expanding into the database schema and business services.
