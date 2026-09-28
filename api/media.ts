import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { authenticateTenant } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../shared/mediaSources.js';

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status: (code: number) => Response; json: (body: unknown) => void };

function hostAllowed(host: string) {
  const fixed = ['umtu.me', 'wordpress.com', 'wordpress.tv'];
  const custom = (process.env.VOP_TRUSTED_MEDIA_HOSTS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  // Custom sites are exact hostnames, never wildcard suffixes.
  return fixed.some(domain => host === domain || host.endsWith('.' + domain)) || custom.includes(host);
}
function publicAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return publicAddress(mapped[1]);
  const a = ip.split('.').map(Number);
  if (a.length === 4 && a.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [x,y,z] = a;
    return !(x === 0 || x === 10 || x === 127 || x >= 224
      || x === 100 && y >= 64 && y <= 127
      || x === 169 && y === 254
      || x === 172 && y >= 16 && y <= 31
      || x === 192 && y === 168
      || x === 192 && y === 0 && (z === 0 || z === 2)
      || x === 192 && y === 88 && z === 99
      || x === 198 && (y === 18 || y === 19 || y === 51 && z === 100)
      || x === 203 && y === 0 && z === 113);
  }
  const lower = ip.toLowerCase();
  // Global unicast only; block documentation, 6to4, Teredo, ULA, multicast,
  // link-local, loopback and IPv4-mapped IPv6 addresses.
  return /^[23][0-9a-f]{0,3}:/.test(lower) && !lower.startsWith('2001:db8:')
    && !lower.startsWith('2001:0:') && !lower.startsWith('2002:')
    && !lower.includes('::ffff:');
}
async function readHeadPage(page: URL) {
  const addresses = await lookup(page.hostname, { all:true });
  // Only public addresses are eligible. The request is pinned to the checked
  // address, avoiding a DNS-rebinding window between validation and connect.
  if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) {
    throw new Error('This source does not resolve to a public media website.');
  }
  const pinned = addresses[0];
  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const done = (error: Error | null, html?: string) => {
      if (finished) return;
      finished = true;
      if (error) reject(error);
      else resolve(html || '');
    };
    const req = httpsRequest(page, {
      method:'GET', timeout:5000, headers:{Accept:'text/html'},
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) {
        done(new Error('Source redirected. Paste its final public URL instead.')); response.destroy(); return;
      }
      if (status < 200 || status >= 300) {
        done(new Error('The public source page could not be loaded.')); response.destroy(); return;
      }
      if (!/text\/html/i.test(String(response.headers['content-type'] || ''))) {
        done(new Error('The source is not an HTML page with public media metadata.')); response.destroy(); return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (piece: Buffer) => {
        if (finished) return;
        const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
        const remaining = 65536 - total;
        if (remaining > 0) { chunks.push(chunk.subarray(0, remaining)); total += Math.min(chunk.length, remaining); }
        if (total >= 65536) {
          done(null, Buffer.concat(chunks).toString('utf8'));
          response.destroy();
        }
      });
      response.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      response.on('error', error => done(error));
    });
    req.on('timeout', () => req.destroy(new Error('The media source did not respond in time.')));
    req.on('error', error => done(error));
    req.end();
  });
}
function extractPublicMedia(html: string, source: URL) {
  const metas = html.match(/<meta\b[^>]{0,1800}>/gi) || [];
  const urls: string[] = [];
  const keys = new Set(['og:video:secure_url','og:video:url','og:video','og:audio:secure_url','og:audio:url','og:audio','twitter:player:stream']);
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27)', 'i'))?.slice(1).find(Boolean) || '';
  for (const tag of metas) {
    const key = (attr(tag,'property') || attr(tag,'name')).toLowerCase();
    if (!keys.has(key)) continue;
    const content = attr(tag,'content').replace(/&amp;/g,'&').replace(/&#38;/g,'&');
    if (content) urls.push(content);
  }
  // WordPress and other approved public pages sometimes expose HTML5
  // <video>/<audio> instead of OpenGraph. Read URL attributes only, never HTML.
  const mediaTags = html.match(/<(?:video|audio|source)\b[^>]{0,1800}>/gi) || [];
  for (const tag of mediaTags) {
    const src = attr(tag, 'src').replace(/&amp;/g, '&').replace(/&#38;/g, '&');
    if (src) urls.push(src);
  }
  for (const candidate of urls) {
    try {
      const url = new URL(candidate, source);
      if (!isSafeHttpsMediaUrl(url.toString())) continue;
      const media = resolveMediaSource(url.toString());
      if (media && media.kind !== 'external') return media;
    } catch { /* ignore malformed metadata */ }
  }
  throw new Error('No publicly playable media was exposed by this page. Use an official embed or direct media link; private content cannot be extracted.');
}
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const ctx = await authenticateTenant(req, typeof body.organizationId === 'string' ? body.organizationId : undefined);
    if (!ctx.isSuperAdmin) {
      // Resolve metadata only for a tenant user authorized to create course or radio content.
      try { await requirePermission(ctx, 'curriculum', 'create'); }
      catch { await requirePermission(ctx, 'radio', 'create'); }
    }
    const source = String(body.url || '').trim();
    if (!isSafeHttpsMediaUrl(source)) throw new Error('Use a public HTTPS media URL without credentials, local addresses, fragments or unusual ports.');
    const direct = resolveMediaSource(source);
    if (direct && direct.kind !== 'external') return res.status(200).json({ ok:true, media:direct });
    const parsed = new URL(source);
    if (!hostAllowed(parsed.hostname.toLowerCase())) throw new Error('This provider does not offer an approved player. Only approved public sites can be inspected.');
    const html = await readHeadPage(parsed);
    const media = extractPublicMedia(html, parsed);
    return res.status(200).json({ ok:true, media });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resolve the media source.';
    return res.status(400).json({ error:message });
  }
}
