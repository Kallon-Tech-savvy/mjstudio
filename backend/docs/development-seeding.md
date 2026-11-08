# Development fixtures and safe diagnostics

`npm run seed` is a development fixture command. It refuses `NODE_ENV=production` before querying the database. It is not a production owner bootstrap procedure.

Set `SEED_EMAIL` and `SEED_PASSWORD` explicitly for a local account when needed. The command does not print either value. Existing scrypt password hashes are preserved on repeat fixture seeding. Fixture asset records are not real uploaded originals; create a fresh gallery and upload actual test images to exercise the complete workflow.

Do not run fixture seeding against a database containing real client work. Provision the production owner through a separately reviewed bootstrap/reset procedure; this repository does not yet provide that procedure.

Malformed JSON diagnostics log only the application's error code, request ID, method and path. Parser errors contain the raw request body and can embed it in their message/stack; those error objects must not be logged. Regression tests inspect complete structured warning records for synthetic password, PIN, secret and private-note values.

The security patch updates the backend's transitive request parser and query-string parser within their existing version ranges. Further dependency advisories must be assessed separately; this patch does not certify a clean full dependency audit or production readiness.
