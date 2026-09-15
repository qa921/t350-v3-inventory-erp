import type {
  AliasFile,
  ChannelListings,
  InventorySnapshot,
  PricingPolicy,
  SalesHistory,
  VelocityRow,
} from './types.js';
import { computeVelocity } from './velocity.js';
import { matchGradesByCanonicalId } from './aliases.js';
import { fetchWithTimeout, mountWidget } from './widgets.js';
import { toCSV, downloadCSV } from './csv.js';
import { renderInteractiveTable, escapeHtml } from './table.js';
import { compareAllChannels, type ChannelRow } from './channels.js';
import { computeInventoryHealth, type InventoryRow } from './inventory.js';

const PATHS = {
  inventory: 'data/inventory-snapshot.json',
  sales: 'data/sales-history.json',
  aliases: 'data/product-aliases.json',
  policy: 'config/pricing-policy.json',
  listings: 'artifacts/channel-listings.json',
} as const;

/* NOTE: artifacts/prior-ui-cache.json is intentionally NOT loaded. It is an
   untrusted stale artifact whose velocity labels contradict the current
   source views and it contains a non-canonical identifier (legacy-ORCHID). */

const fmtUSD = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function csvButton(label: string, filename: string, csv: () => string): HTMLElement {
  const btn = el('button', 'csv-btn', label);
  btn.addEventListener('click', () => downloadCSV(filename, csv()));
  return btn;
}

/* ---------------- Velocity widget ---------------- */

const VELOCITY_ORDER = { 'no-sales': 0, 'slow-moving': 1, steady: 2, fast: 3 } as const;

async function velocityWidget(container: HTMLElement, timeoutMs: number): Promise<void> {
  const [snapshotRaw, salesRaw, aliasesRaw] = await Promise.all([
    fetchWithTimeout(PATHS.inventory, timeoutMs),
    fetchWithTimeout(PATHS.sales, timeoutMs),
    fetchWithTimeout(PATHS.aliases, timeoutMs),
  ]);
  const snapshot = snapshotRaw as InventorySnapshot;
  const sales = salesRaw as SalesHistory;
  const grades = matchGradesByCanonicalId(aliasesRaw as AliasFile);
  const rows = computeVelocity(snapshot, sales, grades).sort(
    (a, b) => VELOCITY_ORDER[a.velocity] - VELOCITY_ORDER[b.velocity],
  );

  const counts = { 'no-sales': 0, 'slow-moving': 0, steady: 0, fast: 0 };
  for (const r of rows) counts[r.velocity] += 1;

  container.textContent = '';

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

  container.appendChild(
    csvButton('Export velocity CSV (canonical IDs)', 'velocity-report.csv', () =>
      toCSV(
        ['productId', 'name', 'sku', 'velocity', 'unitsInWindow', 'lastSaleDate',
         'daysSinceLastSale', 'onHand', 'status', 'matchType', 'sources'],
        rows.map((r) => [
          r.productId, r.name, r.sku, r.velocity, r.unitsInWindow, r.lastSaleDate,
          r.daysSinceLastSale, r.onHand, r.status, r.matchType, r.sources.join(' + '),
        ]),
      ),
    ),
  );

  renderInteractiveTable<VelocityRow>(container, {
    pageSize: 10,
    searchPlaceholder: 'Search by ID, name, SKU, class or tag\u2026',
    searchText: (r) => `${r.productId} ${r.name} ${r.sku} ${r.velocity} ${r.tags.join(' ')}`,
    columns: [
      { key: 'id', label: 'Canonical ID', value: (r) => r.productId },
      { key: 'name', label: 'Product', value: (r) => r.name },
      { key: 'velocity', label: 'Velocity', value: (r) => r.velocity },
      { key: 'units', label: 'Units (180d)', value: (r) => String(r.unitsInWindow), rawValue: (r) => r.unitsInWindow },
      { key: 'lastSale', label: 'Last sale', value: (r) => r.lastSaleDate ?? 'never' },
      { key: 'days', label: 'Days since sale', value: (r) => (r.daysSinceLastSale === null ? 'n/a' : String(r.daysSinceLastSale)), rawValue: (r) => r.daysSinceLastSale ?? -1 },
      { key: 'onHand', label: 'On hand', value: (r) => String(r.onHand), rawValue: (r) => r.onHand },
      { key: 'match', label: 'Match grade', value: (r) => r.matchType },
    ],
    detailHtml: (r) =>
      `<dl class="detail-list">` +
      `<dt>SKU</dt><dd>${escapeHtml(r.sku)}</dd>` +
      `<dt>Status</dt><dd>${escapeHtml(r.status)}</dd>` +
      `<dt>Tags</dt><dd>${r.tags.map((t) => `<span class="sku-tag">${escapeHtml(t)}</span>`).join(' ')}</dd>` +
      `<dt>Sources</dt><dd>${escapeHtml(r.sources.join(' + '))}</dd>` +
      `<dt>Match grade</dt><dd>${escapeHtml(r.matchType)}</dd>` +
      `<dt>Window</dt><dd>2026-03-18 \u2192 ${escapeHtml(snapshot.snapshotDate)} (180 days)</dd>` +
      `</dl>`,
  });
}

