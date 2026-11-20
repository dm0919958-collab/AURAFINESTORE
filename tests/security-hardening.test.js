const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('no default or database-backed Admin PIN fallback; legacy hashes are removed natively', () => {
  assert.doesNotMatch(server, /DEFAULT_ADMIN_PIN|AURA@9821|storedPin/);
  assert.match(server, /ADMIN_PIN_HASH/);
  assert.match(server, /ADMIN_PIN.length < 16/);
  assert.match(server, /Settings\.collection\.updateMany/);
  assert.match(server, /Settings\.collection\.countDocuments/);
  assert.match(server, /Legacy Admin PIN cleanup failed/);
});

test('JWT secret is mandatory and admin tokens are scoped', () => {
  assert.match(server, /Buffer.byteLength\(JWT_SECRET, 'utf8'\) < 32/);
  assert.match(server, /issuer: ADMIN_JWT_ISSUER/);
  assert.match(server, /audience: ADMIN_JWT_AUDIENCE/);
  assert.match(server, /algorithms: \['HS256'\]/);
  assert.match(server, /maxAge: ADMIN_JWT_TTL/);
  assert.doesNotMatch(server, /req\.query\.(?:token|ctoken)/);
});

test('Multer is pinned to patched 2.5.0 and file signatures are checked', () => {
  assert.equal(pkg.dependencies.multer, '2.5.0');
  assert.match(pkg.dependencies['file-type'], /^\^22\./);
  assert.match(server, /fileTypeFromBuffer/);
  assert.match(server, /uploadedFilesMatchTypes/);
  assert.match(server, /isValidImageDataUrl/);
});

test('upload memory and multipart fields have strict per-field and parser limits', () => {
  assert.match(server, /boundedUploadMemoryStorage/);
  assert.match(server, /UPLOAD_FIELD_MAX_BYTES/);
  assert.match(server, /photos: 5 \* 1024 \* 1024/);
  assert.match(server, /video: 10 \* 1024 \* 1024/);
  assert.match(server, /slipFile: 8 \* 1024 \* 1024/);
  assert.match(server, /fieldSize: 16 \* 1024/);
  assert.match(server, /fieldNestingDepth: 4/);
});

test('CORS uses exact allowlisted origins and Helmet CSP', () => {
  assert.match(server, /app\.use\(helmet\(/);
  assert.match(server, /const allowedOrigins = new Set/);
  assert.match(server, /contentSecurityPolicy/);
  assert.doesNotMatch(server, /origin\.endsWith\('\.onrender\.com'\)/);
  assert.doesNotMatch(server, /origin\.includes\('aurafinestore\.in'\)/);
});

test('API and admin login rate limits are active', () => {
  assert.match(server, /app\.use\('\/api', apiLimiter\)/);
  assert.match(server, /app\.post\('\/api\/admin\/login', adminLoginLimiter/);
});

test('MongoDB uses required URI, production TLS and bounded pooling', () => {
  assert.match(server, /valid MONGO_URI is required/);
  assert.match(server, /mongoOptions\.tls = true/);
  assert.match(server, /maxPoolSize: 10/);
  assert.match(server, /mongoose\.set\('strictQuery', true\)/);
});

test('admin PDF endpoints no longer receive JWTs in query strings', () => {
  assert.doesNotMatch(admin, /shipping-label[^\n]*[?&]token=|bulk-shipping-labels[^\n]*[?&]token=/);
  assert.match(admin, /openAdminPdf/);
});


test('payment retry source attempts are atomically locked before Razorpay order creation', () => {
  assert.match(server, /retryLockToken/);
  assert.match(server, /async function claimPaymentRetryLock/);
  assert.match(server, /providerOrderCreated = true/);
  assert.match(server, /lock for manual reconciliation/);
});

test('wallet coin credits use a durable per-order idempotency ledger', () => {
  assert.match(server, /creditedOrderIds: \{ type: \[String\], default: \[\] \}/);
  assert.match(server, /\$addToSet: \{ creditedOrderIds: orderId \}/);
  assert.match(server, /async function creditOrderCoinsOnce/);
  assert.match(server, /await creditOrderCoinsOnce\(ord\)/);
  assert.match(server, /await creditOrderCoinsOnce\(order(?:,\s*session)?\)/);
});


test('inventory stock operations are transactional and auditable', () => {
  assert.match(server, /inventoryAuditSchema/);
  assert.match(server, /async function applyInventoryMovement/);
  assert.match(server, /await inventorySession\.withTransaction/);
  assert.match(server, /await session\.withTransaction/);
  assert.match(server, /app\.get\('\/api\/admin\/inventory-audit'/);
  assert.match(server, /ORDER_STOCK_RESTORED/);
  assert.match(server, /ADMIN_STOCK_UPDATED/);
});

test('variant and size stock edits are normalized and total-only quick edits are blocked', () => {
  assert.match(server, /normalizeStockMaps\(variantStock, sizeStock, stockQuantity\)/);
  assert.match(server, /update the matching stock map instead of total stock only/);
});

test('CSP limits media sources to trusted origins and declares a same-origin manifest', () => {
  assert.match(server, /mediaSrc: \["'self'",'data:','blob:','https:\/\/res\.cloudinary\.com'\]/);
  assert.match(server, /manifestSrc: \["'self'"\]/);
  assert.doesNotMatch(server, /mediaSrc:.*'https:'\]/);
  // Tailwind Play CDN still needs unsafe-eval; remove it only after migrating to compiled local CSS.
  assert.match(server, /'unsafe-eval'.*https:\/\/cdn\.tailwindcss\.com/);
});

test('dependency lockfile is committed for reproducible installs', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'package-lock.json')));
});
