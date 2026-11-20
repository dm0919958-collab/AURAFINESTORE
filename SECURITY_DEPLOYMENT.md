# AURA Fine Store security deployment notes

## Required Render environment variables

Set these before deploying this branch:

- `ADMIN_PIN`: a unique admin passphrase with at least 16 characters. Do not reuse a store, email or payment password.
- `JWT_SECRET`: a random secret with at least 32 bytes. Keep it different from `ADMIN_PIN`.
- `MONGO_URI`: the production MongoDB connection string. Production connections require TLS.

Keep all secrets in Render Environment, never in GitHub files or browser code. Rotating `ADMIN_PIN` or `JWT_SECRET` invalidates existing admin sessions; admins must log in again.

## MongoDB Atlas hardening

The application enforces TLS for production connections, disables automatic index creation, enables strict query casting, and bounds the connection pool. In Atlas, also:

1. Use a dedicated database user with only `readWrite` on the AURA application database; do not use the Atlas owner account.
2. Restrict network access to the narrowest supported Render egress addresses or a private network path. Do not leave the database open to `0.0.0.0/0`.
3. Keep automated backups enabled and test a restore.
4. Rotate the database password if it has ever been committed or shared.

These Atlas account, network and backup settings cannot be changed by application code.

## CORS and rate limits

The default CORS allowlist contains the production Render URL and the AURA custom domains. If the store uses another frontend hostname, add its exact origin (scheme and hostname, no path) to `ALLOWED_ORIGINS` in Render.

Multer is pinned to `2.5.0` (the patched release for the October 22, 2026 async `fileFilter` denial-of-service advisory). Multipart uploads use per-field in-memory caps: photos 5 MB each, video 10 MB, delivery slips 8 MB; parser limits also cap files, fields, field sizes, field names, nesting depth and total parts. A support/return request can therefore buffer at most 40 MB of file content. Keep these limits aligned with the customer-facing upload guidance.\n\nThe security CI now runs HTTP integration tests for Admin PIN login, protected API rejection, exact-origin CORS, multipart size rejection and file-signature spoofing, in addition to static regression tests.\n\nThe current Express rate-limit store is process-local. It protects the current single service process, but counters reset on restart and are not shared if the service is scaled to multiple instances. Use a shared Redis/Valkey or Mongo-backed store before horizontal scaling.

## CSP compatibility note

The current pages use inline scripts/styles and the Tailwind Play CDN. The enforced CSP therefore still permits inline script/style and eval for compatibility while restricting script/style hosts and disabling objects and framing. A stricter nonce/hash-based CSP requires refactoring those inline blocks and bundling Tailwind before enabling it.
