'use strict';

function cleanStockMap(rawMap) {
  const result = Object.create(null);
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return result;
  for (const [rawKey, rawValue] of Object.entries(rawMap)) {
    const key = String(rawKey).trim();
    if (!key || key.startsWith('$') || key.includes('.') || key.includes('\0') ||
        key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error('Invalid stock option key.');
    }
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Stock values must be non-negative whole numbers.');
    result[key] = value;
  }
  return result;
}

function normalizeStockMaps(variantRaw, sizeRaw, fallbackTotal = 0) {
  const variantStock = cleanStockMap(variantRaw);
  let sizeStock = cleanStockMap(sizeRaw);
  const variantKeys = Object.keys(variantStock);
  if (variantKeys.length) {
    const derived = Object.create(null);
    for (const [key, qty] of Object.entries(variantStock)) {
      const split = key.indexOf('__');
      const size = split >= 0 ? key.slice(split + 2) : '';
      if (size) derived[size] = (derived[size] || 0) + qty;
    }
    if (Object.keys(derived).length) sizeStock = derived;
  }
  const hasVariants = variantKeys.length > 0;
  const hasSizes = Object.keys(sizeStock).length > 0;
  const total = hasVariants
    ? Object.values(variantStock).reduce((sum, qty) => sum + qty, 0)
    : hasSizes
      ? Object.values(sizeStock).reduce((sum, qty) => sum + qty, 0)
      : Number.isSafeInteger(Number(fallbackTotal)) && Number(fallbackTotal) >= 0 ? Number(fallbackTotal) : 0;
  return { variantStock, sizeStock, stockQuantity: total, inStock: total > 0 };
}

function stockMutationPlan(product, item, direction) {
  if (!['deduct', 'restore'].includes(direction)) throw new Error('Invalid stock operation.');
  const qty = Number(item.qty);
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('Invalid stock quantity.');
  const variantStock = cleanStockMap(product.variantStock);
  const sizeStock = cleanStockMap(product.sizeStock);
  const color = String(item.selectedColor || 'Standard').trim();
  const size = String(item.selectedSize || 'Standard').trim();
  const variantKey = color + '__' + size;
  const delta = direction === 'deduct' ? -qty : qty;
  const fields = {};
  let type = 'total';
  if (Object.keys(variantStock).length) {
    if (!Object.prototype.hasOwnProperty.call(variantStock, variantKey)) throw new Error('Selected color and size combination is unavailable.');
    fields['variantStock.' + variantKey] = delta;
    if (Object.prototype.hasOwnProperty.call(sizeStock, size)) fields['sizeStock.' + size] = delta;
    type = 'variant';
  } else if (Object.prototype.hasOwnProperty.call(sizeStock, size)) {
    fields['sizeStock.' + size] = delta;
    type = 'size';
  }
  fields.stockQuantity = delta;
  return { type, fields, qty, variantKey, size, direction };
}

module.exports = { cleanStockMap, normalizeStockMaps, stockMutationPlan };
