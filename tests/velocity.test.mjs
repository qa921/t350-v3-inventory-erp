import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowStart, classify, computeVelocity, daysBetween, WINDOW_DAYS } from '../dist/velocity.js';

const SNAPSHOT = '2026-09-14';

test('window starts 180 days before the snapshot date', () => {
  assert.equal(WINDOW_DAYS, 180);
  assert.equal(windowStart(SNAPSHOT), '2026-03-18');
});

test('classification bands', () => {
  assert.equal(classify(0), 'no-sales');
  assert.equal(classify(1), 'slow-moving');
  assert.equal(classify(2), 'slow-moving');
  assert.equal(classify(3), 'steady');
  assert.equal(classify(9), 'steady');
  assert.equal(classify(10), 'fast');
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-04-02', SNAPSHOT), 165);
  assert.equal(daysBetween('2026-03-09', SNAPSHOT), 189);
});

test('real fixture cases: P-1004 slow-moving, P-1020 and P-1025 no-sales', () => {
  const snapshot = {
    snapshotDate: SNAPSHOT,
    source: 'warehouse-view-v2',
    records: [
      { productId: 'P-1004', name: 'Cinder Wool Throw', sku: 'CWT-ASH', onHand: 58, reserved: 2, reorderPoint: 15, status: 'active', tags: ['home', 'slow-candidate'], updatedAt: '2026-09-08' },
      { productId: 'P-1020', name: 'Solace Incense Holder', sku: 'SIH-CLY', onHand: 72, reserved: 0, reorderPoint: 20, status: 'discontinued', tags: ['home', 'clearance'], updatedAt: '2026-09-01' },
      { productId: 'P-1025', name: 'Xylem Plant Mister', sku: 'XPM-AMB', onHand: 83, reserved: 2, reorderPoint: 22, status: 'active', tags: ['garden', 'slow-candidate'], updatedAt: '2026-09-03' },
      { productId: 'P-1019', name: 'Ridge Merino Socks', sku: 'RMS-M', onHand: 164, reserved: 22, reorderPoint: 45, status: 'active', tags: ['apparel', 'fast'], updatedAt: '2026-09-14' },
    ],
  };
  const sales = {
    source: 'orders-view-v1',
    extractedAt: SNAPSHOT,
    records: [
      ['P-1004', '2026-04-02', 1],
      ['P-1004', '2026-02-17', 2],   // outside window, still last-sale history
      ['P-1020', '2026-01-10', 2],
      ['P-1020', '2025-12-12', 1],
      ['P-1025', '2026-03-09', 1],   // before 2026-03-18 -> outside window
      ['P-1019', '2026-09-13', 21],
      ['P-1019', '2026-09-05', 17],
    ],
  };
  const rows = computeVelocity(snapshot, sales);
  const byId = Object.fromEntries(rows.map((r) => [r.productId, r]));

  assert.equal(byId['P-1004'].velocity, 'slow-moving');
  assert.equal(byId['P-1004'].unitsInWindow, 1);
  assert.equal(byId['P-1004'].daysSinceLastSale, 165);

  assert.equal(byId['P-1020'].velocity, 'no-sales');
  assert.equal(byId['P-1020'].unitsInWindow, 0);
  assert.equal(byId['P-1020'].lastSaleDate, '2026-01-10');

  assert.equal(byId['P-1025'].velocity, 'no-sales');
  assert.equal(byId['P-1025'].unitsInWindow, 0);
  assert.equal(byId['P-1025'].daysSinceLastSale, 189);

  assert.equal(byId['P-1019'].velocity, 'fast');
  assert.equal(byId['P-1019'].unitsInWindow, 38);

  for (const r of rows) {
    assert.match(r.productId, /^P-10\d\d$/); // canonical ID preserved everywhere
  }
});
