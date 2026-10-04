# HTTP API

All routes are under `/api`; there is no version prefix. JSON success responses use `{ "data": ... }`. Collection responses include `{ "data": [...], "meta": { "count", "total", "page", "limit" } }`. Errors use `{ "error": { "code", "message", "request_id" } }`. The server generates request IDs and returns the value in `X-Request-ID` and error envelopes.

Collection pagination accepts only `page` (default 1) and `limit` (default 20, maximum 100), ordered by creation time or gallery position as appropriate. Unsupported query parameters are rejected. UUID path parameters and strict request bodies are runtime validated.

## Photographer authentication

| Method | Endpoint | Authentication | Result |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public, trusted Origin required | 200 safe user DTO; sets HttpOnly session cookie |
| POST | `/api/auth/logout` | Photographer cookie | 204, revokes session and clears cookie |
| GET | `/api/auth/me` | Optional photographer cookie | 200 safe user DTO or null |

The password adapter accepts only stored `scrypt$<salt>$<hex-digest>` hashes. Invalid credentials return `401 INVALID_CREDENTIALS`; an unconfigured password provider returns `503 SERVICE_UNAVAILABLE`.

## Studio and clients

| Method | Endpoint | Permission/scope |
| --- | --- | --- |
| GET | `/api/studio` | Current studio membership |
| GET | `/api/studio/members?page=&limit=` | Current studio membership |
| POST | `/api/clients` | Studio owner/admin |
| GET | `/api/clients?page=&limit=` | Current studio |
| GET | `/api/clients/:clientId` | Current studio; outside scope is 404 |
| PATCH | `/api/clients/:clientId` | Studio owner/admin; studio ID is not editable |

Studio member mutation endpoints are not exposed because a member-management application workflow/policy is not implemented.

## Galleries and access

| Method | Endpoint | Permission |
| --- | --- | --- |
| POST | `/api/galleries` | Studio owner/admin; server chooses studio and initial gallery owner |
| GET | `/api/galleries?page=&limit=` | Current gallery membership |
| GET | `/api/galleries/:galleryId` | `gallery.view` |
| PATCH | `/api/galleries/:galleryId` | `gallery.update`; metadata only |
| POST | `/api/galleries/:galleryId/publish` | `gallery.publish` |
| POST | `/api/galleries/:galleryId/archive` | `gallery.archive` |
| POST/GET | `/api/galleries/:galleryId/access` | `gallery.access.create` / `gallery.access.view` |
| POST | `/api/galleries/:galleryId/access/reset` | `gallery.access.reset` |
| POST | `/api/galleries/:galleryId/access/revoke` | `gallery.access.revoke` |
| POST | `/api/galleries/:galleryId/access/resend` | Current service delivery adapter |

Create/reset responses do not contain raw access credentials. The delivery provider is responsible for transient secure delivery. Lifecycle state cannot be changed by PATCH.

## Photos and recommendations

| Method | Endpoint | Scope |
| --- | --- | --- |
| POST/GET | `/api/galleries/:galleryId/photos` | Gallery membership and photo capability |
| PUT | `/api/galleries/:galleryId/photos/reorder` | Entire active gallery photo ID set |
| GET/PATCH/DELETE | `/api/photos/:photoId` | Parent gallery is resolved from the database |
| POST | `/api/photos/:photoId/upload-complete` | Parent gallery and upload capability; storage verification required |
| PUT/DELETE/GET | `/api/galleries/:galleryId/recommendations/:photoId` | `photo.recommend`; list is `/api/galleries/:galleryId/recommendations` |

Photo responses omit storage keys. Create returns only the short-lived upload capability from the configured storage adapter. Delete is soft deletion.

## Client gallery

| Method | Endpoint | Authentication |
| --- | --- | --- |
| POST | `/api/client/access/verify` | Secret + six-digit PIN; sets HttpOnly client session cookie |
| POST | `/api/client/logout` | Client session cookie |
| GET | `/api/client/galleries/:galleryId` | Active session/access grant; gallery mismatch is 404 |
| GET | `/api/client/galleries/:galleryId/photos?page=&limit=` | Active session/access grant |
| PUT | `/api/client/galleries/:galleryId/photos/:photoId/selection` | Active session; `neutral`, `favourite`, `not_for_me` |
| POST | `/api/client/galleries/:galleryId/photos/:photoId/download` | `view_download`; returns short-lived URL and expiry |
| POST | `/api/client/galleries/:galleryId/feedback` | Active session |
| POST | `/api/client/galleries/:galleryId/photos/:photoId/feedback` | Active session and visible photo |

Selection PUT is idempotent. Downloads and feedback are events; repeated POSTs create separate events.

## Status and error behavior

| Status | Meaning |
| --- | --- |
| 200 | Read, update, command, or idempotent state result |
| 201 | Resource/event created |
| 204 | Logout or delete with no response body |
| 400 | Malformed JSON or malformed request structure |
| 401 | Missing/invalid authentication |
| 403 | Trusted actor lacks operation permission or write Origin is not allowed |
| 404 | Route/resource outside visible scope; client credential verification uses generic `INVALID_GALLERY_ACCESS` |
| 409 | Current-state conflict |
| 413 | Request exceeds 1 MiB |
| 415 | Wrong Content-Type |
| 422 | Validly formed input violates schema/business input constraints |
| 429 | Rate limit exceeded |
| 500 | Unexpected error; response is generic |
| 503 | Required provider is not configured |