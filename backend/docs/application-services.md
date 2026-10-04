# Application service boundaries

Phase 5 introduces application services without adding HTTP routes. Services receive authenticated server-side contexts and a PostgreSQL database dependency. Photographer operations resolve studio and gallery membership from persisted rows; client operations revalidate the current session, access grant, gallery state, and requested photo.

## Service ownership

- `GalleryService`: creation with owner membership, safe metadata updates, and locked publication/archive transitions.
- `PhotoService`: photo/asset creation, safe metadata changes, soft deletion with cleanup outbox records, complete-set reordering, storage verification, and durable processing-job creation.
- `GalleryAccessService`: create/reset/revoke/resend lifecycle. Raw credentials are returned only through delivery; token hashes and salted scrypt PIN hashes are stored.
- `ClientSessionService`: secret+PIN verification, hashed opaque sessions, live grant/session resolution, and revocation.
- `SelectionService`: current selection upsert, unique per access grant and photo.
- `RecommendationService`: gallery-scoped unique recommendation operations.
- `DownloadService`: active published-gallery authorization, event insertion, then a short-lived storage capability.
- `FeedbackService`: client-scoped gallery/photo feedback with active-photo checks.

## Transaction and external-operation boundaries

- Gallery creation transaction groups gallery and initial owner membership.
- Publish/archive lock the gallery row and re-read lifecycle state in the transaction, preventing concurrent commands from both applying the transition.
- Access reset locks the gallery/current grant and revokes dependent sessions in the same transaction as replacement grant insertion.
- Photo reorder locks the gallery and all active photos, validates the full set, then uses a temporary position range to avoid unique-index collisions.
- Selection and recommendation writes use database uniqueness/upsert semantics.
- Photo deletion records storage cleanup work transactionally; a worker must consume `storage_cleanup_jobs`.
- Upload completion verifies storage before the DB transaction, marks only the uploaded source asset ready, and creates one durable processing job. The photo remains `processing` until a processing worker marks it active. Queue delivery uses the durable job ID and must be idempotent.
- Download event insertion and capability generation are not distributed-atomic. A failed capability creation can leave a legitimate download-attempt event; do not erase it as though storage and PostgreSQL shared a transaction.
- Access credential delivery occurs after grant commit. A delivery failure requires an explicit recovery/reset workflow; the raw credential is intentionally not recoverable from its hash.

## Provider requirements

Production composition must supply `PhotoStorage`, `PhotoProcessingQueue`, `AccessCredentialDelivery`, and `PinAttemptLimiter` adapters. The PIN limiter must be shared across instances and keyed with a privacy-preserving client identifier. Access delivery must keep the raw token/PIN transient and must not log them. Processing and storage-cleanup workers must claim jobs transactionally and acknowledge external work idempotently.

The current phase does not add routes or concrete cloud adapters. Those belong in HTTP contract enforcement and deployment/provider integration, respectively.