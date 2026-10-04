# API security boundary

## Authentication and session cookies

Photographer and client sessions are opaque random values stored only as SHA-256 hashes. The HTTP layer resolves them from HttpOnly cookies; the old development bearer tokens are not accepted. Cookies use `Secure`, `HttpOnly`, and `SameSite=Lax`. Photographer cookie uses the `__Host-` prefix, `Path=/`, and no Domain. The client cookie uses `__Secure-` because its narrower `/api/client` path is incompatible with the `__Host-` prefix.

Credential verification and current membership/session state are resolved on each request. Raw session tokens, PINs, access secrets, password values, and signed URLs must not be logged.

## CSRF and CORS

All state-changing requests require an exact configured `Origin`; the allowed list is `FRONTEND_ORIGINS`, a comma-separated set of origins. Missing origins are rejected for writes. CORS permits only those exact origins, credentials, the listed API methods, and JSON/X-CSRF headers. `SameSite=Lax` is defense in depth, not the CSRF mechanism. The server-side Origin check is the current CSRF control; a synchronizer token can be added if cross-site deployment behavior requires it. CORS is not authentication or authorization.

## Headers and body constraints

Helmet enables a deny-by-default CSP (`default-src 'none'`), `frame-ancestors 'none'`, `base-uri 'none'`, same-site CORP, `Referrer-Policy: no-referrer`, MIME sniffing protection, and frame protections. HSTS is enabled only in production and assumes HTTPS is correctly terminated. JSON bodies are limited to 1 MiB. Wrong explicit content types return 415; malformed JSON returns 400; oversized bodies return 413.

## Authorization visibility

Photographer gallery/photo lookups resolve current studio and gallery membership. A resource outside that visibility returns 404; an in-scope operation without permission returns 403. Client requests resolve session → current access grant → published, unarchived gallery; a URL gallery mismatch returns 404. Client photo queries must remain constrained to the session's gallery.

## Rate limits

Rate limits use shared PostgreSQL fixed-window buckets and hash subject identifiers before storage. Current defaults: login 10/15 minutes, client access verification 8/15 minutes, access reset 5/hour, download capability 60/minute, and feedback 10/hour. PIN verification is additionally routed through the client-access limiter. Production deployments must tune limits, apply trusted-proxy configuration before relying on `req.ip`, and monitor/expire old bucket rows.

## Provider readiness

The HTTP routes are composed with PostgreSQL services. This repository does not yet provide real object storage, image processing, email delivery, or a production password-hash migration. Their adapters currently fail closed with 503. The API must not be considered production-ready until these adapters and migration/deployment settings are supplied. Access create/reset sends credentials through the delivery adapter and never returns their raw values.