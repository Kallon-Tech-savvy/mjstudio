# SECURITY REVIEW

## Threats tested

- cross-studio access attempts
- cross-gallery access attempts via manipulated resource IDs
- permission escalation through forged body fields
- lower-privilege client session attempting a download
- privilege mismatch between server-derived auth and browser-supplied identity tuples

## Threats mitigated

- authenticated photographer scope is checked against the resource studio before the operation proceeds
- client gallery access is constrained to the exact session's gallery grant
- download permission is enforced before generating any capability
- body parsing rejects untrusted fields that are not part of the explicit server contract
- request-origin validation remains separate from authentication and authorization

## Threats accepted / deferred

- production object storage, image processing, and delivery providers are intentionally not yet configured; they remain fail-closed in the application layer
- CSRF protection depends on explicit origin validation and SameSite cookie semantics; a dedicated CSRF token flow would be required if the deployment model changes
- rate limits are defined at the service layer but must be tuned to the production traffic profile and trusted-proxy configuration

## Known limitations

- the backend does not yet include a production-grade file validation or image-processing pipeline
- the app still relies on server-side policy enforcement rather than a formal RBAC/ABAC service
- job recovery, reconciliation, and storage cleanup must be validated with a live PostgreSQL and storage backend before being treated as fully production-hardened

## Remaining architectural risks

1. Storage capability boundaries must be validated end-to-end with a real object store.
2. Background job recovery must be exercised under lease expiry and worker crashes.
3. Client access reset races and publication races should be validated under concurrent requests.
4. Production deployment must enforce HTTPS and reverse-proxy trust configuration before treating cookies and `req.ip` as authoritative.

## Decision

The current backend enforces explicit trust boundaries for identity, resource scope, and permission checks, but the remaining risks are operational and deployment-dependent rather than structural. The application should not proceed to UI implementation until the live storage, queue, and deployment assumptions are exercised in a real environment.
