import type {
  AliasFile,
  ChannelListings,
  InventorySnapshot,
  PricingPolicy,
  SalesHistory,
  VelocityRow,
  PriceRow,
} from './types.js';
import { computeVelocity } from './velocity.js';
import { priceListing } from './pricing.js';
import { buildAliasIndex, matchGradesByCanonicalId, resolveLabel } from './aliases.js';
import { fetchWithTimeout, mountWidget } from './widgets.js';
import { toCSV, downloadCSV } from './csv.js';

const PATHS = {
  inventory: 'data/inventory-snapshot.json',
  sales: 'data/sales-history.json',
  aliases: 'data/product-aliases.json',
  policy: 'config/pricing-policy.json',
  listings: 'artifacts/channel-listings.json',
} as const;

/* NOTE: artifacts/prior-ui-cache.json is intentionally NOT loaded. It is an
   untrusted stale artifact whose velocity labels contradict the current
   source views (e.g. it calls P-1008/P-1022 "fast") and it contains a
   non-canonical identifier (legacy-ORCHID). */

const fmtUSD = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTable(container: HTMLElement, headers: string[], rows: string[][]): void {
  const table = el('table', 'data-table');
  const thead = el('thead');
  const htr = el('tr');
  for (const h of headers) htr.appendChild(el('th', undefined, h));
  thead.appendChild(htr);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const cell of row) tr.appendChild(el('td', undefined, cell));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/* ---------------- Velocity widget ---------------- */

function velocityRowsForCSV(rows: VelocityRow[]): (string | number | null)[][] {
  return rows.map((r) => [
    r.productId, // canonical ID first, same as on screen
    r.name,
    r.sku,
    r.velocity,
    r.unitsInWindow,
    r.lastSaleDate,
    r.daysSinceLastSale,
    r.onHand,
    r.status,
    r.matchType,
    r.sources.join(' + '),
  ]);
}

async function velocityWidget(container: HTMLElement, timeoutMs: number): Promise<void> {
  const [snapshotRaw, salesRaw, aliasesRaw] = await Promise.all([
    fetchWithTimeout(PATHS.inventory, timeoutMs),
    fetchWithTimeout(PATHS.sales, timeoutMs),
    fetchWithTimeout(PATHS.aliases, timeoutMs),
  ]);
  const snapshot = snapshotRaw as InventorySnapshot;
  const sales = salesRaw as SalesHistory;
  const grades = matchGradesByCanonicalId(aliasesRaw as AliasFile);
  const rows = computeVelocity(snapshot, sales, grades);

  const counts = { 'no-sales': 0, 'slow-moving': 0, steady: 0, fast: 0 };
  for (const r of rows) counts[r.velocity] += 1;

  container.textContent = '';

  // Summary cards: No sales and Slow-moving are the prominent ones.
  const summary = el('div', 'summary-cards');
  const cardSpec: [keyof typeof counts, string, string][] = [
    ['no-sales', 'No sales', 'summary-card summary-card--no-sales'],
    ['slow-moving', 'Slow-moving', 'summary-card summary-card--slow'],
    ['steady', 'Steady', 'summary-card'],
    ['fast', 'Fast', 'summary-card'],
  ];
  for (const [key, label, cls] of cardSpec) {
    const card = el('div', cls);
    card.appendChild(el('div', 'summary-card__count', String(counts[key])));
    card.appendChild(el('div', 'summary-card__label', label));
    summary.appendChild(card);
  }
  container.appendChild(summary);

  container.appendChild(
    el(
      'p',
      'window-note',
      `180-day window ending ${snapshot.snapshotDate} (starts 2026-03-18). ` +
        `Sources: ${snapshot.source}, ${sales.source} (extracted ${sales.extractedAt}).`,
    ),
  );

  const exportBtn = el('button', 'csv-btn', 'Export velocity CSV (canonical IDs)');
  exportBtn.addEventListener('click', () => {
    downloadCSV(
      'velocity-report.csv',
      toCSV(
        ['productId', 'name', 'sku', 'velocity', 'unitsInWindow', 'lastSaleDate',
         'daysSinceLastSale', 'onHand', 'status', 'matchType', 'sources'],
        velocityRowsForCSV(rows),
      ),
    );
  });
  container.appendChild(exportBtn);

  const order = { 'no-sales': 0, 'slow-moving': 1, steady: 2, fast: 3 } as const;
  const sorted = [...rows].sort((a, b) => order[a.velocity] - order[b.velocity]);
  renderTable(
    container,
    ['Canonical ID', 'Product', 'Velocity', 'Units (180d)', 'Last sale',
     'Days since sale', 'On hand', 'Status', 'Match grade', 'Source'],
    sorted.map((r) => [
      r.productId,
      r.name,
      r.velocity,
      String(r.unitsInWindow),
      r.lastSaleDate ?? 'never',
      r.daysSinceLastSale === null ? 'n/a' : String(r.daysSinceLastSale),
      String(r.onHand),
      r.status,
      r.matchType,
      r.sources.join(' + '),
    ]),
  );
}

