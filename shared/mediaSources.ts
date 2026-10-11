/**
 * Explicit, normalized browser playback URLs. Never load arbitrary iframe HTML.
 * Private/social account content is not downloaded or bypassed.
 */
export type MediaKind = 'direct-audio' | 'direct-video' | 'embed' | 'external';
export type ResolvedMedia = { kind: MediaKind; provider: string; url: string; originalUrl: string };
const isHost = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);
export function isSafeHttpsMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password
      && (!u.port || u.port === '443')
      && !u.hash
      && host !== 'localhost' && !host.endsWith('.localhost')
      && !host.endsWith('.local') && !host.endsWith('.internal')
      && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
      && host !== '[::1]' && !host.startsWith('[');
  } catch { return false; }
}
export function resolveMediaSource(value: unknown): ResolvedMedia | null {
  if (!isSafeHttpsMediaUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const originalUrl = url.toString();
  const embed = (provider: string, source: string): ResolvedMedia =>
    ({ kind: 'embed', provider, url: source, originalUrl });
  if (host === 'youtu.be' || isHost(host, 'youtube.com') || isHost(host, 'youtube-nocookie.com')) {
    const id = host === 'youtu.be' ? path.split('/')[1]
      : path === '/watch' ? url.searchParams.get('v')
      : path.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? embed('YouTube', 'https://www.youtube-nocookie.com/embed/' + id)
      : null;
  }
  if (isHost(host, 'audioverse.org')) {
    const id = path.match(/\/(?:media|teachings)\/(\d+)(?:\/|$)/i)?.[1]
      || path.match(/\/embed\/media\/(\d+)(?:\/|$)/i)?.[1];
    return id ? embed('AudioVerse', 'https://www.audioverse.org/en/embed/media/' + id) : null;
  }
  if (isHost(host, 'tiktok.com')) {
    const id = path.match(/^\/@[^/]+\/video\/(\d+)(?:\/|$)/)?.[1]
      || path.match(/^\/player\/v1\/(\d+)(?:\/|$)/)?.[1];
    return id ? embed('TikTok', 'https://www.tiktok.com/player/v1/' + id) : null;
  }
  if (isHost(host, 'instagram.com')) {
    const match = path.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]{5,30})(?:\/|$)/);
    return match ? embed('Instagram', `https://www.instagram.com/${match[1]}/${match[2]}/embed/`) : null;
  }
  if (isHost(host, 'facebook.com') || isHost(host, 'fb.watch')) {
    const media = path.includes('/videos/') || path.includes('/reel/') || path === '/watch/' || path === '/watch';
    if (!media || (path.startsWith('/watch') && !/^\d+$/.test(url.searchParams.get('v') || ''))) return null;
    return embed('Facebook', 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(originalUrl) + '&show_text=0');
  }
  if (isHost(host, 'vimeo.com')) {
    const id = path.match(/^\/(?:video\/)?(\d+)(?:\/|$)/)?.[1];
    return id ? embed('Vimeo', 'https://player.vimeo.com/video/' + id) : null;
  }
  if (isHost(host, 'soundcloud.com')) {
    return embed('SoundCloud', 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(originalUrl));
  }
  // Streaming manifests are identified without requiring an admin to select
  // a separate media type. Their audio/video tracks are handled by the player.
  if (/\.(?:m3u8|mpd)$/i.test(path)) {
    return { kind: 'direct-video', provider: 'Live stream', url: originalUrl, originalUrl };
  }
  if (/\.(?:mp4|m4v|webm|ogv|mov)$/i.test(path)) {
    return { kind: 'direct-video', provider: 'Video file', url: originalUrl, originalUrl };
  }
  if (/\.(?:mp3|m4a|aac|ogg|oga|wav|opus)$/i.test(path)) {
    return { kind: 'direct-audio', provider: 'Audio file', url: originalUrl, originalUrl };
  }
  // A public page is a link until a trusted resolver extracts an actual playable
  // media URL. In particular, /app pages and private social posts are NOT files.
  if (isHost(host, 'umtu.me') || isHost(host, 'wordpress.com') || isHost(host, 'wordpress.tv')) {
    return { kind: 'external', provider: isHost(host, 'umtu.me') ? 'Umtu' : 'WordPress', url: originalUrl, originalUrl };
  }
  return null;
}

