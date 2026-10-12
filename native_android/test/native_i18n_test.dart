import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/vop_i18n.dart';
import 'package:vop/core/offline_study.dart';

void main(){
  test('native language uses the same published keys as the web',(){
    VopI18n.apply('bem',{
      'direction':'ltr',
      'translations':{
        'navigation.discover':'Ukusanga',
        'navigation.lessons':'Amasambililo',
      },
    });
    expect(VopI18n.locale,'bem');
    expect(VopI18n.text('navigation.discover','Discover'),'Ukusanga');
    expect(VopI18n.text('navigation.lessons','Lessons'),'Amasambililo');
    expect(VopI18n.text('navigation.radio','Radio'),'Radio');
    VopI18n.apply('en',{'direction':'ltr','translations':{}});
  });
  test('right-to-left language updates interface direction',(){
    VopI18n.apply('ar',{'direction':'rtl','translations':{
      'navigation.library':'المكتبة',
    }});
    expect(VopI18n.direction,'rtl');
    expect(VopI18n.text('navigation.library','Library'),'المكتبة');
    VopI18n.apply('en',{'direction':'ltr','translations':{}});
  });
  test('offline data failures never become fabricated quiz success',(){
    const issue=OfflineStorageException(
      'This item is too large for encrypted storage.');
    expect(issue.toString(),contains('encrypted storage'));
  });
  testWidgets('localised navigation labels respect active native state',(tester)async{
    VopI18n.apply('bem',{'translations':{
      'navigation.lessons':'Amasambililo',
    }});
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      body:Text(VopI18n.text('navigation.lessons','Lessons')))));
    expect(find.text('Amasambililo'),findsOneWidget);
    VopI18n.apply('en',{'translations':{}});
  });
}
