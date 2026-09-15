import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUSD, channelFeeUSD, priceListing } from '../dist/pricing.js';

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

const exact = { productId: 'P-1001', matchType: 'exact', evidence: 'sku ATM-12-SGE' };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('FX conversion uses policy rates', () => {
  close(toUSD(42, 'EUR', policy), 45.78);
  close(toUSD(21, 'CAD', policy), 15.54);
  assert.throws(() => toUSD(10, 'JPY', policy), /No FX rate/);
});

test('web listing: Aster 12 Sage — hand-verified net', () => {
  // price 18.5 USD; fee = 18.5*0.029 + 0.30 = 0.8365; cost 7.2
  // net = 10.4635; after 4% risk buffer = 10.04496; margin = 10.4635/18.5
  const row = priceListing(['Aster 12 Sage', 'web', 18.5, 7.2, 'USD'], policy, exact, 'test');
  close(row.priceUSD, 18.5);
  close(row.feeUSD, 0.8365);
  close(row.netUSD, 10.4635);
  close(row.netAfterRiskUSD, 10.04496);
  close(row.marginPct, 10.4635 / 18.5);
  assert.equal(row.costDefaulted, false);
  assert.equal(row.productId, 'P-1001');
});

test('etsy listing in EUR converts price, cost and applies fixed fee', () => {
  // Pour over quartz: 42 EUR -> 45.78 USD; cost 18.3 EUR -> 19.947 USD
  // fee = 45.78*0.065 + 0.20 = 3.1757; net = 22.6573
  const row = priceListing(['Pour over quartz', 'etsy', 42, 18.3, 'EUR'], policy, { ...exact, productId: 'P-1018' }, 'test');
  close(row.priceUSD, 45.78);
  close(row.costUSD, 19.947);
  close(row.feeUSD, 3.1757);
  close(row.netUSD, 22.6573);
});

test('missing raw cost defaults to 0 and is flagged, not excluded', () => {
  // Plant mister amber: 21 CAD -> 15.54 USD; rawUnitCost 0 -> defaultMissingCost
  // fee = 15.54*0.15 = 2.331; net = 13.209; after risk = 12.68064
  const row = priceListing(['Plant mister amber', 'amazon', 21, 0, 'CAD'], policy, { ...exact, productId: 'P-1025', matchType: 'inferred' }, 'test');
  close(row.priceUSD, 15.54);
  close(row.feeUSD, 2.331);
  close(row.netUSD, 13.209);
  close(row.netAfterRiskUSD, 12.68064);
  assert.equal(row.costDefaulted, true);
  assert.equal(row.costUSD, 0);
});

test('unknown channel falls back to defaultMissingChannelFeeRate', () => {
  const { feeUSD, feeRateUsed, feeDefaulted } = channelFeeUSD('tiktok-shop', 100, policy);
  close(feeUSD, 15);
  close(feeRateUsed, 0.15);
  assert.equal(feeDefaulted, true);
});
