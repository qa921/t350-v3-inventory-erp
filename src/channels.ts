import type {
  AliasFile,
  CanonicalProductId,
  ChannelListings,
  InventorySnapshot,
  MatchType,
  PricingPolicy,
} from './types.js';
import { toUSD } from './pricing.js';
import { buildAliasIndex, resolveLabel } from './aliases.js';

export interface ChannelRow {
  productId: CanonicalProductId | null;
  label: string;
  channel: string;
  /** 'historical' = the one real prior listing; 'simulated' = same inputs under another channel's fees */
  basis: 'historical' | 'simulated';
  priceUSD: number;
  costUSD: number;
  costDefaulted: boolean;
  feeRateUsed: number;
  feeUSD: number;
  netUSD: number;
  netAfterRiskUSD: number;
  marginPct: number;
  isBest: boolean;
  matchType: MatchType | 'none';
  evidence: string;
  source: string;
}

/**
 * Unified comparison: for every product, evaluate ALL channels defined in the
 * pricing policy (web, amazon, etsy, wholesale, faire) - not just the single
 * historical listing row. The shared inputs are the listing's price and cost
 * converted to USD; each channel applies its own feeRate + fixedFee, then the
 * 4% risk buffer. Missing cost defaults to policy.defaultMissingCost (0) and
 * is flagged on every row of that product. A historical channel missing from
 * the policy still gets a row priced with defaultMissingChannelFeeRate.
 */
export function compareAllChannels(
  listingsFile: ChannelListings,
  policy: PricingPolicy,
  aliasFile: AliasFile,
  snapshot: InventorySnapshot,
): ChannelRow[] {
  const aliasIndex = buildAliasIndex(aliasFile);
  const rows: ChannelRow[] = [];

  for (const listing of listingsFile.listings) {
    const [label, histChannel, listedPrice, rawUnitCost, currency] = listing;
    const resolution = resolveLabel(label, aliasIndex, snapshot);

    const priceUSD = toUSD(listedPrice, currency, policy);
    const costDefaulted = !rawUnitCost;
    const costUSD = toUSD(costDefaulted ? policy.defaultMissingCost : rawUnitCost, currency, policy);

    interface PerChannel {
      name: string;
      feeRateUsed: number;
      feeUSD: number;
      netUSD: number;
      netAfterRiskUSD: number;
    }
    const perChannel: PerChannel[] = [];
    for (const name of Object.keys(policy.channels)) {
      const ch = policy.channels[name];
      if (!ch) continue;
      const feeUSD = priceUSD * ch.feeRate + ch.fixedFee;
      const netUSD = priceUSD - feeUSD - costUSD;
      perChannel.push({
        name,
        feeRateUsed: ch.feeRate,
        feeUSD,
        netUSD,
        netAfterRiskUSD: netUSD * (1 - policy.riskBufferRate),
      });
    }
    if (!policy.channels[histChannel]) {
      // Historical channel absent from policy: keep it, priced with the default fee rate.
      const feeUSD = priceUSD * policy.defaultMissingChannelFeeRate;
      const netUSD = priceUSD - feeUSD - costUSD;
      perChannel.push({
        name: histChannel,
        feeRateUsed: policy.defaultMissingChannelFeeRate,
        feeUSD,
        netUSD,
        netAfterRiskUSD: netUSD * (1 - policy.riskBufferRate),
      });
    }

    const bestNet = Math.max(...perChannel.map((c) => c.netUSD));
    for (const c of perChannel) {
      rows.push({
        productId: resolution.productId,
        label,
        channel: c.name,
        basis: c.name === histChannel ? 'historical' : 'simulated',
        priceUSD,
        costUSD,
        costDefaulted,
        feeRateUsed: c.feeRateUsed,
        feeUSD: c.feeUSD,
        netUSD: c.netUSD,
        netAfterRiskUSD: c.netAfterRiskUSD,
        marginPct: priceUSD === 0 ? 0 : c.netUSD / priceUSD,
        isBest: c.netUSD === bestNet,
        matchType: resolution.matchType,
        evidence: resolution.evidence,
        source: 'artifacts/channel-listings.json + config/pricing-policy.json',
      });
    }
  }
  return rows;
}
