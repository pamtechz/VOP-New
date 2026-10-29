import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/lesson_section_studio.dart';

void main(){
  for(final width in [320.0,390.0,1100.0]){
    testWidgets('production-style lesson editor focuses selected page at $width px',
      (tester) async {
      tester.view.physicalSize=Size(width,820);
      tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final data=<String,dynamic>{
        'title':'We Can Believe In God','lessonNumber':'01',
        'guideId':'discover','language':'EN',
        'chapters':[{
          'id':'chapter-one','title':'Discover',
          'sections':[
            {'id':'section-one','title':'First section','document':[
              {'id':'block-one','type':'p','children':[{'text':'Beginning'}]}]},
            {'id':'section-two','title':'Evidence','document':[
              {'id':'block-two','type':'p','children':[{'text':'Reasoning'}]}]},
          ],
        }],
      };
      var changed=0,saved=0;
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:StatefulBuilder(
        builder:(context,rebuild)=>LessonSectionStudio(
          value:data,guideTitle:'Discover · EN',
          saving:false,dirty:changed>0,
          onChanged:()=>rebuild(()=>changed++),
          onSave:()=>saved++,onQuiz:(){},onAdvanced:(){},
        ),
      ))));
      expect(tester.takeException(),isNull);
      expect(find.text('LEARNER PAGES'),width>=770?findsOneWidget:findsNothing);
      final button=find.byKey(const ValueKey('page-button-section-two'));
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(tester.takeException(),isNull);
      // Change the focused page, never the previous page's document.
      await tester.ensureVisible(find.text('Insert'));
      await tester.tap(find.text('Insert'));
      await tester.pumpAndSettle();
      final insert=find.widgetWithText(OutlinedButton,'Paragraph');
      await tester.ensureVisible(insert);
      await tester.tap(insert);
      await tester.pumpAndSettle();
      final pages=((data['chapters'] as List).first['sections'] as List);
      expect(((pages.first as Map)['document'] as List).length,1);
      expect(((pages.last as Map)['document'] as List).length,2);
      expect(pages.first['id'],'section-one');
      expect(pages.last['id'],'section-two');
      expect(changed,greaterThan(0));
      expect(tester.takeException(),isNull);
      final update=find.text('Update').last;
      await tester.ensureVisible(update);
      await tester.tap(update);
      expect(saved,1);
    });
  }
}
