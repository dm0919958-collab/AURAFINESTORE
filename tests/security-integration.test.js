const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.ADMIN_PIN = 'ci-only-admin-passphrase-2026';
process.env.JWT_SECRET = 'ci-only-random-jwt-secret-which-is-longer-than-32-bytes';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/aura_ci_test';
process.env.ALLOWED_ORIGINS = 'https://ci.aura.example';

const { app, removeLegacyAdminPinHashes, Settings } = require('../server');

test('legacy Admin PIN migration uses native unset and verifies no hashes remain', async () => {
  const originalUpdate = Settings.collection.updateMany;
  const originalCount = Settings.collection.countDocuments;
  let updateArgs;
  Settings.collection.updateMany = async (...args) => { updateArgs = args; return { modifiedCount: 1 }; };
  Settings.collection.countDocuments = async () => 0;
  try {
    await removeLegacyAdminPinHashes();
    assert.deepEqual(updateArgs[0], { adminPin: { $exists: true } });
    assert.deepEqual(updateArgs[1], { $unset: { adminPin: '' } });
  } finally {
    Settings.collection.updateMany = originalUpdate;
    Settings.collection.countDocuments = originalCount;
  }
});

test('Admin login rejects an incorrect PIN and issues a scoped token for the correct PIN', async () => {
  const rejected = await request(app).post('/api/admin/login').send({ pin: 'wrong-pin' });
  assert.equal(rejected.status, 401);
  const accepted = await request(app).post('/api/admin/login').send({ pin: process.env.ADMIN_PIN });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.success, true);
  assert.equal(typeof accepted.body.token, 'string');
  assert.equal(accepted.headers['cache-control'], 'no-store');
});

test('admin API rejects requests without a bearer token', async () => {
  const response = await request(app).post('/api/admin/orders').send({});
  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
});

test('CORS accepts an exact configured origin and rejects an unknown origin', async () => {
  const allowed = await request(app)
    .options('/api/store')
    .set('Origin', 'https://ci.aura.example')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://ci.aura.example');

  const denied = await request(app)
    .get('/api/store')
    .set('Origin', 'https://attacker.example');
  assert.equal(denied.status, 403);
});

test('upload parser rejects a file exceeding the per-field memory cap', async () => {
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1, 0x41);
  const response = await request(app)
    .post('/api/admin/orders/TEST/upload-slip')
    .attach('slipFile', oversized, { filename: 'large.pdf', contentType: 'application/pdf' });
  assert.equal(response.status, 413);
  assert.match(response.body.message, /Upload rejected/i);
});

test('upload route rejects spoofed file content after authenticated parsing', async () => {
  const login = await request(app).post('/api/admin/login').send({ pin: process.env.ADMIN_PIN });
  assert.equal(login.status, 200);
  const response = await request(app)
    .post('/api/admin/orders/TEST/upload-slip')
    .set('Authorization', `Bearer ${login.body.token}`)
    .attach('slipFile', Buffer.from('not a real PDF'), { filename: 'fake.pdf', contentType: 'application/pdf' });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /valid PDF/i);
});
