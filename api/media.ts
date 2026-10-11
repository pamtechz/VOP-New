import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { authenticateTenant } from '../server/tenant.js';
import { requirePermission } from '../server/permissions.js';
import { isSafeHttpsMediaUrl, resolveMediaSource, extractPublishedMediaDetails } from '../shared/mediaSources.js';
import type { ResolvedMedia, PublishedMediaDetails } from '../shared/mediaSources.js';

type InspectedMedia = ResolvedMedia & PublishedMediaDetails;

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
async function readHeadPage(page: URL, timeoutMs = 5000) {
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
      method:'GET', timeout:timeoutMs, headers:{Accept:'text/html'},
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
function extractPublicMedia(html: string, source: URL): InspectedMedia {
  const details = extractPublishedMediaDetails(html, source.toString());
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
  for (const tag of html.match(/<iframe\b[^>]{0,1800}>/gi) || []) {
    const src = attr(tag, 'src').replace(/&amp;/g, '&').replace(/&#38;/g, '&');
    if (!src) continue;
    try {
      const candidate = new URL(src, source).toString();
      if (resolveMediaSource(candidate)?.kind === 'embed') urls.push(candidate);
    } catch { /* ignore invalid publisher iframe */ }
  }
  for (const candidate of urls) {
    try {
      const url = new URL(candidate, source);
      if (!isSafeHttpsMediaUrl(url.toString())) continue;
      const media = resolveMediaSource(url.toString());
      if (media && media.kind !== 'external') return {...media, ...details};
    } catch { /* ignore malformed metadata */ }
  }
  throw new Error('No publicly playable media was exposed by this page. Use an official embed or direct media link; private content cannot be extracted.');
}

/** HEAD-only verification for extensionless HTTPS CDN and station links.
 * The DNS lookup is pinned to a public address, no redirects or body reads.
 */
async function probeMediaContentType(source: URL): Promise<string> {
  const addresses=await lookup(source.hostname,{all:true});
  if(!addresses.length || addresses.some(address=>!publicAddress(address.address))) {
    throw new Error('The media host must resolve only to public internet addresses.');
  }
  const pinned=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(source,{
      method:'HEAD',timeout:4500,headers:{Accept:'audio/*, video/*, application/vnd.apple.mpegurl, application/dash+xml'},
      lookup:(_host,_opts,cb)=>cb(null,pinned.address,pinned.family),
    },response=>{
      const status=response.statusCode||0;
      response.destroy();
      if(status>=300&&status<400){reject(new Error('Media redirects. Paste its final public HTTPS URL.'));return;}
      if(status===405||status===501){reject(new Error('This media host does not support metadata inspection. Provide a direct media link with a known file extension.'));return;}
      if(status<200||status>=300){reject(new Error('This media URL is not publicly accessible.'));return;}
      resolve(String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase());
    });
    req.on('timeout',()=>req.destroy(new Error('Media metadata inspection timed out.')));
    req.on('error',reject);
    req.end();
  });
}
export async function identifyPublicMedia(source: string): Promise<InspectedMedia> {
  if(!isSafeHttpsMediaUrl(source))throw new Error('Use a safe public HTTPS media link.');
  const known=resolveMediaSource(source);
  const parsed=new URL(source);
  if(known&&known.kind!=='external'){
    if(!['AudioVerse','YouTube','Vimeo','SoundCloud'].includes(known.provider))return known;
    let details:PublishedMediaDetails={};
    const host=parsed.hostname.toLowerCase();
    const metadataHost=['audioverse.org','youtube.com','youtu.be','vimeo.com','soundcloud.com']
      .some(domain=>host===domain||host.endsWith('.'+domain));
    if(metadataHost && !/\/(?:embed|player)\//i.test(parsed.pathname)){
      try { details=extractPublishedMediaDetails(await readHeadPage(parsed,3200),source); }
      catch { /* official player URL is still usable without optional metadata */ }
    }
    return {...known,...details,...(known.provider==='AudioVerse'
      ? {embedUrl:details.embedUrl||known.url}: {})};
  }
  // Try the original URL's Content-Type before HTML page parsing. Only HEAD
  // requests are permitted to arbitrary public hosts.
  let headError:Error|null=null;
  try{
    const type=await probeMediaContentType(parsed);
    if(type.startsWith('audio/'))return {
      kind:'direct-audio' as const,provider:'Audio file',url:source,originalUrl:source,
    };
    if(type.startsWith('video/'))return {
      kind:'direct-video' as const,provider:'Video file',url:source,originalUrl:source,
    };
    if(['application/vnd.apple.mpegurl','application/x-mpegurl',
      'application/dash+xml'].includes(type))return {
      kind:'direct-video' as const,provider:'Live stream',url:source,originalUrl:source,
    };
  }catch(reason){headError=reason instanceof Error?reason:new Error('Media inspection failed.');}
  if(!hostAllowed(parsed.hostname.toLowerCase())) {
    throw headError || new Error('The URL is not a recognised playable audio/video source. Use a public direct media URL or supported provider.');
  }
  // Untrusted HTML or redirects never load from arbitrary hosts.
  const html=await readHeadPage(parsed);
  return extractPublicMedia(html,parsed);
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
    const media=await identifyPublicMedia(source);
    return res.status(200).json({ok:true,media});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resolve the media source.';
    return res.status(400).json({ error:message });
  }
}
