import type {
  CanonicalProductId,
  InventorySnapshot,
  SalesHistory,
  VelocityClass,
  VelocityRow,
} from './types.js';

/** Review window length in days, ending at the inventory snapshot date. */
export const WINDOW_DAYS = 180;

const DAY_MS = 86_400_000;

/** ISO date of the first day inside the review window (inclusive). */
export function windowStart(snapshotDate: string, days: number = WINDOW_DAYS): string {
  const start = new Date(Date.parse(snapshotDate + 'T00:00:00Z') - days * DAY_MS);
  return start.toISOString().slice(0, 10);
}

/**
 * Velocity bands over units sold inside the window:
 *   0 units      -> no-sales
 *   1-2 units    -> slow-moving
 *   3-9 units    -> steady
 *   10+ units    -> fast
 */
export function classify(unitsInWindow: number): VelocityClass {
  if (unitsInWindow <= 0) return 'no-sales';
  if (unitsInWindow <= 2) return 'slow-moving';
  if (unitsInWindow <= 9) return 'steady';
  return 'fast';
}

export function daysBetween(isoDate: string, refDate: string): number {
  return Math.round((Date.parse(refDate + 'T00:00:00Z') - Date.parse(isoDate + 'T00:00:00Z')) / DAY_MS);
}

/**
 * Join inventory snapshot with dated sales facts.
 * Only genuine sales rows are used; nothing is invented for products without sales.
 */
export function computeVelocity(
  snapshot: InventorySnapshot,
  sales: SalesHistory,
  matchGrades: Map<CanonicalProductId, 'exact' | 'inferred'> = new Map(),
): VelocityRow[] {
  const start = windowStart(snapshot.snapshotDate);
  const end = snapshot.snapshotDate;

  const units = new Map<CanonicalProductId, number>();
  const lastSale = new Map<CanonicalProductId, string>();

  for (const [productId, orderDate, qty] of sales.records) {
    const prev = lastSale.get(productId);
    if (!prev || orderDate > prev) lastSale.set(productId, orderDate);
    if (orderDate >= start && orderDate <= end) {
      units.set(productId, (units.get(productId) ?? 0) + qty);
    }
  }

  return snapshot.records.map((rec) => {
    const unitsInWindow = units.get(rec.productId) ?? 0;
    const last = lastSale.get(rec.productId) ?? null;
    return {
      productId: rec.productId,
      name: rec.name,
      sku: rec.sku,
      onHand: rec.onHand,
      status: rec.status,
      tags: rec.tags,
      unitsInWindow,
      lastSaleDate: last,
      daysSinceLastSale: last === null ? null : daysBetween(last, end),
      velocity: classify(unitsInWindow),
      matchType: matchGrades.get(rec.productId) ?? 'none',
      sources: [snapshot.source, sales.source],
    };
  });
}
