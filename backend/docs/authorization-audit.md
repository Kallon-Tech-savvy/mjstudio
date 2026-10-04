# Authorization audit

## Current authorization architecture

The backend currently has a narrow but explicit trust boundary:

- Authentication is resolved in `src/auth/context.ts` and `src/middleware/authentication.ts`.
- Photographers are authenticated through a trusted server-side context derived from bearer tokens.
- Clients are authenticated through a distinct `ClientContext` derived from a gallery session token.
- Authorization is now modeled as a distinct concern: identity, scope, and permission checks are separated.

The project keeps the dependency direction intentionally controlled:

HTTP -> application services -> authorization policies -> repositories -> database

This means the browser never establishes authority, and request parameters are not treated as trusted identity.

## Role vs permission model

The explicit model is:

Studio role -> gallery membership -> gallery role -> permission -> operation

This separation matters because the system must not conflate role with capability.

- Studio role answers: what kind of studio member is this actor?
- Gallery role answers: what is this actor's relationship to this gallery?
- Permission answers: what can this actor actually do?

For example, a studio photographer may have `gallery role = uploader` but still not receive `gallery.publish` or `gallery.access.reset`.

The application defines static role-to-permission mappings and evaluates permissions at the policy layer instead of hard-coding `if (role === ...)` checks across the app.

## Proposed authorization flow

1. HTTP request arrives.
2. Authentication middleware resolves the trusted actor context.
3. Application service loads the target resource and verifies parent/child scope.
4. Policy layer evaluates the actor, the resource, and the required permission set.
5. Repository executes the permitted data operation.
6. Database layer enforces structural invariants only.

This keeps the browser out of the trust path and prevents request mutation from establishing identity or permission.

## Affected files

- `src/auth/context.ts`
- `src/auth/authorization.ts`
- `src/middleware/authentication.ts`
- `src/errors.ts`
- `src/db/schema.ts`
- `src/db/migrations/001_init_core_schema.sql`
- `src/services/studio-service.ts`
- `src/application/policies/*`
- `tests/auth.test.ts`
- `tests/authorization.test.ts`

## Security risks discovered

- Cross-studio access if a gallery ID is trusted from the URL without checking `studioId`.
- Cross-gallery access if a photo ID is allowed without verifying the photo belongs to the target gallery.
- IDOR/BOLA via manipulated galleryId, photoId, clientId, or role values in body/query/header.
- Role escalation if request-body roles are accepted as real authority.
- Insecure download flow if access permission is not validated server-side.
- Stale authorization if sessions retain revoked access.
- Ambiguous resource disclosure if a different gallery is exposed via a not-found vs forbidden mismatch.

## Implementation plan

1. Define centralized policy functions for studio, gallery, photo, and client access.
2. Keep studio role, gallery role, and permissions as separate layers.
3. Resolve permissions from static mappings rather than ad hoc role comparisons.
4. Enforce gallery-to-studio and photo-to-gallery scope checks before mutations.
5. Enforce permission matrices for photographer gallery roles and client gallery access.
6. Add policy-level tests for cross-gallery, cross-studio, and permission-boundary attempts.
7. Keep application services as the composition point for the policy layer.
8. Preserve DB constraints as structural safeguards, not the only authorization mechanism.
