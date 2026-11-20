const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('no default or database-backed Admin PIN fallback', () => {
  assert.doesNotMatch(server, /DEFAULT_ADMIN_PIN|AURA@9821|storedPin/);
  assert.match(server, /ADMIN_PIN_HASH/);
  assert.match(server, /ADMIN_PIN.length < 16/);
  assert.match(server, /\$unset: \{ adminPin: 1 \}/);
});
test('JWT secret is mandatory and admin tokens are scoped', () => {
  assert.match(server, /Buffer.byteLength\(JWT_SECRET, 'utf8'\) < 32/);
  assert.match(server, /issuer: ADMIN_JWT_ISSUER/);
  assert.match(server, /audience: ADMIN_JWT_AUDIENCE/);
  assert.match(server, /algorithms: \['HS256'\]/);
  assert.match(server, /maxAge: ADMIN_JWT_TTL/);
  assert.doesNotMatch(server, /req\.query\.(?:token|ctoken)/);
});
test('Multer 2 and file content-signature validation are enabled', () => {
  assert.match(pkg.dependencies.multer, /^\^2\./);
  assert.match(pkg.dependencies['file-type'], /^\^22\./);
  assert.match(server, /fileTypeFromBuffer/);
  assert.match(server, /uploadedFilesMatchTypes/);
  assert.match(server, /isValidImageDataUrl/);\n  assert.match(server, /UPLOAD_FIELD_MAX_BYTES/);\n  assert.match(server, /fieldSize: 16 \\* 1024/);\n  assert.match(server, /fieldNestingDepth: 4/);\n  assert.match(server, /boundedUploadMemoryStorage/);
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
