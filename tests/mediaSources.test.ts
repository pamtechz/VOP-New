import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeHttpsMediaUrl, resolveMediaSource } from '../shared/mediaSources.ts';

test('rejects executable protocols, local network destinations and credentials', () => {
  for (const value of ['javascript:alert(1)','data:video/mp4;base64,AA==','http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://localhost/video.mp4','https://127.0.0.1/file.mp3','https://user:pass@example.com/audio.mp3',
    'https://[::1]/video.mp4','https://example.com:8080/audio.mp3','https://example.com/video.mp4#frag']) {
    assert.equal(isSafeHttpsMediaUrl(value), false, value);
    assert.equal(resolveMediaSource(value), null, value);
  }
});
test('uses canonical official player URLs rather than raw HTML', () => {
  assert.deepEqual(resolveMediaSource('https://youtu.be/dQw4w9WgXcQ')?.url,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(resolveMediaSource('https://www.tiktok.com/@account/video/6718335390845095173')?.url,
    'https://www.tiktok.com/player/v1/6718335390845095173');
  assert.equal(resolveMediaSource('https://www.instagram.com/reel/CaaBBc_1D2e/')?.kind,'embed');
  assert.equal(resolveMediaSource('https://www.facebook.com/example/videos/123456789')?.provider,'Facebook');
  assert.equal(resolveMediaSource('https://www.audioverse.org/en/media/12345')?.kind,'embed');
  assert.equal(resolveMediaSource('https://vimeo.com/149990492')?.url,'https://player.vimeo.com/video/149990492');
});
test('accepts direct HTTPS media without treating arbitrary pages as video files', () => {
  assert.equal(resolveMediaSource('https://cdn.example.com/message.mp4?token=x')?.kind,'direct-video');
  assert.equal(resolveMediaSource('https://cdn.example.com/message.mp3')?.kind,'direct-audio');
  assert.equal(resolveMediaSource('https://www.umtu.me/app')?.kind,'external');
  assert.equal(resolveMediaSource('https://blog.wordpress.com/post')?.kind,'external');
  assert.equal(resolveMediaSource('https://example.net/private/1234'),null);
  assert.equal(resolveMediaSource('https://evil-youtube.com/watch?v=dQw4w9WgXcQ'),null);
});
