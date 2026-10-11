import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSafeHttpsMediaUrl, resolveMediaSource, identifyRadioMedia, resolvedRadioRecord, parseAudioVerseEmbedCode } from '../shared/mediaSources.ts';

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

test('automatic provider identification determines the destination field and category', () => {
  const examples = [
    ['https://youtu.be/dQw4w9WgXcQ','youtube','videoUrl'],
    ['https://www.audioverse.org/en/media/12345','audioverse','audioUrl'],
    ['https://cdn.example.com/podcast.m4a?signature=abc','audio','audioUrl'],
    ['https://cdn.example.com/sermon.mp4','video','videoUrl'],
    ['https://radio.example.com/live.m3u8','stream','streamUrl'],
    ['https://www.soundcloud.com/channel/episode','embed','audioUrl'],
    ['https://www.tiktok.com/@channel/video/6718335390845095173','embed','videoUrl'],
  ] as const;
  for(const [url,type,field] of examples){
    const media=resolveMediaSource(url);
    assert.ok(media, 'Expected supported source '+url);
    const result=identifyRadioMedia(media);
    assert.equal(result.mediaType,type,url);
    assert.equal(result.field,field,url);
    assert.equal(result.sourceUrl,url);
  }
});
test('legacy records and server-confirmed extensionless sources remain playable',()=>{
  assert.equal(resolvedRadioRecord({audioUrl:'https://cdn.example.com/talk.mp3'})?.mediaType,'audio');
  assert.equal(resolvedRadioRecord({mediaUrl:'https://cdn.example.com/file?signature=1',mediaType:'audio'})?.field,'audioUrl');
  assert.equal(resolvedRadioRecord({mediaUrl:'https://cdn.example.com/watch?id=4',mediaType:'video'})?.field,'videoUrl');
  assert.equal(resolvedRadioRecord({mediaUrl:'https://cdn.example.com/live',mediaType:'stream'})?.field,'streamUrl');
  assert.equal(resolvedRadioRecord({mediaUrl:'https://example.com/article'})?.mediaType,undefined);
});

test('AudioVerse frame-ancestors restriction is respected in every web player', () => {
  const read=(path:string)=>readFileSync(path,'utf8');
  const player=read('src/components/media/MediaPlayer.tsx');
  const radio=read('src/pages/RadioPage.tsx');
  const admin=read('src/pages/AdminRecordsPanel.tsx');
  const fallback=read('src/components/media/ProviderPlaybackNotice.tsx');
  assert.match(player,/source\.provider === 'AudioVerse'/);
  assert.match(player,/<ProviderPlaybackNotice/);
  assert.match(radio,/source\?\.provider === 'audioverse' && <ProviderPlaybackNotice/);
  assert.doesNotMatch(radio,/source\?\.provider === 'audioverse' && <iframe/);
  assert.doesNotMatch(admin,/provider === 'AudioVerse'[\s\S]{0,280}<iframe/);
  assert.match(admin,/provider === 'AudioVerse'[\s\S]{0,150}<MediaPlayer/);
  assert.match(fallback,/rel="noopener noreferrer"/);
  assert.match(fallback,/isSafeHttpsMediaUrl\(sourceUrl\)/);
});

test('AudioVerse audio embed code extracts only approved HTTPS player URLs', () => {
  const allowed='https://www.audioverse.org/en/embed/media/12345';
  assert.equal(parseAudioVerseEmbedCode('<iframe width="100%" src="'+allowed+'" allow="autoplay"></iframe>'),allowed);
  assert.equal(parseAudioVerseEmbedCode(allowed),allowed);
  assert.equal(parseAudioVerseEmbedCode(''), '');
  assert.throws(()=>parseAudioVerseEmbedCode('<iframe src="https://evil.example/embed/media/12345"></iframe>'));
  assert.throws(()=>parseAudioVerseEmbedCode('<script src="https://www.audioverse.org/en/embed/media/12345"></script>'));
  assert.throws(()=>parseAudioVerseEmbedCode('http://www.audioverse.org/en/embed/media/12345'));
  assert.throws(()=>parseAudioVerseEmbedCode('https://www.audioverse.org/en/media/12345'));
});
