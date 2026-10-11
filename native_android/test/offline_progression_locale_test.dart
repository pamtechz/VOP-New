import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/vop_i18n.dart';
import 'package:vop/theme/vop_theme.dart';

void main(){
  test('native UI uses published VOP translation values and safe fallback',(){
    const bundle=VopLocaleBundle('bem',{
      'navigation.discover':'Ukusanga',
      'navigation.lessons':'Amasambililo',
    });
    expect(bundle.text('navigation.discover','Discover'),'Ukusanga');
    expect(bundle.text('navigation.lessons','Lessons'),'Amasambililo');
    expect(bundle.text('navigation.prayer','Prayer'),'Prayer');
    expect(bundle.text('navigation.radio','Radio'),'Radio');
  });
  test('high contrast and reduced motion settings remain native',(){
    VopAppearance.apply({'theme':'dark','accessibility':{
      'largeText':true,'reducedMotion':true,'highContrast':true,
    }});
    expect(VopAppearance.mode.value,ThemeMode.dark);
    expect(VopAppearance.highContrast.value,isTrue);
    expect(VopAppearance.reducedMotion.value,isTrue);
    VopAppearance.apply({'theme':'system','accessibility':{}});
  });
}
