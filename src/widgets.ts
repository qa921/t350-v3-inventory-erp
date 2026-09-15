/**
 * Per-widget isolation: each widget fetches its secondary queries through
 * fetchWithTimeout and renders its own loading / error / timeout state.
 * A failure in one widget never blocks the others.
 */

export class WidgetQueryError extends Error {
  constructor(
    message: string,
    public readonly kind: 'http' | 'timeout' | 'parse' | 'network',
  ) {
    super(message);
    this.name = 'WidgetQueryError';
  }
}

export async function fetchWithTimeout(
  path: string,
  timeoutMs = 8000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(path, { signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new WidgetQueryError(`Timed out after ${timeoutMs}ms: ${path}`, 'timeout');
      }
      throw new WidgetQueryError(`Network error for ${path}: ${String(err)}`, 'network');
    }
    if (!res.ok) {
      throw new WidgetQueryError(`HTTP ${res.status} for ${path}`, 'http');
    }
    try {
      return await res.json();
    } catch (err) {
      throw new WidgetQueryError(`Invalid JSON from ${path}: ${String(err)}`, 'parse');
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface WidgetContext {
  container: HTMLElement;
  timeoutMs: number;
}

/**
 * Mount a widget with isolated error handling. The loader performs all of the
 * widget's queries; the renderer draws the result. Errors are caught here and
 * rendered inside the widget's own container.
 */
export async function mountWidget(
  containerId: string,
  timeoutMs: number,
  loader: (ctx: WidgetContext) => Promise<void>,
): Promise<void> {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.classList.add('widget--loading');
  container.textContent = 'Loading\u2026';
  try {
    await loader({ container, timeoutMs });
    container.classList.remove('widget--loading');
  } catch (err) {
    container.classList.remove('widget--loading');
    container.classList.add('widget--error');
    const isTimeout = err instanceof WidgetQueryError && err.kind === 'timeout';
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'widget-error-box';
    box.setAttribute('role', 'alert');
    box.textContent = `${isTimeout ? 'Query timeout' : 'Widget error'}: ${
      err instanceof Error ? err.message : String(err)
    }`;
    container.appendChild(box);
  }
}
