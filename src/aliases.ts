import type {
  AliasFile,
  CanonicalProductId,
  InventorySnapshot,
  MatchType,
  ProductAlias,
} from './types.js';

export interface AliasResolution {
  productId: CanonicalProductId | null;
  matchType: MatchType | 'none';
  evidence: string;
}

/** Index marketplace alias labels from data/product-aliases.json. */
export function buildAliasIndex(aliasFile: AliasFile): Map<string, ProductAlias> {
  const index = new Map<string, ProductAlias>();
  for (const a of aliasFile.aliases) index.set(a.alias, a);
  return index;
}

/**
 * Resolve a marketplace listing label to a canonical product ID.
 * Order: (1) alias export with its declared match grade (exact = SKU evidence,
 * inferred = name similarity only); (2) exact product-name match against the
 * inventory snapshot; (3) unresolved -> productId null, never guessed.
 */
export function resolveLabel(
  label: string,
  aliasIndex: Map<string, ProductAlias>,
  snapshot: InventorySnapshot,
): AliasResolution {
  const aliased = aliasIndex.get(label);
  if (aliased) {
    return {
      productId: aliased.canonicalProductId,
      matchType: aliased.matchType,
      evidence: aliased.evidence,
    };
  }
  const direct = snapshot.records.find((r) => r.name === label);
  if (direct) {
    return {
      productId: direct.productId,
      matchType: 'exact',
      evidence: 'exact product-name match to inventory snapshot (not present in alias export)',
    };
  }
  return { productId: null, matchType: 'none', evidence: 'no alias or name match' };
}

/** Map canonical ID -> best available match grade for display in the velocity table. */
export function matchGradesByCanonicalId(aliasFile: AliasFile): Map<CanonicalProductId, MatchType> {
  const grades = new Map<CanonicalProductId, MatchType>();
  for (const a of aliasFile.aliases) {
    if (a.matchType === 'exact' || !grades.has(a.canonicalProductId)) {
      grades.set(a.canonicalProductId, a.matchType);
    }
  }
  return grades;
}