/* ---------------- Unified price comparison widget ---------------- */

function channelFlags(r: ChannelRow): string {
  const flags: string[] = [];
  if (r.basis === 'simulated') flags.push('simulated');
  if (r.costDefaulted) flags.push('cost defaulted');
  if (r.matchType === 'inferred') flags.push('inferred match');
  if (r.matchType === 'none') flags.push('unmatched label');
  return flags.join('; ') || '\u2014';
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
  const rows = compareAllChannels(
    listingsFile,
    policy,
    aliasesRaw as AliasFile,
    snapshotRaw as InventorySnapshot,
  );

  container.textContent = '';

  container.appendChild(el('p', 'artifact-warning', `\u26A0 ${listingsFile.warning}`));
  container.appendChild(
    el(
      'p',
      'window-note',
      `Policy ${policy.version}: every product evaluated across all ` +
        `${Object.keys(policy.channels).length} channels with the same USD price/cost base; ` +
        `risk buffer ${policy.riskBufferRate * 100}%; missing cost \u2192 ${policy.defaultMissingCost} (flagged), ` +
        `missing channel fee rate \u2192 ${policy.defaultMissingChannelFeeRate} (flagged), never excluded. ` +
        `Rows marked 'simulated' apply shared assumptions, not a real listing.`,
    ),
  );

  container.appendChild(
    csvButton('Export price comparison CSV (canonical IDs)', 'price-comparison.csv', () =>
      toCSV(
        ['productId', 'label', 'channel', 'basis', 'priceUSD', 'costUSD', 'costDefaulted',
         'feeRateUsed', 'feeUSD', 'netUSD', 'netAfterRiskUSD', 'marginPct', 'isBest',
         'matchType', 'evidence', 'source'],
        rows.map((r) => [
          r.productId, r.label, r.channel, r.basis, r.priceUSD.toFixed(4), r.costUSD.toFixed(4),
          r.costDefaulted ? 'yes' : 'no', r.feeRateUsed, r.feeUSD.toFixed(4), r.netUSD.toFixed(4),
          r.netAfterRiskUSD.toFixed(4), r.marginPct.toFixed(4), r.isBest ? 'yes' : 'no',
          r.matchType, r.evidence, r.source,
        ]),
      ),
    ),
  );

  renderInteractiveTable<ChannelRow>(container, {
    pageSize: 15,
    searchPlaceholder: 'Search by ID, label, channel or flag\u2026',
    searchText: (r) =>
      `${r.productId ?? ''} ${r.label} ${r.channel} ${r.basis} ${channelFlags(r)}`,
    columns: [
      { key: 'id', label: 'Canonical ID', value: (r) => r.productId ?? '\u2014' },
      { key: 'label', label: 'Product label', value: (r) => r.label },
      { key: 'channel', label: 'Channel', value: (r) => r.channel },
      { key: 'basis', label: 'Basis', value: (r) => r.basis },
      { key: 'price', label: 'Price (USD)', value: (r) => fmtUSD(r.priceUSD), rawValue: (r) => r.priceUSD },
      { key: 'fee', label: 'Fee (USD)', value: (r) => fmtUSD(r.feeUSD), rawValue: (r) => r.feeUSD },
      { key: 'net', label: 'Net (USD)', value: (r) => fmtUSD(r.netUSD), rawValue: (r) => r.netUSD },
      { key: 'netRisk', label: 'Net after risk', value: (r) => fmtUSD(r.netAfterRiskUSD), rawValue: (r) => r.netAfterRiskUSD },
      { key: 'margin', label: 'Margin', value: (r) => fmtPct(r.marginPct), rawValue: (r) => r.marginPct },
      { key: 'best', label: 'Best', value: (r) => (r.isBest ? '\u2605' : '') },
      { key: 'flags', label: 'Flags', value: channelFlags },
    ],
    detailHtml: (r) =>
      `<dl class="detail-list">` +
      `<dt>Match grade</dt><dd>${escapeHtml(r.matchType)}</dd>` +
      `<dt>Evidence</dt><dd>${escapeHtml(r.evidence)}</dd>` +
      `<dt>Cost (USD)</dt><dd>${escapeHtml(fmtUSD(r.costUSD))}${r.costDefaulted ? ' <em>(defaulted to policy defaultMissingCost)</em>' : ''}</dd>` +
      `<dt>Fee rate used</dt><dd>${escapeHtml(String(r.feeRateUsed))}</dd>` +
      `<dt>Source</dt><dd>${escapeHtml(r.source)}</dd>` +
      `</dl>`,
  });
}

