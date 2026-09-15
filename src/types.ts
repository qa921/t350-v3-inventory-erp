/** Canonical source-state types for M-T556-V4. Product IDs are P-1001..P-1025. */

export type CanonicalProductId = string;

export interface InventoryRecord {
  productId: CanonicalProductId;
  name: string;
  sku: string;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  status: string;
  tags: string[];
  updatedAt: string;
}

export interface InventorySnapshot {
  snapshotDate: string;
  source: string;
  records: InventoryRecord[];
}

/** Tuple: [canonicalProductId, orderDate(ISO), units] */
export type SaleRecord = [CanonicalProductId, string, number];

export interface SalesHistory {
  source: string;
  extractedAt: string;
  records: SaleRecord[];
}

export type MatchType = 'exact' | 'inferred';

export interface ProductAlias {
  alias: string;
  canonicalProductId: CanonicalProductId;
  matchType: MatchType;
  evidence: string;
}

export interface AliasFile {
  source: string;
  aliases: ProductAlias[];
}

/** Tuple: [sourceProductLabel, channel, listedPrice, rawUnitCost, listingCurrency] */
export type ChannelListing = [string, string, number, number, string];

export interface ChannelListings {
  exportedAt: string;
  warning: string;
  listings: ChannelListing[];
  rowShape: string;
  knownGaps: string;
}

export interface ChannelPolicy {
  feeRate: number;
  fixedFee: number;
  currency: string;
}

export interface PricingPolicy {
  version: string;
  currency: string;
  defaultMissingCost: number;
  defaultMissingChannelFeeRate: number;
  fxRates: Record<string, number>;
  riskBufferRate: number;
  approvalVarianceRate: number;
  channels: Record<string, ChannelPolicy>;
  notes: string;
}

export type VelocityClass = 'no-sales' | 'slow-moving' | 'steady' | 'fast';

export interface VelocityRow {
  productId: CanonicalProductId;
  name: string;
  sku: string;
  onHand: number;
  status: string;
  tags: string[];
  unitsInWindow: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  velocity: VelocityClass;
  matchType: MatchType | 'none';
  sources: string[];
}

export interface PriceRow {
  productId: CanonicalProductId | null;
  label: string;
  channel: string;
  listedPrice: number;
  currency: string;
  priceUSD: number;
  costUSD: number;
  costDefaulted: boolean;
  feeRateUsed: number;
  feeDefaulted: boolean;
  feeUSD: number;
  netUSD: number;
  netAfterRiskUSD: number;
  marginPct: number;
  matchType: MatchType | 'none';
  evidence: string;
  source: string;
}
