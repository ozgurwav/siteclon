import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import apiHandler from '../server/expressApp.js';

export const runtime = 'nodejs';

// Ensure Stripe webhook raw-body route works.
export const config = {
  api: { bodyParser: false },
};

/** Vercel rewrite passes `:splat*` as query; restore so Express routes match `/api/...`. */
function restoreUrlFromVercelApiRewrite(req: IncomingMessage) {
  const raw = req.url || '/';
  try {
    const host = String(req.headers.host || 'localhost').split(',')[0].trim();
    const u = new URL(raw, `http://${host}`);
    if (!u.searchParams.has('splat')) return;

    const splat = u.searchParams.get('splat') ?? '';
    u.searchParams.delete('splat');
    const qs = u.searchParams.toString();
    const suffix = qs ? `?${qs}` : '';

    if (splat === '') req.url = '/api' + suffix;
    else req.url = '/api/' + splat.replace(/^\/+/, '') + suffix;
  } catch {
    /* ignore malformed URL */
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  restoreUrlFromVercelApiRewrite(req);
  return apiHandler(req, res);
}

