import type { InventorySnapshot } from './types.js';

export type InventoryHealth = 'out-of-stock' | 'below-reorder' | 'ok';

export interface InventoryRow {
  productId: string;
  name: string;
  sku: string;
  tags: string[];
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  status: string;
  health: InventoryHealth;
  source: string;
}

/** available = onHand - reserved; out-of-stock when nothing is sellable. */
export function computeInventoryHealth(snapshot: InventorySnapshot): InventoryRow[] {
  return snapshot.records.map((rec) => {
    const available = rec.onHand - rec.reserved;
    const health: InventoryHealth =
      available <= 0 ? 'out-of-stock' : available <= rec.reorderPoint ? 'below-reorder' : 'ok';
    return {
      productId: rec.productId,
      name: rec.name,
      sku: rec.sku,
      tags: rec.tags,
      onHand: rec.onHand,
      reserved: rec.reserved,
      available,
      reorderPoint: rec.reorderPoint,
      status: rec.status,
      health,
      source: snapshot.source,
    };
  });
}