/** Deterministic classification shared by publishing UI and server.
 * Client-provided `mediaType` is never the authority for provider identity.
 */
export type IdentifiedRadioMedia = {
  mediaType: 'audio'|'video'|'stream'|'youtube'|'audioverse'|'embed';
  field: 'audioUrl'|'videoUrl'|'streamUrl';
  provider: string; sourceUrl: string; playbackUrl: string;
};
export function identifyRadioMedia(media: ResolvedMedia): IdentifiedRadioMedia {
  const sourceUrl = media.originalUrl;
  const stream = media.provider === 'Live stream' || /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(sourceUrl);
  const audioEmbed = ['AudioVerse','SoundCloud'].includes(media.provider);
  const mediaType = stream ? 'stream' : media.provider === 'YouTube' ? 'youtube'
    : media.provider === 'AudioVerse' ? 'audioverse'
    : media.kind === 'embed' ? 'embed'
    : media.kind === 'direct-audio' ? 'audio' : 'video';
  const field = stream ? 'streamUrl' : media.kind === 'direct-audio' || audioEmbed ? 'audioUrl' : 'videoUrl';
  return { mediaType, field, provider:media.provider, sourceUrl,
    playbackUrl:media.url };
}
/** Compatible with legacy records containing separate URL fields. */
export function resolvedRadioRecord(record: Record<string, unknown>): IdentifiedRadioMedia | null {
  for (const field of ['streamUrl','videoUrl','audioUrl','mediaUrl'] as const) {
    const url = String(record[field] || '').trim();
    if (!url) continue;
    const resolved = resolveMediaSource(url);
    if (resolved && resolved.kind !== 'external') {
      const classified = identifyRadioMedia(resolved);
      return field === 'streamUrl' ? {...classified,mediaType:'stream',field:'streamUrl'} : classified;
    }
    // Some station/live URLs have no extension. They must be deliberately
    // approved as streams by the server before saving; never iframe a webpage.
    if (field === 'streamUrl' && isSafeHttpsMediaUrl(url)) {
      return {mediaType:'stream',field:'streamUrl',provider:'Live stream',
        sourceUrl:url,playbackUrl:url};
    }
    // Metadata-verified URLs may have an extensionless path; mediaType was
    // written by the backend after inspecting the public Content-Type.
    if (isSafeHttpsMediaUrl(url) &&
        ['audio','video','stream'].includes(String(record.mediaType||''))) {
      const kind = String(record.mediaType);
      const typedField = kind==='audio'?'audioUrl':kind==='stream'?'streamUrl':'videoUrl';
      return {mediaType:kind as 'audio'|'video'|'stream',field:typedField,
        provider:kind==='stream'?'Live stream':kind==='audio'?'Audio file':'Video file',
        sourceUrl:url,playbackUrl:url};
    }
  }
  return null;
}

/** Accept AudioVerse's published iframe Audio Embed Code without persisting or
 * executing arbitrary HTML. Only a vetted HTTPS player URL is stored. */
