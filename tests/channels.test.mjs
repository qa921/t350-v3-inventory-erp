import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAllChannels } from '../dist/channels.js';

const policy = {
  version: '2026-08-15',
  currency: 'USD',
  defaultMissingCost: 0,
  defaultMissingChannelFeeRate: 0.15,
  fxRates: { USD: 1, EUR: 1.09, GBP: 1.28, CAD: 0.74 },
  riskBufferRate: 0.04,
  approvalVarianceRate: 0.07,
  channels: {
    web: { feeRate: 0.029, fixedFee: 0.3, currency: 'USD' },
    amazon: { feeRate: 0.15, fixedFee: 0, currency: 'USD' },
    etsy: { feeRate: 0.065, fixedFee: 0.2, currency: 'USD' },
    wholesale: { feeRate: 0.1, fixedFee: 0, currency: 'USD' },
    faire: { feeRate: 0.15, fixedFee: 0, currency: 'USD' },
  },
  notes: '',
};

const snapshot = {
  snapshotDate: '2026-09-14',
  source: 'warehouse-view-v2',
  records: [
    { productId: 'P-1001', name: 'Aster Trail Mug 12oz', sku: 'ATM-12-SGE', onHand: 184, reserved: 8, reorderPoint: 40, status: 'active', tags: ['drinkware', 'evergreen'], updatedAt: '2026-09-13' },
    { productId: 'P-1025', name: 'Xylem Plant Mister', sku: 'XPM-AMB', onHand: 83, reserved: 2, reorderPoint: 22, status: 'active', tags: ['garden', 'slow-candidate'], updatedAt: '2026-09-03' },
  ],
};

const aliasFile = {
  source: 'marketplace-export-2026-09-13',
  aliases: [
    { alias: 'Aster 12 Sage', canonicalProductId: 'P-1001', matchType: 'exact', evidence: 'sku ATM-12-SGE' },
    { alias: 'Plant mister amber', canonicalProductId: 'P-1025', matchType: 'inferred', evidence: 'name/color similarity only' },
  ],
};

const listingsFile = {
  exportedAt: '2026-09-10',
  warning: 'stale',
  listings: [
    ['Aster 12 Sage', 'web', 18.5, 7.2, 'USD'],
    ['Plant mister amber', 'amazon', 21, 0, 'CAD'],
  ],
  rowShape: '',
  knownGaps: '',
};

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('every product is evaluated across all five policy channels', () => {
  const rows = compareAllChannels(listingsFile, policy, aliasFile, snapshot);
  assert.equal(rows.length, 10); // 2 products x 5 channels
  const aster = rows.filter((r) => r.productId === 'P-1001');
  assert.deepEqual(
    aster.map((r) => r.channel).sort(),
    ['amazon', 'etsy', 'faire', 'web', 'wholesale'],
  );
});

test('historical listing row keeps basis=historical; others are simulated', () => {
  const rows = compareAllChannels(listingsFile, policy, aliasFile, snapshot);
  const aster = rows.filter((r) => r.productId === 'P-1001');
  assert.equal(aster.filter((r) => r.basis === 'historical').length, 1);
  assert.equal(aster.find((r) => r.basis === 'historical').channel, 'web');
  assert.equal(aster.filter((r) => r.basis === 'simulated').length, 4);
});

test('hand-verified channel math for Aster 12 Sage (price 18.5, cost 7.2 USD)', () => {
  const rows = compareAllChannels(listingsFile, policy, aliasFile, snapshot);
  const byChannel = Object.fromEntries(
    rows.filter((r) => r.productId === 'P-1001').map((r) => [r.channel, r]),
  );
  close(byChannel.web.netUSD, 10.4635);      // fee 0.8365
  close(byChannel.amazon.netUSD, 8.525);     // fee 2.775
  close(byChannel.etsy.netUSD, 9.8975);      // fee 1.4025
  close(byChannel.wholesale.netUSD, 9.45);   // fee 1.85
  close(byChannel.faire.netUSD, 8.525);      // fee 2.775
  assert.equal(byChannel.web.isBest, true);
  assert.equal(byChannel.amazon.isBest, false);
  assert.equal(byChannel.web.matchType, 'exact');
});

test('defaulted cost and inferred match are tagged on every channel row', () => {
  const rows = compareAllChannels(listingsFile, policy, aliasFile, snapshot);
  const mister = rows.filter((r) => r.productId === 'P-1025');
  assert.equal(mister.length, 5);
  for (const r of mister) {
    assert.equal(r.costDefaulted, true);
    assert.equal(r.costUSD, 0);
    assert.equal(r.matchType, 'inferred');
    close(r.priceUSD, 15.54); // 21 CAD * 0.74
  }
  const hist = mister.find((r) => r.basis === 'historical');
  assert.equal(hist.channel, 'amazon');
  close(hist.netUSD, 13.209); // 15.54 - 2.331 - 0
  // web becomes the best simulated channel for this product
  const best = mister.find((r) => r.isBest);
  assert.equal(best.channel, 'web');
});
