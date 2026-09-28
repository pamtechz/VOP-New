import React from 'react';
import { resolveMediaSource } from '../../../shared/mediaSources';

interface Props { src?: string; title?: string; kind?: 'audio' | 'video' | 'any' }
export function MediaPlayer({ src, title = 'Media', kind = 'any' }: Props) {
  const source = resolveMediaSource(src);
  if (!src) return null;
  if (!source) return <p role="alert">This source is not an approved playable media URL. Ask the publisher for an official HTTPS embed or direct media file.</p>;
  if (source.kind === 'external') return <p><a href={source.url} target="_blank" rel="noopener noreferrer">Open {source.provider} content on its original site</a> (no public embedded media is available).</p>;
  if (kind === 'audio' && source.kind === 'direct-video') return <p>Choose an audio source for this field.</p>;
  if (kind === 'video' && source.kind === 'direct-audio') return <p>Choose a video source for this field.</p>;
  if (source.kind === 'direct-audio') {
    return <audio controls preload="metadata" src={source.url} aria-label={title} style={{ width:'100%', minHeight:44 }} />;
  }
  if (source.kind === 'direct-video') {
    return <video controls playsInline preload="metadata" src={source.url} aria-label={title} style={{ width:'100%', aspectRatio:'16 / 9', background:'#051530', borderRadius:12 }} />;
  }
  return <iframe
    src={source.url}
    title={title + ' — ' + source.provider}
    loading="lazy"
    referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    allowFullScreen
    style={{ width:'100%', aspectRatio:'16 / 9', maxHeight:560, border:0, borderRadius:12, background:'#061a35' }}
  />;
}
