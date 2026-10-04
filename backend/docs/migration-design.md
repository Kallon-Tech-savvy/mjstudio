# Database migration design

## Existing schema

The backend already includes the core domain model for a private client-gallery application:

- users
- studios
- studio_members
- clients
- galleries
- gallery_members
- photos
- photo_assets
- gallery_access
- client_sessions
- photo_selections
- photo_downloads
- gallery_feedback
- photo_feedback
- recommendations

This foundation is intentionally narrow and server-side only. The browser is never treated as a trust boundary.

## Migration design

The migration strategy is to treat the database as the source of truth for the studio-gallery domain and to enforce invariants at the schema layer before exposing behavior through HTTP routes or application services.

## Tables

### users
- Stores the canonical account record for studio members and authenticated principals.
- `email` is unique and required.
- `password_hash` and `auth_provider` are mutually constrained so external auth and local credential auth remain explicit.

### studios
- Represents a private studio entity that owns gallery records and client records.
- Name is required and non-empty.

### studio_members
- Connects a user to a studio and records role membership.
- Role is constrained to a narrow enum: `owner`, `admin`, `photographer`, `assistant`.

### clients
- Represents a client associated with a specific studio.
- Name is required; optional contact details must be non-empty when provided.

### galleries
- Represents a client-facing gallery with workflow and publication states.
- Workflow status is restricted to `draft`, `reviewing`, `completed`.
- Publication status is restricted to `unpublished`, `published`, `revoked`.
- Published galleries require a `published_at` timestamp.

### gallery_members
- Defines gallery-level collaborators and uploaders.
- Each user can appear once per gallery.
- A gallery can only have one `owner` role entry at a time.

### photos
- Stores a gallery image record.
- Position is non-negative and the record may be soft-deleted with `deleted_at`.

### photo_assets
- Stores storage metadata for original, preview, and thumbnail versions.
- Each asset type is unique per photo and state.
- Valid file metadata is enforced with a non-negative size and non-empty storage keys.

### gallery_access
- Stores access credentials for a gallery.
- Secret token and PIN hashes are required before access is valid.
- One active access record per gallery is enforced with a partial unique index.

### client_sessions
- Tracks signed-in client sessions for a gallery access record.
- Expiration and revocation timestamps must be coherent.

### photo_selections
- Stores a client’s selection for a photo under a gallery access token.
- Selection is constrained to `neutral`, `favourite`, `not_for_me`.

### photo_downloads
- Records successful or logged downloads from a client session.

### gallery_feedback
- Stores feedback text tied to a gallery access record.

### photo_feedback
- Stores per-photo comment text tied to a gallery access record.

### recommendations
- Stores a list of recommended photos for a gallery.
- Prevents duplicate photo recommendations within a single gallery.

## Foreign keys

Every table that depends on another record enforces FK integrity:

- `studio_members.studio_id` -> `studios.id`
- `clients.studio_id` -> `studios.id`
- `galleries.studio_id` -> `studios.id`
- `galleries.client_id` -> `clients.id`
- `gallery_members.gallery_id` -> `galleries.id`
- `gallery_members.user_id` -> `users.id`
- `photos.gallery_id` -> `galleries.id`
- `photo_assets.photo_id` -> `photos.id`
- `gallery_access.gallery_id` -> `galleries.id`
- `client_sessions.gallery_access_id` -> `gallery_access.id`
- `photo_selections.gallery_access_id` -> `gallery_access.id`
- `photo_selections.photo_id` -> `photos.id`
- `photo_downloads.gallery_access_id` -> `gallery_access.id`
- `photo_downloads.client_session_id` -> `client_sessions.id`
- `photo_downloads.photo_id` -> `photos.id`
- `gallery_feedback.gallery_access_id` -> `gallery_access.id`
- `photo_feedback.gallery_access_id` -> `gallery_access.id`
- `photo_feedback.photo_id` -> `photos.id`
- `recommendations.gallery_id` -> `galleries.id`
- `recommendations.photo_id` -> `photos.id`

All foreign keys use `ON DELETE CASCADE` for the core ownership chain so studio cleanup remains predictable and consistent.

## Unique constraints

The schema uses uniqueness to preserve domain invariants:

- `users.email` must be unique
- `studio_members(studio_id, user_id)` must be unique
- `gallery_members(gallery_id, user_id)` must be unique
- `gallery_members(gallery_id, role)` is constrained by a deferred unique rule to keep ownership logic predictable
- `photo_assets(photo_id, type, state)` must be unique
- `photo_selections(gallery_access_id, photo_id)` must be unique
- `recommendations(gallery_id, photo_id)` must be unique
- `gallery_access` enforces a single active access row per gallery with a partial unique index

## Check constraints

The schema uses check constraints to ensure state validity:

- email and name payloads are non-empty
- password or auth provider is always set for account records
- gallery workflow and publication states are restricted to the allowed enums
- publication rules prevent a gallery from being published without a valid timestamp
- photo positions cannot be negative
- storage metadata and content types must be coherent
- session and access expiry timestamps must be logically ordered

## Indexes

The critical indexes are designed to accelerate access path patterns used by studio/private-gallery operations:

- users by email
- studio membership by studio and user
- clients by studio
- galleries by studio and client
- gallery membership by gallery and user
- photos by gallery
- photo assets by photo
- gallery access by gallery
- client sessions by gallery access
- photo selections by gallery access
- photo downloads by gallery access
- unique active gallery access per gallery

## Transaction / concurrency requirements

The database layer should enforce the following operational expectations:

1. Account and studio membership writes must be atomic.
2. Gallery creation should validate the client and studio relationship in the same transaction.
3. Gallery access issuance should be atomic so the access record and the corresponding session state remain aligned.
4. Photo selection and download writes should be transactional to avoid partial state updates.
5. All ownership changes must be protected by a consistent transaction boundary.
6. Row updates that rely on uniqueness (especially gallery member roles and current access records) must be treated as conflict-sensitive operations.
7. The application should treat database uniqueness violations and foreign-key violations as controlled business errors rather than generic server failures.

## Seed / test fixtures

The seed layer deliberately creates a minimal private studio fixture that exercises the main trust boundary:

- owner user
- studio
- studio membership for the owner
- single client
- single gallery tied to the studio and client
- active gallery access records
- photos in the gallery
- gallery feedback and selection rows

This gives the test suite a stable, meaningful fixture with realistic relationships without adding irrelevant product features.

## Migration tests

The migration contract is validated in tests by asserting that the schema includes the required domain tables, constraints, and indexes. The tests intentionally enforce the guardrails around the critical user/studio/gallery flow rather than broad UI behavior.

The migration test set checks:

- all required tables exist
- gallery workflow and publication enums are enforced
- rights and roles are constrained
- key unique indexes are present
- identity and access relationships are protected by foreign keys

This keeps the behavior focused on backend integrity and avoids testing mock-only behavior.
