/** Generic interactive table: search, sort, pagination, collapsible detail rows. */

export interface ColumnDef<T> {
  key: string;
  label: string;
  value: (row: T) => string;
  rawValue?: (row: T) => number | string;
}

export interface TableSpec<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  pageSize: number;
  searchPlaceholder: string;
  searchText: (row: T) => string;
  detailHtml?: (row: T) => string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInteractiveTable<T>(container: HTMLElement, spec: TableSpec<T>): void {
  const state = {
    query: '',
    sortKey: null as string | null,
    sortAsc: true,
    page: 0,
    open: new Set<number>(),
  };

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'table-search';
  search.placeholder = spec.searchPlaceholder;
  search.setAttribute('aria-label', spec.searchPlaceholder);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';

  const pager = document.createElement('div');
  pager.className = 'pager';

  container.appendChild(search);
  container.appendChild(tableWrap);
  container.appendChild(pager);

  function filteredRows(): T[] {
    let rows = spec.rows;
    if (state.query) {
      const q = state.query.toLowerCase();
      rows = rows.filter((r) => spec.searchText(r).toLowerCase().includes(q));
    }
    if (state.sortKey) {
      const col = spec.columns.find((c) => c.key === state.sortKey);
      if (col) {
        const get = col.rawValue ?? col.value;
        rows = [...rows].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb));
          return state.sortAsc ? cmp : -cmp;
        });
      }
    }
    return rows;
  }

  function render(): void {
    const rows = filteredRows();
    const pageCount = Math.max(1, Math.ceil(rows.length / spec.pageSize));
    if (state.page >= pageCount) state.page = pageCount - 1;
    const pageRows = rows.slice(state.page * spec.pageSize, (state.page + 1) * spec.pageSize);

    tableWrap.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    if (spec.detailHtml) {
        const th = document.createElement('th');
        th.className = 'toggle-col';
        htr.appendChild(th);
    }
    for (const col of spec.columns) {
      const th = document.createElement('th');
      const btn = document.createElement('button');
      btn.className = 'sort-btn';
      btn.textContent =
        col.label + (state.sortKey === col.key ? (state.sortAsc ? ' \u25B2' : ' \u25BC') : '');
      btn.addEventListener('click', () => {
        if (state.sortKey === col.key) state.sortAsc = !state.sortAsc;
        else {
          state.sortKey = col.key;
          state.sortAsc = true;
        }
        state.page = 0;
        render();
      });
      th.appendChild(btn);
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of pageRows) {
      const rowIdx = spec.rows.indexOf(row);
      const tr = document.createElement('tr');
      if (spec.detailHtml) {
        const td = document.createElement('td');
        td.className = 'toggle-col';
        const toggle = document.createElement('button');
        const isOpen = state.open.has(rowIdx);
        toggle.className = 'row-toggle';
        toggle.textContent = isOpen ? '\u25BE' : '\u25B8';
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', 'Toggle row details');
        toggle.addEventListener('click', () => {
          if (state.open.has(rowIdx)) state.open.delete(rowIdx);
          else state.open.add(rowIdx);
          render();
        });
        td.appendChild(toggle);
        tr.appendChild(td);
      }
      for (const col of spec.columns) {
        const td = document.createElement('td');
        td.textContent = col.value(row);
        td.setAttribute('data-label', col.label);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
      if (spec.detailHtml && state.open.has(rowIdx)) {
        const dtr = document.createElement('tr');
        dtr.className = 'detail-row';
        const dtd = document.createElement('td');
        dtd.colSpan = spec.columns.length + 1;
        dtd.innerHTML = spec.detailHtml(row);
        dtr.appendChild(dtd);
        tbody.appendChild(dtr);
      }
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    pager.innerHTML = '';
    const prev = document.createElement('button');
    prev.textContent = '\u2039 Prev';
    prev.disabled = state.page === 0;
    prev.addEventListener('click', () => {
      state.page -= 1;
      render();
    });
    const info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = `Page ${state.page + 1} of ${pageCount} \u2014 ${rows.length} rows`;
    const next = document.createElement('button');
    next.textContent = 'Next \u203A';
    next.disabled = state.page >= pageCount - 1;
    next.addEventListener('click', () => {
      state.page += 1;
      render();
    });
    pager.appendChild(prev);
    pager.appendChild(info);
    pager.appendChild(next);
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    state.page = 0;
    render();
  });

  render();
}