export function parseAudioVerseEmbedCode(value: unknown): string {
  if(value==null || value==='')return '';
  if(typeof value!=='string' || value.length>8192)throw new Error('Invalid AudioVerse embed code.');
  const trimmed=value.trim();
  const match=trimmed.match(/<(?:iframe|audio)\b[^>]*?\bsrc\s*=\s*(["'])(https:\/\/[^"']+)\1/i);
  const source=match?.[2] || (/^https:\/\//i.test(trimmed) ? trimmed : '');
  if(!isSafeHttpsMediaUrl(source))throw new Error('AudioVerse embed requires a public HTTPS player URL.');
  const url=new URL(source);
  const host=url.hostname.toLowerCase();
  if(!isHost(host,'audioverse.org') ||
    !/(?:^|\/)(?:embed|player)(?:\/|$)/i.test(url.pathname)) {
    throw new Error('Use the Audio Embed Code supplied by AudioVerse.');
  }
  return url.toString();
}


/** Parse public publisher metadata and provider-approved player URLs only.
 * Never persist provider HTML, scripts, or arbitrary iframe attributes.
 */
export type PublishedMediaDetails = {
  title?: string;
  speaker?: string;
  description?: string;
  posterUrl?: string;
  embedUrl?: string;
};
export function extractPublishedMediaDetails(html: string, originalUrl: string): PublishedMediaDetails {
  if (!isSafeHttpsMediaUrl(originalUrl) || typeof html !== 'string') return {};
  const source = new URL(originalUrl);
  const attribute = (tag: string, name: string) =>
    tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27)', 'i'))
      ?.slice(1).find(Boolean) || '';
  const decode = (value: string) => value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, number: string) => {
      const value = number[0].toLowerCase() === 'x'
        ? Number.parseInt(number.slice(1), 16) : Number(number);
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value) : match;
    })
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi, entity =>
      ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})
        [entity.toLowerCase() as '&amp;'|'&quot;'|'&apos;'|'&lt;'|'&gt;'|'&nbsp;'] || entity);
  const clean = (value: string, limit: number) =>
    decode(value).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,limit);
  const metadata = new Map<string,string>();
  for (const tag of html.match(/<meta\b[^>]{0,1800}>/gi) || []) {
    const key = attribute(tag,'property') || attribute(tag,'name');
    const content = attribute(tag,'content');
    if (key && content && !metadata.has(key.toLowerCase())) metadata.set(key.toLowerCase(), content);
  }
  const first = (...keys: string[]) => keys.map(key=>metadata.get(key)).find(Boolean) || '';
  const titleTag = html.match(/<title\b[^>]*>([\s\S]{0,500}?)<\/title>/i)?.[1] || '';
  const title = clean(first('og:title','twitter:title') || titleTag,160);
  const speaker = clean(first('article:author','author','music:musician','dc.creator'),120);
  const description = clean(first('og:description','description','twitter:description'),3000);
  const rawPoster = decode(first('og:image:secure_url','og:image','twitter:image'));
  let posterUrl = '';
  if (rawPoster) {
    try {
      const candidate = new URL(rawPoster, source).toString();
      if (isSafeHttpsMediaUrl(candidate)) posterUrl = candidate;
    } catch { /* ignore invalid publisher image */ }
  }
  let embedUrl = '';
  if (isHost(source.hostname.toLowerCase(), 'audioverse.org')) {
    const mediaId = source.pathname.match(/\/(?:media|teachings)\/(\d+)(?:\/|$)/i)?.[1];
    for (const tag of html.match(/<iframe\b[^>]{0,2500}>/gi) || []) {
      const src = decode(attribute(tag,'src'));
      if (!src) continue;
      try {
        const candidate = new URL(src, source).toString();
        const approved = parseAudioVerseEmbedCode(candidate);
        const embeddedId = new URL(approved).pathname.match(/\/embed\/media\/(\d+)(?:\/|$)/i)?.[1];
        if (mediaId && embeddedId && mediaId !== embeddedId) continue;
        embedUrl = approved;
        break;
      } catch { /* never accept an unrelated iframe */ }
    }
  }
  return {
    ...(title ? {title}:{}),
    ...(speaker ? {speaker}:{}),
    ...(description ? {description}:{}),
    ...(posterUrl ? {posterUrl}:{}),
    ...(embedUrl ? {embedUrl}:{}),
  };
}
