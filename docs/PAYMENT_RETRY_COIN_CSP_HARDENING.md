# Payment retry, Aura Coins and CSP hardening

## Payment retry concurrency

A retry source attempt is now claimed with one conditional MongoDB update before creating a new Razorpay order. Concurrent requests cannot both claim the same failed/cancelled attempt. The lock is released after the new PaymentAttempt is saved, or when Razorpay did not create an order. If Razorpay created an order but the local attempt could not be saved, the lock is deliberately retained for manual reconciliation rather than allowing a second provider order. Support/admin must reconcile that exceptional case before another retry is permitted.

## Aura Coins idempotency

Wallet documents now retain `creditedOrderIds`. The wallet balance increment and the per-order ledger insertion happen in one atomic MongoDB document update. If the process stops before the order's `coinsCredited` flag is saved, the next pass sees the ledger entry and repairs the order flag without incrementing the balance again. Cancellation reversals remove the corresponding ledger entry when earned coins are reversed.

## Dependency lockfile

The security branch's first push runs a narrowly scoped workflow with `contents: write` to generate and commit `package-lock.json`. The regular security checks use `npm ci` and read-only repository permissions.

## Content Security Policy compatibility

Media sources are restricted to the store origin and Cloudinary, and the web app manifest is restricted to the store origin. The existing inline script/style and eval allowances remain temporarily because the customer/admin pages use inline event handlers/scripts and the Tailwind Play CDN. Remove those allowances only after migrating to nonce/hash-based scripts and compiled local Tailwind CSS, with browser checkout and admin regression testing.
