import { lookup } from 'node:dns/promises';
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
function publicAddress(ip: string) {
  const a = ip.split('.').map(Number);
  if (a.length === 4) {
    const [x,y] = a;
    if ([0,10,127].includes(x) || x >= 224 || x === 169 && y === 254
      || x === 172 && y >= 16 && y <= 31 || x === 192 && y === 168
      || x === 100 && y >= 64 && y <= 127 || x === 198 && (y === 18 || y === 19)
      || x === 192 && y === 0 || x === 192 && y === 0
      || x === 192 && y === 0 || x === 192 && y === 0) return false;
    return true;
  }
  const lower = ip.toLowerCase();
  return !(lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd')
    || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')
    || lower.startsWith('::ffff:127.') || lower.startsWith('::ffff:10.')
    || lower.startsWith('::ffff:192.168.') || lower.startsWith('::ffff:172.'));
}
async function readHeadPage(page: URL) {
  const entries = await lookup(page.hostname, { all:true });
  if (!entries.length || entries.some(entry => !publicAddress(entry.address))) {
    throw new Error('This source does not resolve to a public media website.');
  }
  const response = await fetch(page, {
    method:'GET', redirect:'manual', signal:AbortSignal.timeout(5000),
    headers:{ Accept:'text/html' },
  });
  if (response.status >= 300 && response.status < 400) throw new Error('Source redirected. Paste its final public URL instead.');
  if (!response.ok) throw new Error('The public source page could not be loaded.');
  const type = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(type)) throw new Error('The source is not an HTML page with public media metadata.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The media page did not provide content.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < 65536) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      length += result.value.byteLength;
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const combined = new Uint8Array(Math.min(length, 65536));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, combined.length - offset);
    combined.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(combined);
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
