import type {
  ChannelListing,
  PriceRow,
  PricingPolicy,
} from './types.js';
import type { AliasResolution } from './aliases.js';

/** Convert a listed amount to USD using policy FX rates (USD = 1). */
export function toUSD(amount: number, currency: string, policy: PricingPolicy): number {
  const rate = policy.fxRates[currency];
  if (rate === undefined) {
    throw new Error(`No FX rate for currency ${currency} in pricing policy ${policy.version}`);
  }
  return amount * rate;
}

/**
 * Channel fee in USD. Per policy: a missing channel fee must fall back to
 * defaultMissingChannelFeeRate (0.15) instead of excluding the listing.
 */
export function channelFeeUSD(
  channel: string,
  priceUSD: number,
  policy: PricingPolicy,
): { feeUSD: number; feeRateUsed: number; feeDefaulted: boolean } {
  const ch = policy.channels[channel];
  if (!ch) {
    return {
      feeUSD: priceUSD * policy.defaultMissingChannelFeeRate,
      feeRateUsed: policy.defaultMissingChannelFeeRate,
      feeDefaulted: true,
    };
  }
  return {
    feeUSD: priceUSD * ch.feeRate + ch.fixedFee,
    feeRateUsed: ch.feeRate,
    feeDefaulted: false,
  };
}

/**
 * Price one marketplace listing under the shared policy.
 * Missing/zero raw unit cost is replaced by defaultMissingCost (0) and flagged,
 * never excluded. Net = price - fee - cost; risk-adjusted net applies the 4%
 * risk buffer. marginPct = net / price.
 */
export function priceListing(
  listing: ChannelListing,
  policy: PricingPolicy,
  resolution: AliasResolution,
  source: string,
): PriceRow {
  const [label, channel, listedPrice, rawUnitCost, currency] = listing;
  const priceUSD = toUSD(listedPrice, currency, policy);
  const costDefaulted = !rawUnitCost;
  const effectiveCost = costDefaulted ? policy.defaultMissingCost : rawUnitCost;
  const costUSD = toUSD(effectiveCost, currency, policy);
  const { feeUSD, feeRateUsed, feeDefaulted } = channelFeeUSD(channel, priceUSD, policy);
  const netUSD = priceUSD - feeUSD - costUSD;
  const netAfterRiskUSD = netUSD * (1 - policy.riskBufferRate);
  return {
    productId: resolution.productId,
    label,
    channel,
    listedPrice,
    currency,
    priceUSD,
    costUSD,
    costDefaulted,
    feeRateUsed,
    feeDefaulted,
    feeUSD,
    netUSD,
    netAfterRiskUSD,
    marginPct: priceUSD === 0 ? 0 : netUSD / priceUSD,
    matchType: resolution.matchType,
    evidence: resolution.evidence,
    source,
  };
}
