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
  test('official YouTube and AudioVerse provider embeds are in app',(){
    final youtube=resolveRadioMedia({
      'videoUrl':'https://www.youtube.com/watch?v=abcdefghijk'});
    expect(youtube.kind,RadioMediaKind.provider);
    expect(youtube.url!.host,'www.youtube-nocookie.com');
    final audioverse=resolveRadioMedia({
      'audioUrl':'https://www.audioverse.org/en/media/12345'});
    expect(audioverse.kind,RadioMediaKind.provider);
    expect(audioverse.url!.host,'www.audioverse.org');
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
