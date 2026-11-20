const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanStockMap, normalizeStockMaps, stockMutationPlan } = require('../inventory-domain');

test('normalizes total stock from variant quantities and rebuilds size aggregates', () => {
  const result = normalizeStockMaps(
    { 'Red__S': 2, 'Blue__S': 3, 'Red__M': 4 },
    { S: 999, M: 999 },
    1
  );
  assert.equal(result.stockQuantity, 9);
  assert.deepEqual({ ...result.sizeStock }, { S: 5, M: 4 });
  assert.equal(result.inStock, true);
});

test('uses size stock when no color variants exist', () => {
  const result = normalizeStockMaps({}, { S: 2, M: 1 }, 100);
  assert.equal(result.stockQuantity, 3);
});

test('uses fallback total for products without variants or sizes', () => {
  assert.equal(normalizeStockMaps({}, {}, 7).stockQuantity, 7);
});

test('rejects unsafe MongoDB path keys and invalid stock values', () => {
  assert.throws(() => cleanStockMap({ 'Red.$where': 2 }), /Invalid stock option key/);
  assert.throws(() => cleanStockMap({ '-1': -1 }), /non-negative whole numbers/);
  assert.throws(() => cleanStockMap({ S: 1.5 }), /non-negative whole numbers/);
});

test('variant mutation keeps matching size aggregate and total in sync', () => {
  const plan = stockMutationPlan({
    variantStock: { 'Red__S': 4, 'Blue__S': 2 },
    sizeStock: { S: 6 }
  }, { selectedColor: 'Red', selectedSize: 'S', qty: 2 }, 'deduct');
  assert.equal(plan.type, 'variant');
  assert.deepEqual(plan.fields, {
    'variantStock.Red__S': -2,
    'sizeStock.S': -2,
    stockQuantity: -2
  });
});

test('size-only mutation and restore have correct signed deltas', () => {
  const product = { variantStock: {}, sizeStock: { M: 3 } };
  assert.deepEqual(
    stockMutationPlan(product, { selectedSize: 'M', qty: 1 }, 'restore').fields,
    { 'sizeStock.M': 1, stockQuantity: 1 }
  );
});

test('rejects invalid operation and quantity', () => {
  assert.throws(() => stockMutationPlan({}, { qty: 1 }, 'remove'), /Invalid stock operation/);
  assert.throws(() => stockMutationPlan({}, { qty: 0 }, 'deduct'), /Invalid stock quantity/);
});

test('does not fall back to a size aggregate when a color variant is missing', () => {
  assert.throws(() => stockMutationPlan({
    variantStock: { 'Blue__S': 3 }, sizeStock: { S: 3 }
  }, { selectedColor: 'Red', selectedSize: 'S', qty: 1 }, 'deduct'), /combination is unavailable/);
});
