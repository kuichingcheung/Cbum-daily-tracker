/**
 * Browser diet loader. Tries the public read API, then the repo JSON.
 * The fallback keeps GitHub Pages working until Turso is published.
 */

import { DIET_API_ORIGIN } from './config.js';
import { loadDataFile } from './github.js';

export function dietApiUrls(href, origin = DIET_API_ORIGIN) {
  const page = new URL(href);
  const host = page.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local) return [new URL('/api/diet', page.origin).href];
  if (host === 'github.io' || host.endsWith('.github.io')) {
    return [new URL('/api/diet', origin).href];
  }
  return [new URL('/api/diet', page.origin).href];
}

export function isDietDocument(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!data.rules || typeof data.rules !== 'object' || Array.isArray(data.rules)) return false;
  if (!Array.isArray(data.days) || data.days.length === 0) return false;
  return data.days.every((day) => (
    day
    && typeof day === 'object'
    && typeof day.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
  ));
}

export async function loadDiet({
  settings,
  href,
  fetchImpl = fetch,
  now = Date.now,
  origin = DIET_API_ORIGIN,
} = {}) {
  const urls = dietApiUrls(href || 'http://127.0.0.1/', origin);
  for (const url of urls) {
    try {
      const stamped = new URL(url);
      stamped.searchParams.set('t', String(now()));
      const res = await fetchImpl(stamped.href, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const type = res.headers?.get?.('content-type') || '';
      if (!res.ok || !type.includes('application/json')) continue;
      const data = await res.json();
      if (isDietDocument(data)) return { data, source: 'api' };
    } catch {
      /* try the repo copy */
    }
  }

  const data = await loadDataFile('diet.json', settings, fetchImpl);
  return { data, source: 'fallback' };
}
