# Authorization matrix

## Layer 1: studio role

Studio roles are broad membership categories:

- `owner`: studio-level ownership / administration
- `admin`: operational studio administration
- `photographer`: photographic work and studio operations tied to gallery membership
- `assistant`: limited operational assistance

These roles do not automatically grant every gallery capability. They establish the authenticated actor's studio-standing, but the gallery permission model determines what may actually happen on a given gallery.

## Layer 2: gallery role

Gallery roles are scoped relationships to a specific gallery:

- `owner`
- `collaborator`
- `uploader`

These answer: what is this studio member's relationship to this gallery?

## Layer 3: permission

Permissions are the actual capabilities enforced by the application. Examples:

- `gallery.view`
- `gallery.update`
- `gallery.publish`
- `gallery.archive`
- `gallery.access.view`
- `gallery.access.create`
- `gallery.access.reset`
- `gallery.access.revoke`
- `photo.view`
- `photo.create`
- `photo.update`
- `photo.delete`
- `photo.reorder`
- `photo.recommend`
- `photo.upload`
- `activity.view`

Authorization should be evaluated as:

Actor -> studio membership -> gallery membership -> gallery role -> permission set -> requested operation

The service should ask for the specific permission instead of directly comparing `role` in many branches.

## Baseline gallery permission matrix

| Capability | Owner | Collaborator | Uploader |
| --- | --- | --- | --- |
| view gallery | ✓ | ✓ | ✓ |
| update gallery metadata | ✓ | ✓ | — |
| publish gallery | ✓ | — | — |
| archive gallery | ✓ | — | — |
| view client access | ✓ | ✓ | — |
| create client access | ✓ | — | — |
| reset client access | ✓ | — | — |
| revoke client access | ✓ | — | — |
| view photo | ✓ | ✓ | ✓ |
| create photo | ✓ | ✓ | ✓ |
| update photo metadata | ✓ | ✓ | — |
| delete photo | ✓ | ✓ | — |
| reorder photos | ✓ | ✓ | — |
| recommend photo | ✓ | ✓ | — |
| upload photo | ✓ | ✓ | ✓ |
| view activity | ✓ | ✓ | — |

This is the recommended MVP mapping. It gives each gallery role a coherent purpose:

- Owner: full authority over the gallery.
- Collaborator: can curate and assist without controlling publication or client access.
- Uploader: can contribute imagery but cannot change business state or client credentials.

## Studio owner/admin interaction

Studio owner/admin are not automatically gallery owners. They may be authorized to manage galleries within the studio, but the permission model still determines whether they can publish, archive, or manage client access for a given gallery.

This matters for auditability and for separating:

- `studio admin` from
- `gallery owner`

The policy layer chooses the effective permission set for the operation, rather than pretending the actor is a gallery owner by default.

## Client permissions

The client authorization domain remains separate from photographer authorization:

- `view`
- `view_download`

This permission is derived from the active `client_session` linked to `gallery_access` and not from a photographer role model.

## 404 vs 403

- Use 404 when the resource is outside the actor's known scope and revealing it would leak protected information.
- Use 403 when the resource is within scope but the actor lacks the required permission.

Examples:
- client requests another gallery: 404
- client has gallery A access but lacks download permission: 403 DOWNLOAD_NOT_PERMITTED
- photographer requests a resource outside studio scope: 404 preferred

## Security invariants

1. A photographer cannot access a gallery outside their studio scope.
2. A photographer cannot operate on a photo outside the gallery scope.
3. A client session cannot access a gallery other than the gallery granted by the session.
4. A client cannot operate on a photo outside that gallery.
5. Client download permission comes from the current server-side access grant.
6. Request body roles and permission values never establish authority.
7. Revoked or expired access must fail on subsequent requests.
8. Gallery membership is evaluated server-side.
9. Database uniqueness does not replace authorization.
10. Resource IDs identify resources; they do not grant access.
