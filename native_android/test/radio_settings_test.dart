import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/screens/radio_player_screen.dart';
import 'package:vop/theme/vop_theme.dart';

void main(){
  test('native player resolves direct HTTPS audio and video',(){
    expect(resolveRadioMedia({'audioUrl':'https://media.example.com/church.mp3'}).kind,
      RadioMediaKind.audio);
    expect(resolveRadioMedia({'videoUrl':'https://media.example.com/study.mp4'}).kind,
      RadioMediaKind.video);
    expect(resolveRadioMedia({'streamUrl':'https://stream.example.com/live.m3u8'}).kind,
      RadioMediaKind.video);
  });
  test('YouTube embeds in app and AudioVerse provides external CSP-safe playback',(){
    final youtube=resolveRadioMedia({
      'videoUrl':'https://www.youtube.com/watch?v=abcdefghijk'});
    expect(youtube.kind,RadioMediaKind.provider);
    expect(youtube.url!.host,'www.youtube-nocookie.com');
    final audioverse=resolveRadioMedia({
      'audioUrl':'https://www.audioverse.org/en/media/12345'});
    expect(audioverse.kind,RadioMediaKind.external);
    expect(audioverse.url!.host,'www.audioverse.org');
    expect(audioverse.url!.path,'/en/media/12345');
  });
  test('rejects HTTP, private networks, URLs with credentials and unrelated pages',(){
    for(final url in [
      'http://example.com/audio.mp3',
      'https://localhost/music.mp3',
      'https://127.0.0.1/media.mp4',
      'https://user:pass@example.com/a.mp4',
      'https://evil.internal/a.mp4',
      'https://example.com/unknown/article',
    ]){
      expect(resolveRadioMedia({'audioUrl':url}).kind,
        RadioMediaKind.unsupported,reason:url);
    }
  });
  test('automatic native provider and extensionless media identification',(){
    expect(resolveRadioMedia({
      'mediaUrl':'https://cdn.example.com/content?id=32&sig=abc',
      'mediaType':'audio',
    }).kind,RadioMediaKind.audio);
    expect(resolveRadioMedia({
      'mediaUrl':'https://cdn.example.com/content?id=14',
      'mediaType':'video',
    }).kind,RadioMediaKind.video);
    expect(resolveRadioMedia({
      'mediaUrl':'https://radio.example.com/master.m3u8',
      'mediaType':'stream',
    }).kind,RadioMediaKind.video);
    final soundcloud=resolveRadioMedia({
      'mediaUrl':'https://soundcloud.com/channel/episode',
      'mediaType':'embed',
    });
    expect(soundcloud.provider,'SoundCloud');
    expect(soundcloud.url!.host,'w.soundcloud.com');
    final tiktok=resolveRadioMedia({
      'mediaUrl':'https://www.tiktok.com/@church/video/6718335390845095173',
    });
    expect(tiktok.provider,'TikTok');
    final insta=resolveRadioMedia({
      'mediaUrl':'https://www.instagram.com/reel/CaaBBc_1D2e/',
    });
    expect(insta.provider,'Instagram');
    final facebook=resolveRadioMedia({
      'mediaUrl':'https://www.facebook.com/page/videos/123456789',
    });
    expect(facebook.provider,'Facebook');
  });
  test('web-backed appearance applies theme/accessibility on Android',(){
    VopAppearance.apply({'theme':'dark','accessibility':{
      'largeText':true,'reducedMotion':true,'highContrast':true,
    }});
    expect(VopAppearance.mode.value,ThemeMode.dark);
    expect(VopAppearance.largerText.value,true);
    expect(VopAppearance.reducedMotion.value,true);
    expect(VopAppearance.highContrast.value,true);
    VopAppearance.apply({'theme':'system','accessibility':{
      'largeText':false,'reducedMotion':false,'highContrast':false,
    }});
    expect(VopAppearance.mode.value,ThemeMode.system);
  });
}
