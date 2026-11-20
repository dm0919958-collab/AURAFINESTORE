const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_PIN = 'ci-only-admin-passphrase-2026';
process.env.JWT_SECRET = 'ci-only-random-jwt-secret-which-is-longer-than-32-bytes';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/aura_ci_test';

const { creditOrderCoinsOnce, claimPaymentRetryLock, Wallet, Order, PaymentAttempt } = require('../server');

test('same order can credit Aura Coins only once, including after an interrupted order update', async () => {
  const originals = {
    walletFindOneAndUpdate: Wallet.findOneAndUpdate,
    walletExists: Wallet.exists,
    orderUpdateOne: Order.updateOne
  };
  let balance = 0;
  const ledger = new Set();
  let failFirstOrderUpdate = true;
  Wallet.findOneAndUpdate = async (filter, update) => {
    if (update.$setOnInsert) return { phone: filter.phone };
    const orderId = update.$addToSet.creditedOrderIds;
    if (ledger.has(orderId)) return null;
    ledger.add(orderId);
    balance += update.$inc.coins;
    return { phone: filter.phone, coins: balance };
  };
  Wallet.exists = async filter => ledger.has(filter.creditedOrderIds);
  Order.updateOne = async () => {
    if (failFirstOrderUpdate) { failFirstOrderUpdate = false; throw new Error('simulated interruption'); }
    return { modifiedCount: 1 };
  };
  try {
    const order = { _id: 'db-order-1', id: 'AUR-100001', phone: '9876543210', customerName: 'Test', coinsEarned: 40 };
    await assert.rejects(creditOrderCoinsOnce(order), /simulated interruption/);
    assert.equal(balance, 40);
    await creditOrderCoinsOnce(order);
    assert.equal(balance, 40);
    assert.equal(order.coinsCredited, true);
    assert.equal(order.coinsStatus, 'credited');
  } finally {
    Wallet.findOneAndUpdate = originals.walletFindOneAndUpdate;
    Wallet.exists = originals.walletExists;
    Order.updateOne = originals.orderUpdateOne;
  }
});

test('concurrent payment retry requests cannot both claim the same source attempt', async () => {
  const original = PaymentAttempt.findOneAndUpdate;
  let claimed = false;
  PaymentAttempt.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter._id, 'attempt-1');
    assert.deepEqual(filter.status, { $in: ['Cancelled', 'Failed'] });
    if (claimed) return { lean: async () => null };
    claimed = true;
    return { lean: async () => ({ _id: 'attempt-1', retryLockToken: update.$set.retryLockToken }) };
  };
  try {
    const source = { _id: 'attempt-1' };
    const [first, second] = await Promise.all([
      claimPaymentRetryLock(source, 'token-one'),
      claimPaymentRetryLock(source, 'token-two')
    ]);
    assert.equal(Boolean(first), true);
    assert.equal(second, null);
  } finally {
    PaymentAttempt.findOneAndUpdate = original;
  }
});
