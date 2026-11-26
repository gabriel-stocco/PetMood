/**
 * PetMood web server (Cloud Run).
 *
 * - Serves the React app (Vite middleware in dev, ./dist in production).
 * - Proxies /api/* to the AWS API Gateway, adding the shared `x-api-key`.
 *   The browser never sees the AWS URL or the key.
 *
 * Environment variables (Cloud Run):
 *   PETMOOD_API_URL   https://<api-id>.execute-api.sa-east-1.amazonaws.com
 *   PETMOOD_API_KEY   shared key (store as a Secret Manager reference)
 *   GOOGLE_CLIENT_ID  OAuth client id used by the "Entrar com o Google" button
 *   PORT              set by Cloud Run
 */
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Local development: read .env.local if present (Cloud Run injects real env vars).
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: ignore
  }
}

const PORT = Number(process.env.PORT || 3000);
const API_URL = (process.env.PETMOOD_API_URL || '').trim().replace(/\/+$/, '');
const API_KEY = (process.env.PETMOOD_API_KEY || '').trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
// Production = the esbuild bundle (server.js) or NODE_ENV=production; `tsx server.ts` is dev.
const IS_PROD = process.env.NODE_ENV === 'production' || import.meta.url.endsWith('/server.js');
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

const ROUTE_RE = /^[A-Za-z]{1,64}$/;
const FILE_RE = /^[0-9a-f]{32}\.(jpg|png|webp|gif)$/;
const UPSTREAM_TIMEOUT_MS = 30_000;

function notConfigured(res: Response): void {
  res.status(503).json({
    status: 503,
    id_usuario: '',
    message: 'Servidor não configurado (PETMOOD_API_URL / PETMOOD_API_KEY).',
  });
}

function upstreamFailed(res: Response): void {
  res.status(502).json({ status: 502, id_usuario: '', message: 'Não foi possível contatar o servidor.' });
}

async function main(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Google's popup sign-in needs to talk back to this window.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // The Android app (Capacitor) runs the bundled UI at https://localhost and calls this server
  // cross-origin. Only that origin is allowed; the API key still never leaves the server.
  const APP_ORIGINS = new Set(['https://localhost']);
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && APP_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Max-Age', '600');
      // Photos are drawn into a canvas for the PDF export.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Public, non-secret runtime config for the browser.
  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ googleClientId: GOOGLE_CLIENT_ID });
  });

  // Photos: /api/files/<name> -> Lambda GET /files/<name>
  app.get('/api/files/:name', async (req: Request, res: Response) => {
    if (!API_URL || !API_KEY) return notConfigured(res);
    const name = String(req.params.name || '');
    if (!FILE_RE.test(name)) {
      res.status(404).end();
      return;
    }
    try {
      const upstream = await fetch(`${API_URL}/files/${name}`, {
        headers: { 'x-api-key': API_KEY },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      res.status(upstream.status);
      for (const header of ['content-type', 'cache-control', 'x-content-type-options']) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      upstreamFailed(res);
    }
  });

  // Data API: POST /api/<route> -> Lambda POST /<route>
  app.post(
    '/api/:route',
    express.text({ type: '*/*', limit: '1mb' }),
    async (req: Request, res: Response) => {
      if (!API_URL || !API_KEY) return notConfigured(res);
      const route = String(req.params.route || '');
      if (!ROUTE_RE.test(route)) {
        res.status(404).json({ status: 404, id_usuario: '', message: 'Rota não encontrada' });
        return;
      }
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
      };
      const auth = req.get('authorization');
      if (auth) headers.authorization = auth;
      try {
        const upstream = await fetch(`${API_URL}/${route}`, {
          method: 'POST',
          headers,
          body: typeof req.body === 'string' && req.body ? req.body : '{}',
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.send(await upstream.text());
      } catch {
        upstreamFailed(res);
      }
    }
  );

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ status: 404, id_usuario: '', message: 'Rota não encontrada' });
  });

  if (IS_PROD) {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PetMood listening on :${PORT} (${IS_PROD ? 'production' : 'development'})`);
    if (!API_URL || !API_KEY) console.warn('PETMOOD_API_URL / PETMOOD_API_KEY not set: /api/* will answer 503.');
    if (!GOOGLE_CLIENT_ID) console.warn('GOOGLE_CLIENT_ID not set: Google sign-in is disabled.');
  });
}

void main();