/* ---------------- Price comparison widget ---------------- */

function priceRowsForCSV(rows: PriceRow[]): (string | number | null)[][] {
  return rows.map((r) => [
    r.productId, // canonical ID first, same as on screen; null stays empty
    r.label,
    r.channel,
    r.priceUSD.toFixed(4),
    r.costUSD.toFixed(4),
    r.costDefaulted ? 'yes' : 'no',
    r.feeRateUsed,
    r.feeUSD.toFixed(4),
    r.netUSD.toFixed(4),
    r.netAfterRiskUSD.toFixed(4),
    r.marginPct.toFixed(4),
    r.matchType,
    r.evidence,
    r.source,
  ]);
}

async function priceWidget(container: HTMLElement, timeoutMs: number): Promise<void> {
  const [policyRaw, listingsRaw, aliasesRaw, snapshotRaw] = await Promise.all([
    fetchWithTimeout(PATHS.policy, timeoutMs),
    fetchWithTimeout(PATHS.listings, timeoutMs),
    fetchWithTimeout(PATHS.aliases, timeoutMs),
    fetchWithTimeout(PATHS.inventory, timeoutMs),
  ]);
  const policy = policyRaw as PricingPolicy;
  const listingsFile = listingsRaw as ChannelListings;
  const aliasIndex = buildAliasIndex(aliasesRaw as AliasFile);
  const snapshot = snapshotRaw as InventorySnapshot;

  const rows = listingsFile.listings.map((listing) =>
    priceListing(listing, policy, resolveLabel(listing[0], aliasIndex, snapshot), 'channel-listings.json'),
  );

  container.textContent = '';

  // Surface the artifact's own staleness warning instead of hiding it.
  container.appendChild(el('p', 'artifact-warning', `\u26A0 ${listingsFile.warning}`));
  container.appendChild(el('p', 'artifact-warning', `\u26A0 ${listingsFile.knownGaps}`));
  container.appendChild(
    el(
      'p',
      'window-note',
      `Policy ${policy.version}: FX to USD, risk buffer ${policy.riskBufferRate * 100}%, ` +
        `missing cost defaults to ${policy.defaultMissingCost}, missing channel fee rate ` +
        `defaults to ${policy.defaultMissingChannelFeeRate} (never excluded). ` +
        `One prior listing per product - cross-channel comparison needs more channels.`,
    ),
  );

  const exportBtn = el('button', 'csv-btn', 'Export price comparison CSV (canonical IDs)');
  exportBtn.addEventListener('click', () => {
    downloadCSV(
      'price-comparison.csv',
      toCSV(
        ['productId', 'label', 'channel', 'priceUSD', 'costUSD', 'costDefaulted',
         'feeRateUsed', 'feeUSD', 'netUSD', 'netAfterRiskUSD', 'marginPct',
         'matchType', 'evidence', 'source'],
        priceRowsForCSV(rows),
      ),
    );
  });
  container.appendChild(exportBtn);

  renderTable(
    container,
    ['Canonical ID', 'Listing label', 'Channel', 'Price (USD)', 'Cost (USD)',
     'Fee (USD)', 'Net (USD)', 'Net after risk', 'Margin', 'Match grade', 'Flags'],
    rows.map((r) => [
      r.productId ?? '\u2014',
      r.label,
      r.channel,
      fmtUSD(r.priceUSD),
      fmtUSD(r.costUSD),
      fmtUSD(r.feeUSD),
      fmtUSD(r.netUSD),
      fmtUSD(r.netAfterRiskUSD),
      fmtPct(r.marginPct),
      r.matchType,
      [r.costDefaulted ? 'cost defaulted' : '', r.feeDefaulted ? 'fee defaulted' : '']
        .filter(Boolean)
        .join('; ') || '\u2014',
    ]),
  );
}

/* ---------------- Bootstrap: widgets mounted independently ---------------- */

void mountWidget('velocity-widget', 8000, (ctx) => velocityWidget(ctx.container, ctx.timeoutMs));
void mountWidget('price-widget', 8000, (ctx) => priceWidget(ctx.container, ctx.timeoutMs));
