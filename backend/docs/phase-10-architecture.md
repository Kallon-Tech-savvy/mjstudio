# Phase 10 architecture boundary

This backend keeps the architectural flow explicit:

1. untrusted HTTP input
2. interface validation
3. authentication
4. resource resolution
5. authorization
6. application use case
7. domain and business rules
8. transaction boundary
9. infrastructure call
10. response mapping

The domain layer owns business concepts and state semantics. The application layer owns use cases and authorization decisions. Infrastructure owns storage, jobs, clocks, and randomness.

The security boundary is intentionally narrow: no normal request path bypasses validation, authentication, and authorization before a database or storage mutation occurs.
