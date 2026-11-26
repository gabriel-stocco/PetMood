/**
 * Web vs. Android (Capacitor) differences in one place.
 *
 * On the web the app is served by the Cloud Run server, so `/api/*` is same-origin.
 * In the APK the UI is bundled (origin https://localhost), so API calls and photo URLs
 * must point at the Cloud Run server instead.
 */
import { Capacitor } from '@capacitor/core';

export const IS_NATIVE = Capacitor.isNativePlatform();

const DEFAULT_NATIVE_API_BASE = 'https://petmood-200705042850.us-east1.run.app';

export const API_BASE: string = IS_NATIVE
  ? String(import.meta.env.VITE_API_BASE || DEFAULT_NATIVE_API_BASE).replace(/\/+$/, '')
  : '';

const FILE_PREFIX = '/api/files/';

/** `/api/login` -> `https://<cloud run>/api/login` in the APK; unchanged on the web. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Deep-copies API data, rewriting stored photo paths (`/api/files/...`).
 * - 'in':  relative -> absolute, so <img> tags load from Cloud Run inside the APK.
 * - 'out': absolute -> relative, so the backend always receives the stored form.
 * No-op on the web.
 */
export function rewriteFileUrls<T>(value: T, direction: 'in' | 'out'): T {
  if (!API_BASE) return value;
  const absolutePrefix = `${API_BASE}${FILE_PREFIX}`;
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (direction === 'in' && v.startsWith(FILE_PREFIX)) return `${API_BASE}${v}`;
      if (direction === 'out' && v.startsWith(absolutePrefix)) return v.slice(API_BASE.length);
      return v;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = visit(item);
      return out;
    }
    return v;
  };
  return visit(value) as T;
}
