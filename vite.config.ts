import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parse as parseUrl } from 'node:url';

const LOCAL_API_PREFIX = '/api/';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function setNodeEnvForLocalApi(mode: string) {
  // Vite exposes only VITE_* variables to browser code. These values are
  // intentionally copied into process.env for the Node-side API handlers.
  // Never rename the Admin SDK credentials to VITE_*.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of [
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
    'FIREBASE_PROJECT_ID',
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }

  if (!chunks.length) return undefined;

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function createApiResponse(res: ServerResponse) {
  let statusCode = 200;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      if (res.headersSent) return;
      const payload = JSON.stringify(value);
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(payload);
    },
  };
}

function createLocalApiMiddleware(server: {
  ssrLoadModule: (url: string) => Promise<Record<string, unknown>>;
}) {
  return async (req, res, next) => {
    const requestUrl = req.url ?? '';
    if (!requestUrl.startsWith(LOCAL_API_PREFIX)) {
      next();
      return;
    }

    const { pathname } = parseUrl(requestUrl);
    const route = pathname
      ?.slice(LOCAL_API_PREFIX.length)
      .replace(/^\/+|\/+$/g, '');

    if (!route || !/^[A-Za-z0-9_/-]+$/.test(route)) {
      next();
      return;
    }

    const modulePath = '/api/' + route + '.ts';

    try {
      const module = await server.ssrLoadModule(modulePath);
      const handler = module.default;

      if (typeof handler !== 'function') {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'The local API route has no default handler.' }));
        return;
      }

      const body = await readBody(req);
      const response = createApiResponse(res);

      await (handler as (request: unknown, response: unknown) => Promise<unknown>)(
        {
          method: req.method,
          headers: req.headers,
          body,
          url: req.url,
        },
        response,
      );

      if (!res.writableEnded) {
        res.statusCode = 204;
        res.end();
      }
    } catch (error) {
      console.error('[local-api] ' + (req.method ?? 'GET') + ' ' + requestUrl, error);
      if (!res.headersSent) {
        res.statusCode = error instanceof Error && error.message === 'Request body is too large.' ? 413 : 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Local API request failed.',
        }));
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  setNodeEnvForLocalApi(mode);

  return {
    plugins: [
      react(),
      {
        name: 'vop-local-api',
        configureServer(server) {
          // Vercel supplies /api/* in production. Vite does not, so this
          // adapter makes the same TypeScript API handlers available locally.
          server.middlewares.use(createLocalApiMiddleware(server));
        },
      },
    ],
  };
});