/* ---------------- Inventory widget ---------------- */

async function inventoryWidget(container: HTMLElement, timeoutMs: number): Promise<void> {
  const snapshotRaw = await fetchWithTimeout(PATHS.inventory, timeoutMs);
  const snapshot = snapshotRaw as InventorySnapshot;
  const rows = computeInventoryHealth(snapshot);

  const outOfStock = rows.filter((r) => r.health === 'out-of-stock').length;
  const belowReorder = rows.filter((r) => r.health === 'below-reorder').length;

  container.textContent = '';

  const summary = el('div', 'summary-cards');
  const chips: [number, string, string][] = [
    [outOfStock, 'Out of stock', 'summary-card summary-card--no-sales'],
    [belowReorder, 'Below reorder point', 'summary-card summary-card--slow'],
    [rows.length, 'Tracked SKUs', 'summary-card'],
  ];
  for (const [count, label, cls] of chips) {
    const card = el('div', cls);
    card.appendChild(el('div', 'summary-card__count', String(count)));
    card.appendChild(el('div', 'summary-card__label', label));
    summary.appendChild(card);
  }
  container.appendChild(summary);

  container.appendChild(
    el('p', 'window-note', `Snapshot ${snapshot.snapshotDate} from ${snapshot.source}. Available = on-hand \u2212 reserved.`),
  );

  container.appendChild(
    csvButton('Export inventory CSV (canonical IDs)', 'inventory-health.csv', () =>
      toCSV(
        ['productId', 'name', 'sku', 'tags', 'onHand', 'reserved', 'available',
         'reorderPoint', 'status', 'health', 'source'],
        rows.map((r) => [
          r.productId, r.name, r.sku, r.tags.join('|'), r.onHand, r.reserved, r.available,
          r.reorderPoint, r.status, r.health, r.source,
        ]),
      ),
    ),
  );

  renderInteractiveTable<InventoryRow>(container, {
    pageSize: 10,
    searchPlaceholder: 'Search by ID, name, SKU or tag\u2026',
    searchText: (r) => `${r.productId} ${r.name} ${r.sku} ${r.tags.join(' ')} ${r.health}`,
    columns: [
      { key: 'id', label: 'Canonical ID', value: (r) => r.productId },
      { key: 'name', label: 'Product', value: (r) => r.name },
      { key: 'sku', label: 'SKU', value: (r) => r.sku },
      { key: 'onHand', label: 'On hand', value: (r) => String(r.onHand), rawValue: (r) => r.onHand },
      { key: 'reserved', label: 'Reserved', value: (r) => String(r.reserved), rawValue: (r) => r.reserved },
      { key: 'available', label: 'Available', value: (r) => String(r.available), rawValue: (r) => r.available },
      { key: 'reorder', label: 'Reorder point', value: (r) => String(r.reorderPoint), rawValue: (r) => r.reorderPoint },
      { key: 'health', label: 'Health', value: (r) => r.health },
    ],
    detailHtml: (r) =>
      `<dl class="detail-list">` +
      `<dt>Tags</dt><dd>${r.tags.map((t) => `<span class="sku-tag">${escapeHtml(t)}</span>`).join(' ')}</dd>` +
      `<dt>Status</dt><dd>${escapeHtml(r.status)}</dd>` +
      `<dt>Source</dt><dd>${escapeHtml(r.source)} (snapshot ${escapeHtml(snapshot.snapshotDate)})</dd>` +
      `</dl>`,
  });
}

/* ---------------- Navigation (desktop + mobile) ---------------- */

function setupNav(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav-links a'));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section'));
  const toggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');

  const show = (id: string): void => {
    const target = sections.some((s) => s.id === `section-${id}`) ? id : 'velocity';
    for (const s of sections) s.hidden = s.id !== `section-${target}`;
    for (const a of links) a.classList.toggle('active', a.getAttribute('href') === `#${target}`);
  };

  window.addEventListener('hashchange', () => show(location.hash.replace('#', '')));
  for (const a of links) {
    a.addEventListener('click', () => navLinks?.classList.remove('open'));
  }
  toggle?.addEventListener('click', () => {
    const open = navLinks?.classList.toggle('open') ?? false;
    toggle.setAttribute('aria-expanded', String(open));
  });

  show(location.hash.replace('#', '') || 'velocity');
}

/* ---------------- Bootstrap: widgets mounted independently ---------------- */

setupNav();
void mountWidget('velocity-widget', 8000, (ctx) => velocityWidget(ctx.container, ctx.timeoutMs));
void mountWidget('price-widget', 8000, (ctx) => priceWidget(ctx.container, ctx.timeoutMs));
void mountWidget('inventory-widget', 8000, (ctx) => inventoryWidget(ctx.container, ctx.timeoutMs));
